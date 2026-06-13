import {
  booleanAttribute,
  Directive,
  computed,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  inject,

  // Signals
  input,
  output,
  signal,
} from '@angular/core';

import type { DroppedFile, FileDropEvent, FilePickerOptions } from './files.types';
import {
  containsFiles,
  createHiddenFileInput,
  enforceMultiple,
  FILE_DND_IGNORE_SELECTOR,
  filterAcceptedFiles,
  filterHiddenFiles,
  readDroppedFiles,
  setDropEffect,
  toDroppedFiles,
} from './utils';
import { isPlatformBrowser } from '@angular/common';

export type { DroppedFile, FileDropEvent, FilePickerOptions } from './files.types';

@Directive({
  selector: '[dropZone]',
  exportAs: 'dropZone',
  host: {
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
    '(click)': 'onActivate($event)',
    '(keydown.enter)': 'onActivate($event)',
    '(keydown.space)': 'onActivate($event)',

    // Host activation
    '[attr.role]': 'hostActivationEnabled() ? "button" : null',
    '[attr.tabindex]': 'hostActivationEnabled() ? (disabled() ? "-1" : "0") : null',
    '[attr.aria-disabled]': 'hostActivationEnabled() && disabled() ? "true" : null',
    '[style.cursor]': 'hostCanOpenPicker() ? "pointer" : "auto"',

    // Global reset
    '(document:dragleave)': 'onDocumentDragLeave($event)',
    '(document:drop)': 'resetDragState()',
    '(document:dragend)': 'resetDragState()',
    '(window:blur)': 'resetDragState()',
  },
})
export class AngularFileDrop {
  destroyRef = inject(DestroyRef);

  /**
   * Whether multiple files can be selected.
   */
  multiple = input(true, { transform: booleanAttribute });

  /**
   * Allows dropped folders/directories to be traversed.
   *
   * This should NOT force the hidden file input into directory-picker mode.
   */
  directory = input(true, { transform: booleanAttribute });
  directoryPicker = input(false, { transform: booleanAttribute });

  /**
   * The accepted file types.
   */
  acceptedFiles = input('');
  ignoreHiddenFiles = input(true, { transform: booleanAttribute });
  clickable = input(true, { transform: booleanAttribute });
  disabled = input(false, { transform: booleanAttribute });
  isManualActivation = input(false, { transform: booleanAttribute });

  hostActivationEnabled = computed(() => this.clickable() && !this.isManualActivation());
  hostCanOpenPicker = computed(() => this.hostActivationEnabled() && !this.disabled());

  fileDrop = output<FileDropEvent>();
  dragEnter = output<DragEvent>();
  dragLeave = output<DragEvent>();
  dragOver = output<DragEvent>();

  #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ─── State ────────────────────────────────────────────────────────────────
  isDragOver = signal(false);

  el = inject<ElementRef<HTMLElement>>(ElementRef);
  hiddenInput?: HTMLInputElement;

  openPicker(event?: Event, options?: FilePickerOptions) {
    event?.preventDefault();

    if (this.disabled()) return;

    const input = this.getOrCreateFileInput();
    if (!input) return;

    this.syncInput(input, options);
    input.click();
  }

  openDirectoryPicker(event?: Event) {
    this.openPicker(event, { directory: true });
  }

  openFilePicker(event?: Event) {
    this.openPicker(event, { directory: false });
  }

  // ─── Host Events ──────────────────────────────────────────────────────────
  shouldIgnoreActivationTarget(event: Event) {
    const target = event.target as HTMLElement | null;
    const closestIgnore = target?.closest(FILE_DND_IGNORE_SELECTOR);
    // Ignore if an interactive child was clicked, but do not ignore if the host ITSELF is the button/link
    return !!closestIgnore && closestIgnore !== this.el.nativeElement;
  }

  onActivate(event: Event) {
    if (!this.hostCanOpenPicker() || this.shouldIgnoreActivationTarget(event)) return;
    this.openPicker(event);
  }

  onDragEnter(event: DragEvent) {
    if (!containsFiles(event) || event.defaultPrevented) return;
    if (this.disabled()) {
      this.resetDragState();
      return;
    }

    event.preventDefault();
    this.isDragOver.set(true);
    this.dragEnter.emit(event);
  }

  onDragOver(event: DragEvent) {
    if (!containsFiles(event) || event.defaultPrevented) return;
    if (this.disabled()) {
      event.preventDefault();
      setDropEffect(event, 'none');
      this.resetDragState();
      return;
    }

    event.preventDefault();

    // Mirror Dropzone.js effectAllowed logic
    try {
      const effect = event.dataTransfer!.effectAllowed;
      setDropEffect(event, effect === 'move' || effect === 'linkMove' ? 'move' : 'copy');
    } catch (error) {
      console.warn('[FileDnd] onDragOver effectAllowed error:', error);
    }

    this.isDragOver.set(true);
    this.dragOver.emit(event);
  }

  onDragLeave(event: DragEvent) {
    if (!containsFiles(event)) return;

    if (this.disabled()) {
      this.resetDragState();
      return;
    }

    event.preventDefault();

    const related = event.relatedTarget;

    if (!(related instanceof Node) || !this.el.nativeElement.contains(related)) {
      this.isDragOver.set(false);
      this.dragLeave.emit(event);
    }
  }

  // Global reset: if the drag leaves the browser window entirely, relatedTarget is null
  onDocumentDragLeave(event: DragEvent) {
    if (!containsFiles(event)) return; // Polish: ignore dragging text/links out of window
    if (!event.relatedTarget) this.resetDragState();
  }

  resetDragState() {
    this.isDragOver.set(false);
  }

  async onDrop(event: DragEvent) {
    if (!containsFiles(event)) return;

    // Another, more specific dropzone already handled it.
    if (event.defaultPrevented) {
      this.resetDragState();
      return;
    }

    if (this.disabled()) {
      event.preventDefault();
      this.resetDragState();
      return;
    }

    event.preventDefault();

    // Do not stop propagation; parent directives and document listeners can reset.
    this.resetDragState();

    const dt = event.dataTransfer;
    if (!dt) return;

    const dropped = await readDroppedFiles(dt, this.directory());

    const filtered = this.prepareFiles(dropped);
    if (filtered.length) this.fileDrop.emit({ files: filtered });
  }

  // ─── Hidden Input (Attached to Body) ──────────────────────────────────────
  syncInput(input: HTMLInputElement, options?: FilePickerOptions) {
    input.multiple = this.multiple();
    input.accept = this.acceptedFiles() ?? '';
    input.disabled = this.disabled();

    const useDirectoryPicker = options?.directory ?? this.directoryPicker();

    if (useDirectoryPicker) {
      input.setAttribute('webkitdirectory', '');
    } else {
      input.removeAttribute('webkitdirectory');
    }
  }

  getOrCreateFileInput() {
    if (!this.#isBrowser) return;
    if (this.hiddenInput) return this.hiddenInput;

    const input = createHiddenFileInput();
    this.syncInput(input);

    const onChange = () => {
      if (this.disabled()) {
        input.value = '';
        return;
      }

      const files = toDroppedFiles(input.files ?? []);

      const filtered = this.prepareFiles(files);
      if (filtered.length) this.fileDrop.emit({ files: filtered });

      // Clear the value so the exact same file(s) can be selected again
      input.value = '';
    };

    input.addEventListener('change', onChange);

    // Clean up the DOM element

    this.destroyRef.onDestroy(() => {
      input.removeEventListener('change', onChange);
      input.remove();
      this.hiddenInput = undefined;
    });

    this.hiddenInput = input;
    return input;
  }

  // ─── Validation ───────────────────────────────────────────────────────────
  prepareFiles(files: DroppedFile[]) {
    const visible = this.ignoreHiddenFiles() ? filterHiddenFiles(files) : files;
    const accepted = filterAcceptedFiles(visible, this.acceptedFiles());
    return enforceMultiple(accepted, this.multiple());
  }
}

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

// Across entry points, always by package name: a relative path here would
// bundle `core` a second time into this entry — two claim registries, and a
// claim made through one invisible to the other.
import {
  type DroppedFile,
  type FileDropEvent,
  type FilePickerOptions,
  claimDragEvent,
  containsFiles,
  createHiddenFileInput,
  dragFileTypes,
  enforceMultiple,
  FILE_DND_IGNORE_SELECTOR,
  filterAcceptedFiles,
  filterHiddenFiles,
  isDragEventClaimed,
  isNearestDropZone,
  readDroppedFiles,
  setDropEffect,
  toDroppedFiles,
} from '@h-k-dev/angular-file-drop/core';
import { isPlatformBrowser } from '@angular/common';

/** `dragTypes` is re-read on every `dragover` — every few pixels — and the
    list does not change mid-drag, so an equal list must not count as a
    change. */
const sameTypes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((type, i) => type === b[i]);

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

    // How one zone recognises another in the DOM, whatever the template
    // called the selector. `selfOnly` reads it, through the exported
    // DROP_ZONE_ATTRIBUTE — spelled out here because a host binding key has
    // to be a literal, so the two are kept in step by this comment alone.
    '[attr.data-drop-zone]': '""',

    // Host activation
    '[attr.role]': 'hostActivationEnabled() ? "button" : null',
    '[attr.tabindex]': 'hostActivationEnabled() ? (disabled() ? "-1" : "0") : null',
    '[attr.aria-disabled]': 'hostActivationEnabled() && disabled() ? "true" : null',
    // Only where a click does something. `null` removes the inline style, so
    // a host that cannot open a picker keeps whatever cursor its own
    // stylesheet gives it — `text` on an editing surface, say.
    '[style.cursor]': 'hostCanOpenPicker() ? "pointer" : null',

    // Global reset
    '(document:dragleave)': 'onDocumentDragLeave($event)',
    '(document:drop)': 'onDocumentDrop($event)',
    '(document:dragend)': 'resetDragState()',
    '(window:blur)': 'resetDragState()',

    // `preventDocumentDrop`. On the document because the drops it exists to
    // catch are the ones that missed this element, and last in the bubble
    // path because it has to know whether anything else wanted the drag.
    '(document:dragover)': 'onDocumentDragOver($event)',
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

  /**
   * Only respond to drags that land on this zone rather than on a dropzone
   * nested inside it.
   *
   * Nesting already works without this: an inner zone claims the event and
   * the outer one stands down. But that is a *behavioural* guarantee — it
   * depends on the inner zone actually handling the drop. Set `selfOnly` and
   * the guarantee becomes *structural*: a drop that lands inside a nested
   * zone is never this zone's, even if that zone is disabled, rejected every
   * file, or is still waiting on an async read.
   *
   * Use it for an outer zone that means something different from the inner
   * one — a page that imports a document, wrapped around an editor that
   * attaches files — where an outer zone quietly picking up the inner zone's
   * leftovers would be wrong rather than merely surprising.
   */
  selfOnly = input(false, { transform: booleanAttribute });

  /**
   * Stop the browser navigating away when a file is dropped on the page but
   * outside every dropzone.
   *
   * Miss the zone by a few pixels and the browser's own default takes over:
   * it opens the dropped file as if it were a link, and whatever the user
   * had unsaved on the page is gone. This turns that default off.
   *
   * The effect is document-wide, because the drops it catches are by
   * definition the ones that landed nowhere near this element — so set it on
   * the zone that owns the page, not on each of several zones. Off by
   * default: a directive on one widget should not quietly change how the
   * rest of the application behaves.
   *
   * A drag some handler has taken (`claimDragEvent()`), or so much as
   * accepted (`preventDefault()` on any of its events), is left alone. Only
   * drags nobody wanted are cancelled. Pair it with {@link dropMissed} to
   * say so: a file that vanishes without a word looks, from the user's side,
   * exactly like an upload that broke.
   */
  preventDocumentDrop = input(false, { transform: booleanAttribute });

  hostActivationEnabled = computed(() => this.clickable() && !this.isManualActivation());
  hostCanOpenPicker = computed(() => this.hostActivationEnabled() && !this.disabled());

  fileDrop = output<FileDropEvent>();
  dragEnter = output<DragEvent>();
  dragLeave = output<DragEvent>();
  dragOver = output<DragEvent>();

  /**
   * A file was dropped on the page but on no dropzone at all, and
   * `preventDocumentDrop` swallowed it rather than let the browser navigate.
   *
   * Without this, prevention is silent: the file simply vanishes, which from
   * the user's side is indistinguishable from a drop that failed. Use it to
   * say what happened — a toast, an inline notice, a nudge towards the zone.
   *
   * ```html
   * <div dropZone preventDocumentDrop (dropMissed)="toast('Drop files on the box')">
   * ```
   *
   * Fires only when the input is on and the drop was genuinely unclaimed, so
   * it is a miss and never a duplicate of `fileDrop`. The event has already
   * been cancelled; it is passed through so the handler can name what was
   * missed via `event.dataTransfer`. It carries no read files: the drop was
   * refused, and walking folders for something that was thrown away would be
   * work done to produce a list nobody asked for.
   */
  dropMissed = output<DragEvent>();

  #isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ─── State ────────────────────────────────────────────────────────────────
  /** `true` while a file drag this zone would take is over it. */
  isDragOver = signal(false);

  /**
   * The MIME types of the files in the drag over this zone — one entry per
   * file, in the order the browser lists them — while {@link isDragOver} is
   * true; empty otherwise.
   *
   * What a hint can be worded with before the drop: "Drop 3 images", "PDFs
   * become attachments". As far as the browser tells during a drag, that is:
   * names and contents are withheld until the drop, a type it does not know
   * is `''`, and a browser that exposes no items at all leaves this empty —
   * so treat the length as a count only when it is not 0, and never as a
   * verdict on `acceptedFiles`, which can name extensions this cannot see.
   */
  dragTypes = signal<readonly string[]>([], { equal: sameTypes });

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

  /**
   * Whether this zone should act on a drag event: it has to carry files, no
   * nested handler may have claimed it, and — under `selfOnly` — it has to
   * have landed on this zone rather than one inside it.
   *
   * Callers that already know the event carries files still get the check;
   * it is cheap, and the guarantee is easier to reason about than the
   * shortcut.
   */
  shouldHandle(event: DragEvent) {
    if (!containsFiles(event) || isDragEventClaimed(event)) return false;
    return !this.selfOnly() || isNearestDropZone(event, this.el.nativeElement);
  }

  onDragEnter(event: DragEvent) {
    if (!containsFiles(event)) return;
    // Declining is not the same as ignoring. The drag is inside this zone —
    // it just belongs to something nested — so any highlight this zone is
    // still showing is now a lie, and `dragleave` will not correct it: moving
    // from a zone into a child of that zone fires a leave whose relatedTarget
    // the zone still contains, which the leave handler (rightly) treats as
    // staying put.
    if (!this.shouldHandle(event)) {
      this.resetDragState();
      return;
    }
    if (this.disabled()) {
      this.resetDragState();
      return;
    }

    event.preventDefault();
    claimDragEvent(event);
    this.isDragOver.set(true);
    this.dragTypes.set(dragFileTypes(event));
    this.dragEnter.emit(event);
  }

  onDragOver(event: DragEvent) {
    if (!containsFiles(event)) return;
    // As above — and this is the one that actually rescues a stuck highlight,
    // because `dragover` keeps firing for as long as the pointer is moving.
    if (!this.shouldHandle(event)) {
      this.resetDragState();
      return;
    }
    if (this.disabled()) {
      event.preventDefault();
      setDropEffect(event, 'none');
      this.resetDragState();
      return;
    }

    event.preventDefault();
    claimDragEvent(event);

    // Mirror Dropzone.js effectAllowed logic
    try {
      const effect = event.dataTransfer!.effectAllowed;
      setDropEffect(event, effect === 'move' || effect === 'linkMove' ? 'move' : 'copy');
    } catch (error) {
      console.warn('[FileDnd] onDragOver effectAllowed error:', error);
    }

    this.isDragOver.set(true);
    this.dragTypes.set(dragFileTypes(event));
    this.dragOver.emit(event);
  }

  onDragLeave(event: DragEvent) {
    // Not `shouldHandle`: leaving is how a zone stops showing a drag it was
    // already showing, so it must not be gated on the claim (this zone may
    // be the one that claimed it) — only on `selfOnly`, which is structural.
    if (!containsFiles(event)) return;
    if (this.selfOnly() && !isNearestDropZone(event, this.el.nativeElement)) return;

    if (this.disabled()) {
      this.resetDragState();
      return;
    }

    event.preventDefault();

    const related = event.relatedTarget;

    if (!(related instanceof Node) || !this.el.nativeElement.contains(related)) {
      this.resetDragState();
      this.dragLeave.emit(event);
    }
  }

  // Global reset: if the drag leaves the browser window entirely, relatedTarget is null
  onDocumentDragLeave(event: DragEvent) {
    if (!containsFiles(event)) return; // Polish: ignore dragging text/links out of window
    if (!event.relatedTarget) this.resetDragState();
  }

  /**
   * Whether a drag that has reached the document — past every element
   * handler on the page — is one `preventDocumentDrop` should cancel.
   *
   * "Nobody wanted it" is the whole test. A drag some handler took is that
   * handler's business, and a drag of text or an in-page item was never the
   * browser-navigation hazard this input exists for.
   */
  shouldPreventDocumentDrop(event: DragEvent) {
    if (!this.preventDocumentDrop()) return false;
    // Claimed, or merely accepted. `preventDefault` on a drag event is not a
    // claim (see `isDragEventClaimed`), but it is somebody saying a drop may
    // land here — and that somebody may have set a drop effect this must not
    // overwrite. The drop itself is still cancelled if nobody takes it,
    // whatever was said during the drag: that is exactly the hazard.
    return containsFiles(event) && !isDragEventClaimed(event) && !event.defaultPrevented;
  }

  /**
   * Cancelling `dragover` is what makes the drop cancellable at all: leave
   * the default in place and the browser never fires `drop` on the document,
   * it simply navigates.
   *
   * The drop effect has to stay a real one. `'none'` would be the honest
   * cursor — it says "not here" while the drag is still in flight, and it
   * stops the navigation just as well — but under the HTML drag-and-drop
   * model a drag operation of `none` is cancelled outright: the browser
   * fires `dragleave` instead of `drop`. The page would swallow the file
   * silently and {@link dropMissed} would never arrive. Telling the user
   * what happened is worth more than a cursor that tells them early.
   */
  onDocumentDragOver(event: DragEvent) {
    if (!this.shouldPreventDocumentDrop(event)) return;
    event.preventDefault();
    setDropEffect(event, 'copy');
  }

  onDocumentDrop(event: DragEvent) {
    this.resetDragState();
    if (!this.shouldPreventDocumentDrop(event)) return;
    event.preventDefault();
    this.dropMissed.emit(event);
  }

  resetDragState() {
    this.isDragOver.set(false);
    this.dragTypes.set([]);
  }

  async onDrop(event: DragEvent) {
    if (!containsFiles(event)) return;

    // Another, more specific handler already took it — a nested dropzone, or
    // anything that called `claimDragEvent` / `preventDefault`. Under
    // `selfOnly`, a drop inside a nested zone is likewise not ours.
    if (!this.shouldHandle(event)) {
      this.resetDragState();
      return;
    }

    if (this.disabled()) {
      event.preventDefault();
      this.resetDragState();
      return;
    }

    event.preventDefault();
    claimDragEvent(event);

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

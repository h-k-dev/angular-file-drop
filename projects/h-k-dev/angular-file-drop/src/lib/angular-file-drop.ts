import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,

  // Signals
  input,
  output,
  signal,
} from '@angular/core';

export interface DroppedFile {
  file: File;
  relativePath: string;
}

export interface FileDropEvent {
  files: DroppedFile[];
}

export interface FilePickerOptions {
  /**
   * Allows dropped folders/directories to be traversed.
   *
   * This should NOT force the hidden file input into directory-picker mode.
   */
  directory?: boolean;
}

const FILE_DND_IGNORE_SELECTOR =
  'button,a,input,textarea,select,[contenteditable="true"],[data-file-dnd-ignore]';
@Component({
  selector: 'lib-angular-file-drop',
  imports: [],
  template: ` <p>angular-file-drop works!</p> `,
  styles: ``,
})
export class AngularFileDrop {
  destroyRef = inject(DestroyRef);

  multiple = input(true, { transform: booleanAttribute });

  /**
   * Allows dropped folders/directories to be traversed.
   *
   * This should NOT force the hidden file input into directory-picker mode.
   */
  directory = input(true, { transform: booleanAttribute });
  directoryPicker = input(false, { transform: booleanAttribute });

  acceptedFiles = input<string | null>(null);
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

  // ─── State ────────────────────────────────────────────────────────────────
  isDragOver = signal(false);

  el = inject<ElementRef<HTMLElement>>(ElementRef);
  hiddenInput?: HTMLInputElement;

  openPicker(event?: Event, options?: FilePickerOptions): void {
    event?.preventDefault();

    if (this.disabled()) return;

    const input = this.getOrCreateFileInput();
    this.syncInput(input, options);
    input.click();
  }

  openDirectoryPicker(event?: Event): void {
    this.openPicker(event, { directory: true });
  }

  openFilePicker(event?: Event): void {
    this.openPicker(event, { directory: false });
  }

  // ─── Host Events ──────────────────────────────────────────────────────────
  shouldIgnoreActivationTarget(event: Event): boolean {
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
    if (!this.containsFiles(event) || event.defaultPrevented) return;
    if (this.disabled()) {
      this.resetDragState();
      return;
    }

    event.preventDefault();
    this.isDragOver.set(true);
    this.dragEnter.emit(event);
  }

  setDropEffect(event: DragEvent, dropEffect: DataTransfer['dropEffect']): void {
    try {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = dropEffect;
      }
    } catch (error) {
      console.warn('[IustaFileDndDirective] setDropEffect error:', error);
    }
  }

  onDragOver(event: DragEvent) {
    if (!this.containsFiles(event) || event.defaultPrevented) return;
    if (this.disabled()) {
      event.preventDefault();
      this.setDropEffect(event, 'none');
      this.resetDragState();
      return;
    }

    event.preventDefault();

    // Mirror Dropzone.js effectAllowed logic
    try {
      const effect = event.dataTransfer!.effectAllowed;
      this.setDropEffect(event, effect === 'move' || effect === 'linkMove' ? 'move' : 'copy');
    } catch (error) {
      console.warn('[IustaFileDndDirective] onDragOver effectAllowed error:', error);
    }

    this.isDragOver.set(true);
    this.dragOver.emit(event);
  }

  onDragLeave(event: DragEvent) {
    if (!this.containsFiles(event)) return;

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
    if (!this.containsFiles(event)) return; // Polish: ignore dragging text/links out of window
    if (!event.relatedTarget) this.resetDragState();
  }

  resetDragState() {
    this.isDragOver.set(false);
  }

  async onDrop(event: DragEvent) {
    if (!this.containsFiles(event)) return;

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

    const items = Array.from(dt.items ?? []).filter((item) => item.kind === 'file');
    let dropped: DroppedFile[] = [];

    // Feature detection for the modern File System Access API
    const supportsHandles = items.length > 0 && 'getAsFileSystemHandle' in items[0];

    try {
      if (supportsHandles) {
        // Hardened: Wrap individual handle retrieval to prevent single-file failures from crashing Promise.all
        const handles = (
          await Promise.all(
            items.map(async (item) => {
              try {
                return (await (item as any).getAsFileSystemHandle()) as FileSystemHandle | null;
              } catch (err) {
                console.warn('[FileDnd] Failed to get handle for item:', err);
                return null;
              }
            }),
          )
        ).filter((h): h is FileSystemHandle => h !== null);

        dropped = await this.walkHandles(handles, '');
      }

      // Fallback 1: The old webkit API (still supports folders)
      else if (items.length && 'webkitGetAsEntry' in items[0]) {
        const entries = items
          .map((item) => item.webkitGetAsEntry())
          .filter((entry): entry is FileSystemEntry => entry !== null);

        dropped = await this.walkEntries(entries, '');
      }

      // Fallback 2: Basic FileList (no folder traversal support)
      else {
        dropped = Array.from(dt.files).map((file) => ({
          file,
          relativePath: file.name,
        }));
      }
    } catch (error) {
      console.error('[FileDnd] Error reading dropped files:', error);
    }

    const filtered = this.prepareFiles(dropped);
    if (filtered.length) this.fileDrop.emit({ files: filtered });
  }

  // ─── Modern FileSystemHandle Traversal ────────────────────────────────────
  async walkHandles(handles: FileSystemHandle[], basePath: string): Promise<DroppedFile[]> {
    const results: DroppedFile[] = [];

    for (const handle of handles) {
      try {
        if (handle.kind === 'file') {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          // Note: Optimization removed. prepareFiles() acts as the single source of truth for hidden files.
          results.push({ file, relativePath: basePath + file.name });
        } else if (handle.kind === 'directory') {
          // Gate directory traversal
          if (!this.directory()) {
            continue;
          }

          const dirHandle = handle as FileSystemDirectoryHandle;
          const dirPath = basePath + dirHandle.name + '/';

          const children: FileSystemHandle[] = [];

          for await (const [_, child] of (dirHandle as any).entries()) {
            children.push(child);
          }

          const childResults = await this.walkHandles(children, dirPath);
          results.push(...childResults);
        }
      } catch (err) {
        // Hardened: if one file is locked or requires permissions the user denied, just skip it
        console.warn(`[FileDnd] Skipped handle ${handle.name} due to error:`, err);
      }
    }

    return results;
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

  getOrCreateFileInput(): HTMLInputElement {
    if (this.hiddenInput) return this.hiddenInput;

    const input = document.createElement('input');
    input.type = 'file';

    // Apply stealth styles
    input.style.position = 'fixed';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';
    input.style.width = '0';
    input.style.height = '0';
    input.style.top = '0';
    input.style.left = '0';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    this.syncInput(input);

    // Append input to the document body to prevent void-element issues
    document.body.appendChild(input);

    const onChange = () => {
      if (this.disabled()) {
        input.value = '';
        return;
      }

      const files: DroppedFile[] = Array.from(input.files ?? []).map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));

      const filtered = this.prepareFiles(files);
      if (filtered.length) this.fileDrop.emit({ files: filtered });

      // Clear the value so the exact same file(s) can be selected again
      input.value = '';
    };

    input.addEventListener('change', onChange);

    this.destroyRef.onDestroy(() => {
      input.removeEventListener('change', onChange);
      // Clean up the DOM element
      input.remove();
      this.hiddenInput = undefined;
    });

    this.hiddenInput = input;
    return input;
  }

  // ─── FileSystemEntry Traversal ────────────────────────────────────────────
  walkEntries(entries: FileSystemEntry[], basePath: string): Promise<DroppedFile[]> {
    return Promise.all(entries.map((entry) => this.walkEntry(entry, basePath))).then((results) =>
      results.flat(),
    );
  }

  async walkEntry(entry: FileSystemEntry, basePath: string): Promise<DroppedFile[]> {
    try {
      if (entry.isFile) {
        return await this.resolveFileEntry(entry as FileSystemFileEntry, basePath);
      } else if (entry.isDirectory) {
        // Gate directory traversal
        if (!this.directory()) {
          return [];
        }
        return await this.resolveDirectoryEntry(entry as FileSystemDirectoryEntry, basePath);
      }
    } catch (err) {
      console.warn(`[FileDnd] Skipped entry ${entry.name} due to error:`, err);
    }
    return [];
  }

  shouldIgnorePath(relativePath: string): boolean {
    if (!this.ignoreHiddenFiles()) return false;

    return relativePath.split('/').some((part) => part.length > 1 && part.startsWith('.'));
  }

  resolveFileEntry(entry: FileSystemFileEntry, basePath: string): Promise<DroppedFile[]> {
    return new Promise((resolve) => {
      entry.file(
        (file) => {
          // Note: Optimization removed. prepareFiles() acts as the single source of truth for hidden files.
          resolve([{ file, relativePath: basePath + file.name }]);
        },
        (err) => {
          console.warn('[FileDnd] file entry error:', err);
          resolve([]);
        },
      );
    });
  }

  resolveDirectoryEntry(entry: FileSystemDirectoryEntry, basePath: string): Promise<DroppedFile[]> {
    const dirPath = basePath + entry.name + '/';
    const reader = entry.createReader();
    const collected: FileSystemEntry[] = [];

    return new Promise((resolve) => {
      const readBatch = () => {
        reader.readEntries(
          async (batch) => {
            if (batch.length === 0) {
              const results = await this.walkEntries(collected, dirPath);
              resolve(results);
            } else {
              collected.push(...batch);
              readBatch();
            }
          },
          (err) => {
            console.warn('[FileDnd] readEntries error:', err);
            resolve([]);
          },
        );
      };

      readBatch();
    });
  }

  // ─── Validation Helpers ───────────────────────────────────────────────────
  prepareFiles(files: DroppedFile[]): DroppedFile[] {
    return this.enforceMultiple(this.applyAcceptFilter(this.applyHiddenFilter(files)));
  }

  applyHiddenFilter(files: DroppedFile[]): DroppedFile[] {
    if (!this.ignoreHiddenFiles()) return files;
    return files.filter((f) => !this.shouldIgnorePath(f.relativePath));
  }

  containsFiles(event: DragEvent): boolean {
    if (!event.dataTransfer?.types) return false;
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  isValidFile(file: File): boolean {
    const acceptStr = this.acceptedFiles();
    if (!acceptStr) return true;

    const accepted = acceptStr
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const mime = (file.type || '').toLowerCase();
    const baseMime = mime.replace(/\/.*$/, '');
    const name = file.name.toLowerCase();

    return accepted.some((valid) => {
      if (valid === '*/*') {
        return true;
      }

      if (valid.startsWith('.')) {
        return name.endsWith(valid);
      }

      if (valid.endsWith('/*')) {
        return baseMime === valid.replace(/\/.*$/, '');
      }

      return mime === valid;
    });
  }

  applyAcceptFilter(files: DroppedFile[]): DroppedFile[] {
    const acceptStr = this.acceptedFiles();
    if (!acceptStr) return files;
    return files.filter((f) => this.isValidFile(f.file));
  }

  enforceMultiple(files: DroppedFile[]): DroppedFile[] {
    if (!this.multiple() && files.length > 1) {
      return [files[0]];
    }
    return files;
  }
}

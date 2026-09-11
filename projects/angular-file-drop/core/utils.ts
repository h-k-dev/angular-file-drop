import type { DroppedFile } from './files.types';

/**
 * Interactive child elements that should not trigger the file picker when clicked.
 */
export const FILE_DND_IGNORE_SELECTOR =
  'button,a,input,textarea,select,[contenteditable="true"],[data-file-dnd-ignore]';

// ─── DragEvent Helpers ──────────────────────────────────────────────────────
export function containsFiles(event: DragEvent) {
  if (!event.dataTransfer?.types) return false;
  return Array.from(event.dataTransfer.types).includes('Files');
}

export function setDropEffect(event: DragEvent, dropEffect: DataTransfer['dropEffect']): void {
  try {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = dropEffect;
    }
  } catch (error) {
    console.warn('[FileDnd] setDropEffect error:', error);
  }
}

// ─── Drag contents ─────────────────────────────────────────────────────────

/**
 * The MIME types of the files in a drag, as far as the browser tells during
 * one — names and contents are withheld until the drop, and a type it does
 * not know is `''`. Empty when it says nothing at all (some browsers expose
 * no items until the drop), so the length is a count only when it is not 0.
 */
export function dragFileTypes(event: DragEvent): string[] {
  return Array.from(event.dataTransfer?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.type);
}

/**
 * The attribute every dropzone host carries, so zones can recognise one
 * another in the DOM without depending on how the selector was written in a
 * template. Used by the `selfOnly` input.
 */
export const DROP_ZONE_ATTRIBUTE = 'data-drop-zone';

/**
 * Whether the event landed on `host` itself rather than inside a dropzone
 * nested within it. Structural, so it holds regardless of whether the inner
 * zone claimed the event, was disabled, or filtered every file out.
 */
export function isNearestDropZone(event: Event, host: HTMLElement): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return true;
  const nearest = target.closest(`[${DROP_ZONE_ATTRIBUTE}]`);
  // A target outside the host entirely is not this zone's business either;
  // that only happens for the document-level listeners, which do their own
  // checks.
  return nearest === null || nearest === host;
}

// ─── Filtering ──────────────────────────────────────────────────────────────

/**
 * A path is considered hidden if any of its segments starts with a dot
 * (e.g. `.git/config` or `folder/.DS_Store`).
 */
export function isHiddenPath(relativePath: string) {
  return relativePath.split('/').some((part) => part.length > 1 && part.startsWith('.'));
}

export function filterHiddenFiles(files: DroppedFile[]): DroppedFile[] {
  return files.filter((f) => !isHiddenPath(f.relativePath));
}

/**
 * Matches a file against an `accept`-style string (e.g. `.png,image/*,application/pdf`).
 */
export function isFileAccepted(file: File, acceptStr: string | null) {
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

export function filterAcceptedFiles(files: DroppedFile[], acceptStr: string | null): DroppedFile[] {
  if (!acceptStr) return files;
  return files.filter((f) => isFileAccepted(f.file, acceptStr));
}

export function enforceMultiple(files: DroppedFile[], multiple: boolean): DroppedFile[] {
  if (!multiple && files.length > 1) {
    return [files[0]];
  }
  return files;
}

export function toDroppedFiles(files: ArrayLike<File>): DroppedFile[] {
  return Array.from(files).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

// ─── Reading Dropped Files ──────────────────────────────────────────────────

/**
 * Extracts all files from a drop's DataTransfer, traversing folders when
 * `traverseDirectories` is true. Picks the best available API:
 * File System Access handles → webkit entries → plain FileList.
 */
export async function readDroppedFiles(
  dt: DataTransfer,
  traverseDirectories: boolean,
): Promise<DroppedFile[]> {
  const items = Array.from(dt.items ?? []).filter((item) => item.kind === 'file');

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
      )
        // `!= null`, not `!== null`: an item that resolves to `undefined` — a
        // synthetic DataTransfer, a permission the user never granted — used
        // to survive this filter and blow up on `handle.kind` downstream.
        .filter((h): h is FileSystemHandle => h != null);

      return withFileListFallback(await walkHandles(handles, '', traverseDirectories), dt);
    }

    // Fallback 1: The old webkit API (still supports folders)
    if (items.length && 'webkitGetAsEntry' in items[0]) {
      const entries = items
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry != null);

      return withFileListFallback(await walkEntries(entries, '', traverseDirectories), dt);
    }

    // Fallback 2: Basic FileList (no folder traversal support)
    return toDroppedFiles(dt.files);
  } catch (error) {
    console.error('[FileDnd] Error reading dropped files:', error);
    // Even a thrown read must not lose a drop the browser already handed us
    // in full: `dt.files` is always there, it just cannot describe folders.
    return toDroppedFiles(dt.files ?? []);
  }
}

/**
 * The entry/handle APIs are the only ones that can describe folders, so they
 * are tried first — but they are also the ones that can come back empty for
 * reasons that have nothing to do with the drop (a revoked permission, a
 * DataTransfer synthesized by a test or an automation harness). When they
 * yield nothing and the plain `FileList` is not empty, the FileList is the
 * better answer: fewer paths, but real files rather than none.
 */
function withFileListFallback(read: DroppedFile[], dt: DataTransfer): DroppedFile[] {
  if (read.length) return read;
  const fallback = toDroppedFiles(dt.files ?? []);
  if (fallback.length) {
    console.warn(
      '[FileDnd] Directory-aware read returned nothing; falling back to DataTransfer.files ' +
        '(folder structure is not available for this drop).',
    );
  }
  return fallback;
}

// ─── Modern FileSystemHandle Traversal ──────────────────────────────────────

export async function walkHandles(
  handles: FileSystemHandle[],
  basePath: string,
  traverseDirectories: boolean,
): Promise<DroppedFile[]> {
  const results: DroppedFile[] = [];

  for (const handle of handles) {
    try {
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        results.push({ file, relativePath: basePath + file.name });
      } else if (handle.kind === 'directory') {
        if (!traverseDirectories) {
          continue;
        }

        const dirHandle = handle as FileSystemDirectoryHandle;
        const dirPath = basePath + dirHandle.name + '/';

        const children: FileSystemHandle[] = [];

        for await (const [_, child] of (dirHandle as any).entries()) {
          children.push(child);
        }

        const childResults = await walkHandles(children, dirPath, traverseDirectories);
        results.push(...childResults);
      }
    } catch (err) {
      // Hardened: if one file is locked or requires permissions the user denied, just skip it.
      // `describe` rather than `handle.name`: the handle is exactly the thing
      // that just misbehaved, and reading a property off it here would throw
      // *inside the catch* — turning one skipped file into a failed drop.
      console.warn(`[FileDnd] Skipped handle ${describe(handle)} due to error:`, err);
    }
  }

  return results;
}

// ─── FileSystemEntry Traversal ──────────────────────────────────────────────

export function walkEntries(
  entries: FileSystemEntry[],
  basePath: string,
  traverseDirectories: boolean,
): Promise<DroppedFile[]> {
  return Promise.all(entries.map((entry) => walkEntry(entry, basePath, traverseDirectories))).then(
    (results) => results.flat(),
  );
}

export async function walkEntry(
  entry: FileSystemEntry,
  basePath: string,
  traverseDirectories: boolean,
): Promise<DroppedFile[]> {
  try {
    if (entry.isFile) {
      return await resolveFileEntry(entry as FileSystemFileEntry, basePath);
    } else if (entry.isDirectory) {
      if (!traverseDirectories) {
        return [];
      }
      return await resolveDirectoryEntry(
        entry as FileSystemDirectoryEntry,
        basePath,
        traverseDirectories,
      );
    }
  } catch (err) {
    // See the note in `walkHandles`: never dereference the failed object here.
    console.warn(`[FileDnd] Skipped entry ${describe(entry)} due to error:`, err);
  }
  return [];
}

/**
 * A name for a handle or entry that is safe to read while handling its own
 * failure — the object may be null, undefined, or a proxy that throws on
 * property access.
 */
function describe(target: { name?: string } | null | undefined): string {
  try {
    return target?.name ?? '<unknown>';
  } catch {
    return '<unreadable>';
  }
}

export function resolveFileEntry(
  entry: FileSystemFileEntry,
  basePath: string,
): Promise<DroppedFile[]> {
  return new Promise((resolve) => {
    entry.file(
      (file) => {
        resolve([{ file, relativePath: basePath + file.name }]);
      },
      (err) => {
        console.warn('[FileDnd] file entry error:', err);
        resolve([]);
      },
    );
  });
}

export function resolveDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  basePath: string,
  traverseDirectories: boolean,
): Promise<DroppedFile[]> {
  const dirPath = basePath + entry.name + '/';
  const reader = entry.createReader();
  const collected: FileSystemEntry[] = [];

  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(
        async (batch) => {
          if (batch.length === 0) {
            const results = await walkEntries(collected, dirPath, traverseDirectories);
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

// ─── Hidden File Input ──────────────────────────────────────────────────────

/**
 * Creates an invisible `<input type="file">` attached to `document.body`.
 * The caller is responsible for removing it again.
 */
export function createHiddenFileInput() {
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

  // Append input to the document body to prevent void-element issues
  document.body.appendChild(input);

  return input;
}

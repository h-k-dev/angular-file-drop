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
      ).filter((h): h is FileSystemHandle => h !== null);

      return await walkHandles(handles, '', traverseDirectories);
    }

    // Fallback 1: The old webkit API (still supports folders)
    if (items.length && 'webkitGetAsEntry' in items[0]) {
      const entries = items
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);

      return await walkEntries(entries, '', traverseDirectories);
    }

    // Fallback 2: Basic FileList (no folder traversal support)
    return toDroppedFiles(dt.files);
  } catch (error) {
    console.error('[FileDnd] Error reading dropped files:', error);
    return [];
  }
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
      // Hardened: if one file is locked or requires permissions the user denied, just skip it
      console.warn(`[FileDnd] Skipped handle ${handle.name} due to error:`, err);
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
    console.warn(`[FileDnd] Skipped entry ${entry.name} due to error:`, err);
  }
  return [];
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
export function createHiddenFileInput(): HTMLInputElement {
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

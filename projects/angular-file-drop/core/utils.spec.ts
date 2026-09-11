import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DroppedFile } from './files.types';
import { claimDragEvent, isDragEventClaimed } from './claim';
import {
  containsFiles,
  createHiddenFileInput,
  DROP_ZONE_ATTRIBUTE,
  dragFileTypes,
  enforceMultiple,
  FILE_DND_IGNORE_SELECTOR,
  filterAcceptedFiles,
  filterHiddenFiles,
  isFileAccepted,
  isHiddenPath,
  isNearestDropZone,
  readDroppedFiles,
  resolveDirectoryEntry,
  resolveFileEntry,
  setDropEffect,
  toDroppedFiles,
  walkEntries,
  walkEntry,
  walkHandles,
} from './utils';

// ─── Test helpers ─────────────────────────────────────────────────────────

/** Build a real `File` with an optional MIME type. */
function makeFile(name: string, type = ''): File {
  return new File(['x'], name, { type });
}

/** Wrap a `File` as a `DroppedFile` with an explicit relative path. */
function dropped(name: string, relativePath = name, type = ''): DroppedFile {
  return { file: makeFile(name, type), relativePath };
}

beforeEach(() => {
  // Silence the library's defensive console output and assert on it where useful.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('FILE_DND_IGNORE_SELECTOR', () => {
  it('matches the standard interactive elements', () => {
    for (const sel of ['button', 'a', 'input', 'textarea', 'select']) {
      expect(FILE_DND_IGNORE_SELECTOR).toContain(sel);
    }
    expect(FILE_DND_IGNORE_SELECTOR).toContain('[contenteditable="true"]');
    expect(FILE_DND_IGNORE_SELECTOR).toContain('[data-file-dnd-ignore]');
  });
});

// ─── containsFiles ────────────────────────────────────────────────────────

describe('containsFiles', () => {
  it('returns true when the drag carries files', () => {
    const event = { dataTransfer: { types: ['Files'] } } as unknown as DragEvent;
    expect(containsFiles(event)).toBe(true);
  });

  it('returns false for non-file drags (e.g. text)', () => {
    const event = { dataTransfer: { types: ['text/plain'] } } as unknown as DragEvent;
    expect(containsFiles(event)).toBe(false);
  });

  it('returns false when there is no dataTransfer', () => {
    expect(containsFiles({ dataTransfer: null } as unknown as DragEvent)).toBe(false);
  });

  it('returns false when types is missing', () => {
    expect(containsFiles({ dataTransfer: {} } as unknown as DragEvent)).toBe(false);
  });

  it('handles a DOMStringList-like (array-like) types object', () => {
    const event = { dataTransfer: { types: ['Files', 'text/uri-list'] } } as unknown as DragEvent;
    expect(containsFiles(event)).toBe(true);
  });
});

// ─── setDropEffect ──────────────────────────────────────────────────────────

describe('setDropEffect', () => {
  it('assigns the requested drop effect', () => {
    const dataTransfer = { dropEffect: 'none' } as DataTransfer;
    setDropEffect({ dataTransfer } as unknown as DragEvent, 'copy');
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('does nothing when there is no dataTransfer', () => {
    expect(() =>
      setDropEffect({ dataTransfer: null } as unknown as DragEvent, 'copy'),
    ).not.toThrow();
  });

  it('swallows assignment errors and warns', () => {
    const dataTransfer = {} as DataTransfer;
    Object.defineProperty(dataTransfer, 'dropEffect', {
      set() {
        throw new Error('read only');
      },
    });

    expect(() => setDropEffect({ dataTransfer } as unknown as DragEvent, 'move')).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });
});

// ─── isHiddenPath / filterHiddenFiles ─────────────────────────────────────

describe('isHiddenPath', () => {
  it('flags dotfiles at the root', () => {
    expect(isHiddenPath('.DS_Store')).toBe(true);
    expect(isHiddenPath('.env')).toBe(true);
  });

  it('flags files inside a dot-directory', () => {
    expect(isHiddenPath('.git/config')).toBe(true);
    expect(isHiddenPath('project/.cache/data.bin')).toBe(true);
  });

  it('treats a bare dot or two-char names correctly', () => {
    // A single "." segment has length 1 and is not considered hidden.
    expect(isHiddenPath('.')).toBe(false);
    // ".a" has length 2 and starts with a dot -> hidden.
    expect(isHiddenPath('.a')).toBe(true);
  });

  it('does not flag normal paths', () => {
    expect(isHiddenPath('src/app/main.ts')).toBe(false);
    expect(isHiddenPath('photo.jpg')).toBe(false);
    expect(isHiddenPath('my.folder/file.txt')).toBe(false);
  });
});

describe('filterHiddenFiles', () => {
  it('removes hidden entries and keeps visible ones', () => {
    const files = [
      dropped('a.txt', 'a.txt'),
      dropped('store', '.DS_Store'),
      dropped('config', '.git/config'),
      dropped('b.txt', 'folder/b.txt'),
    ];

    const result = filterHiddenFiles(files);
    expect(result.map((f) => f.relativePath)).toEqual(['a.txt', 'folder/b.txt']);
  });

  it('returns an empty array when everything is hidden', () => {
    expect(filterHiddenFiles([dropped('x', '.secret')])).toEqual([]);
  });
});

// ─── isFileAccepted ─────────────────────────────────────────────────────────

describe('isFileAccepted', () => {
  it('accepts everything when the accept string is empty/null', () => {
    expect(isFileAccepted(makeFile('a.png', 'image/png'), null)).toBe(true);
    expect(isFileAccepted(makeFile('a.png', 'image/png'), '')).toBe(true);
  });

  it('accepts everything for the */* wildcard', () => {
    expect(isFileAccepted(makeFile('weird.bin', ''), '*/*')).toBe(true);
  });

  it('matches by file extension', () => {
    expect(isFileAccepted(makeFile('photo.PNG', ''), '.png')).toBe(true);
    expect(isFileAccepted(makeFile('photo.jpg', ''), '.png')).toBe(false);
  });

  it('matches a base MIME wildcard like image/*', () => {
    expect(isFileAccepted(makeFile('a', 'image/png'), 'image/*')).toBe(true);
    expect(isFileAccepted(makeFile('a', 'image/jpeg'), 'image/*')).toBe(true);
    expect(isFileAccepted(makeFile('a', 'video/mp4'), 'image/*')).toBe(false);
  });

  it('matches an exact MIME type', () => {
    expect(isFileAccepted(makeFile('doc', 'application/pdf'), 'application/pdf')).toBe(true);
    expect(isFileAccepted(makeFile('doc', 'application/json'), 'application/pdf')).toBe(false);
  });

  it('accepts when ANY token in a comma list matches', () => {
    const accept = '.png,image/*,application/pdf';
    expect(isFileAccepted(makeFile('a.txt', 'application/pdf'), accept)).toBe(true);
    expect(isFileAccepted(makeFile('shot.png', ''), accept)).toBe(true);
    expect(isFileAccepted(makeFile('a.txt', 'text/plain'), accept)).toBe(false);
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(isFileAccepted(makeFile('A.PDF', 'APPLICATION/PDF'), '  .PDF , IMAGE/* ')).toBe(true);
  });
});

describe('filterAcceptedFiles', () => {
  it('returns all files when accept is empty', () => {
    const files = [dropped('a.png'), dropped('b.txt')];
    expect(filterAcceptedFiles(files, null)).toBe(files);
  });

  it('keeps only files matching the accept string', () => {
    const files = [
      dropped('a.png', 'a.png', 'image/png'),
      dropped('b.txt', 'b.txt', 'text/plain'),
      dropped('c.jpg', 'c.jpg', 'image/jpeg'),
    ];

    const result = filterAcceptedFiles(files, 'image/*');
    expect(result.map((f) => f.relativePath)).toEqual(['a.png', 'c.jpg']);
  });
});

// ─── enforceMultiple ────────────────────────────────────────────────────────

describe('enforceMultiple', () => {
  const files = [dropped('a'), dropped('b'), dropped('c')];

  it('returns all files when multiple is allowed', () => {
    expect(enforceMultiple(files, true)).toBe(files);
  });

  it('truncates to the first file when multiple is disallowed', () => {
    const result = enforceMultiple(files, false);
    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe('a');
  });

  it('leaves a single-file list untouched even when multiple is false', () => {
    const single = [dropped('only')];
    expect(enforceMultiple(single, false)).toBe(single);
  });

  it('handles an empty list', () => {
    expect(enforceMultiple([], false)).toEqual([]);
  });
});

// ─── toDroppedFiles ─────────────────────────────────────────────────────────

describe('toDroppedFiles', () => {
  it('falls back to file.name when there is no webkitRelativePath', () => {
    const result = toDroppedFiles([makeFile('hello.txt'), makeFile('world.txt')]);
    expect(result.map((f) => f.relativePath)).toEqual(['hello.txt', 'world.txt']);
    expect(result[0].file).toBeInstanceOf(File);
  });

  it('prefers webkitRelativePath when present', () => {
    const file = makeFile('leaf.txt');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'root/sub/leaf.txt' });
    expect(toDroppedFiles([file])[0].relativePath).toBe('root/sub/leaf.txt');
  });

  it('accepts any array-like (e.g. a FileList-shaped object)', () => {
    const fileListLike = { 0: makeFile('a'), 1: makeFile('b'), length: 2 } as unknown as FileList;
    expect(toDroppedFiles(fileListLike)).toHaveLength(2);
  });

  it('returns an empty array for an empty input', () => {
    expect(toDroppedFiles([])).toEqual([]);
  });
});

// ─── createHiddenFileInput ──────────────────────────────────────────────────

describe('createHiddenFileInput', () => {
  afterEach(() => {
    document.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
  });

  it('creates a visually hidden file input attached to the body', () => {
    const input = createHiddenFileInput();

    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('file');
    expect(input.style.position).toBe('fixed');
    expect(input.style.opacity).toBe('0');
    expect(input.style.pointerEvents).toBe('none');
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.contains(input)).toBe(true);
  });
});

// ─── readDroppedFiles ───────────────────────────────────────────────────────

/** Minimal stub of a DataTransferItem in "file" mode. */
function fileItem(extra: Record<string, unknown> = {}): DataTransferItem {
  return { kind: 'file', ...extra } as unknown as DataTransferItem;
}

describe('readDroppedFiles', () => {
  it('falls back to the flat FileList when no folder API is present', async () => {
    const dt = {
      items: [fileItem(), fileItem()],
      files: [makeFile('a.txt'), makeFile('b.txt')],
    } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);
    expect(result.map((f) => f.relativePath)).toEqual(['a.txt', 'b.txt']);
  });

  it('ignores non-file items when falling back', async () => {
    const stringItem = { kind: 'string' } as unknown as DataTransferItem;
    const dt = {
      items: [stringItem],
      files: [makeFile('only.txt')],
    } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);
    expect(result.map((f) => f.relativePath)).toEqual(['only.txt']);
  });

  it('uses the modern File System Access handles when available', async () => {
    const file = makeFile('doc.pdf');
    const handle = { kind: 'file', name: 'doc.pdf', getFile: async () => file };
    const item = fileItem({ getAsFileSystemHandle: async () => handle });

    const dt = { items: [item], files: [] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);
    expect(result).toEqual([{ file, relativePath: 'doc.pdf' }]);
  });

  it('skips handles that throw and keeps the rest', async () => {
    const goodFile = makeFile('good.txt');
    const goodHandle = { kind: 'file', name: 'good.txt', getFile: async () => goodFile };

    const okItem = fileItem({ getAsFileSystemHandle: async () => goodHandle });
    const badItem = fileItem({
      getAsFileSystemHandle: async () => {
        throw new Error('permission denied');
      },
    });

    const dt = { items: [okItem, badItem], files: [] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);
    expect(result.map((f) => f.relativePath)).toEqual(['good.txt']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('uses the legacy webkitGetAsEntry API when handles are unavailable', async () => {
    const file = makeFile('legacy.txt');
    const entry = {
      isFile: true,
      isDirectory: false,
      name: 'legacy.txt',
      file: (cb: (f: File) => void) => cb(file),
    };
    const item = fileItem({ webkitGetAsEntry: () => entry });

    const dt = { items: [item], files: [] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);
    expect(result).toEqual([{ file, relativePath: 'legacy.txt' }]);
  });

  it('returns an empty array (and logs) if the items accessor throws', async () => {
    const dt = {
      get items(): DataTransferItem[] {
        throw new Error('boom');
      },
      files: [],
    } as unknown as DataTransfer;

    await expect(readDroppedFiles(dt, true)).rejects.toThrow();
  });

  it('survives a handle that resolves to undefined rather than null', async () => {
    // A synthetic DataTransfer (a test, an automation harness) and a revoked
    // permission both produce this. It used to reach `handle.kind`, throw,
    // and take the whole drop down with it.
    const item = fileItem({ getAsFileSystemHandle: async () => undefined });
    const dt = { items: [item], files: [makeFile('real.txt')] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);

    expect(result.map((f) => f.relativePath)).toEqual(['real.txt']);
  });

  it('falls back to the FileList when the handle path yields nothing', async () => {
    const item = fileItem({
      getAsFileSystemHandle: async () => {
        throw new Error('permission denied');
      },
    });
    const dt = { items: [item], files: [makeFile('kept.pdf')] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);

    expect(result.map((f) => f.relativePath)).toEqual(['kept.pdf']);
  });

  it('falls back to the FileList when the legacy entry path yields nothing', async () => {
    const item = fileItem({ webkitGetAsEntry: () => null });
    const dt = { items: [item], files: [makeFile('kept.txt')] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);

    expect(result.map((f) => f.relativePath)).toEqual(['kept.txt']);
  });

  it('still returns nothing when the folder API is empty and so is the FileList', async () => {
    const item = fileItem({ getAsFileSystemHandle: async () => null });
    const dt = { items: [item], files: [] } as unknown as DataTransfer;

    expect(await readDroppedFiles(dt, true)).toEqual([]);
  });

  it('prefers the folder-aware read over the FileList when it finds anything', async () => {
    // The FileList cannot describe folders, so it must never win a race it
    // did not need to enter.
    const nested = makeFile('report.pdf');
    const handle = {
      kind: 'file',
      name: 'report.pdf',
      getFile: async () => nested,
    };
    const item = fileItem({ getAsFileSystemHandle: async () => handle });
    const dt = { items: [item], files: [makeFile('report.pdf')] } as unknown as DataTransfer;

    const result = await readDroppedFiles(dt, true);

    expect(result).toEqual([{ file: nested, relativePath: 'report.pdf' }]);
  });
});

// ─── walkHandles ────────────────────────────────────────────────────────────

describe('walkHandles', () => {
  it('collects files and prefixes them with the base path', async () => {
    const file = makeFile('a.txt');
    const handle = {
      kind: 'file',
      name: 'a.txt',
      getFile: async () => file,
    } as unknown as FileSystemHandle;

    const result = await walkHandles([handle], 'base/', true);
    expect(result).toEqual([{ file, relativePath: 'base/a.txt' }]);
  });

  it('recurses into directories when traverseDirectories is true', async () => {
    const childFile = makeFile('child.txt');
    const childHandle = { kind: 'file', name: 'child.txt', getFile: async () => childFile };

    const dirHandle = {
      kind: 'directory',
      name: 'nested',
      async *entries() {
        yield ['child.txt', childHandle];
      },
    } as unknown as FileSystemHandle;

    const result = await walkHandles([dirHandle], '', true);
    expect(result).toEqual([{ file: childFile, relativePath: 'nested/child.txt' }]);
  });

  it('skips directories when traverseDirectories is false', async () => {
    const dirHandle = {
      kind: 'directory',
      name: 'nested',
      // entries() should never be called; throw to prove it.
      async *entries() {
        throw new Error('should not traverse');
      },
    } as unknown as FileSystemHandle;

    const result = await walkHandles([dirHandle], '', false);
    expect(result).toEqual([]);
  });

  it('skips a single failing handle and continues', async () => {
    const goodFile = makeFile('ok.txt');
    const goodHandle = { kind: 'file', name: 'ok.txt', getFile: async () => goodFile };
    const badHandle = {
      kind: 'file',
      name: 'bad.txt',
      getFile: async () => {
        throw new Error('locked');
      },
    };

    const result = await walkHandles(
      [badHandle, goodHandle] as unknown as FileSystemHandle[],
      '',
      true,
    );
    expect(result.map((f) => f.relativePath)).toEqual(['ok.txt']);
    expect(console.warn).toHaveBeenCalled();
  });
});

// ─── walkEntries / walkEntry ──────────────────────────────────────────────

/** Build a file entry stub. */
function fileEntry(name: string, file: File, fail = false): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (f: File) => void, reject: (e: Error) => void) =>
      fail ? reject(new Error('nope')) : resolve(file),
  } as unknown as FileSystemFileEntry;
}

/** Build a directory entry stub whose reader yields `children` then an empty batch. */
function dirEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  let served = false;
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => ({
      readEntries: (resolve: (batch: FileSystemEntry[]) => void) => {
        if (served) {
          resolve([]);
        } else {
          served = true;
          resolve(children);
        }
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
}

describe('resolveFileEntry', () => {
  it('resolves a single dropped file with the base path', async () => {
    const file = makeFile('leaf.txt');
    const result = await resolveFileEntry(fileEntry('leaf.txt', file), 'dir/');
    expect(result).toEqual([{ file, relativePath: 'dir/leaf.txt' }]);
  });

  it('resolves to an empty array (and warns) when the entry errors', async () => {
    const result = await resolveFileEntry(fileEntry('x.txt', makeFile('x.txt'), true), '');
    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('resolveDirectoryEntry', () => {
  it('reads all batched children and prefixes the directory name', async () => {
    const f1 = makeFile('one.txt');
    const f2 = makeFile('two.txt');
    const dir = dirEntry('docs', [fileEntry('one.txt', f1), fileEntry('two.txt', f2)]);

    const result = await resolveDirectoryEntry(dir, '', true);
    expect(result.map((f) => f.relativePath).sort()).toEqual(['docs/one.txt', 'docs/two.txt']);
  });
});

describe('walkEntry', () => {
  it('handles a file entry', async () => {
    const file = makeFile('f.txt');
    const result = await walkEntry(fileEntry('f.txt', file), '', true);
    expect(result).toEqual([{ file, relativePath: 'f.txt' }]);
  });

  it('skips directory entries when traversal is disabled', async () => {
    const dir = dirEntry('skip', [fileEntry('x.txt', makeFile('x.txt'))]);
    expect(await walkEntry(dir, '', false)).toEqual([]);
  });

  it('recurses into nested directories', async () => {
    const deepFile = makeFile('deep.txt');
    const inner = dirEntry('inner', [fileEntry('deep.txt', deepFile)]);
    const outer = dirEntry('outer', [inner]);

    const result = await walkEntry(outer, '', true);
    expect(result).toEqual([{ file: deepFile, relativePath: 'outer/inner/deep.txt' }]);
  });
});

describe('walkEntries', () => {
  it('flattens results across multiple entries', async () => {
    const f1 = makeFile('a.txt');
    const f2 = makeFile('b.txt');
    const result = await walkEntries([fileEntry('a.txt', f1), fileEntry('b.txt', f2)], '', true);
    expect(result.map((f) => f.relativePath)).toEqual(['a.txt', 'b.txt']);
  });

  it('returns an empty array for no entries', async () => {
    expect(await walkEntries([], '', true)).toEqual([]);
  });
});

// ─── Claiming ───────────────────────────────────────────────────────────────

describe('claimDragEvent / isDragEventClaimed', () => {
  it('reports an untouched event as unclaimed', () => {
    expect(isDragEventClaimed(new Event('drop'))).toBe(false);
  });

  it('reports an event as claimed once it is marked', () => {
    const event = new Event('drop');
    claimDragEvent(event);
    expect(isDragEventClaimed(event)).toBe(true);
  });

  it('marks without preventing the default — that is the whole point', () => {
    const event = new Event('drop', { cancelable: true });
    claimDragEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('reads preventDefault on a drop as a claim — that is how a handler consumes one', () => {
    const event = new Event('drop', { cancelable: true });
    event.preventDefault();
    expect(isDragEventClaimed(event)).toBe(true);
  });

  it('does not read preventDefault during the drag as a claim', () => {
    // On dragenter/dragover it is the spec's "a drop may land here" — every
    // element that accepts drops says it, and it says nothing about who will
    // take this one. Reading it as a claim put out the highlight of every
    // zone wrapping an editor, over the very element the drop was headed for.
    for (const type of ['dragenter', 'dragover']) {
      const event = new Event(type, { cancelable: true });
      event.preventDefault();
      expect(isDragEventClaimed(event)).toBe(false);
    }
  });

  it('keeps claims separate per event', () => {
    const claimedEvent = new Event('drop');
    const otherEvent = new Event('drop');
    claimDragEvent(claimedEvent);
    expect(isDragEventClaimed(otherEvent)).toBe(false);
  });
});

// ─── dragFileTypes ──────────────────────────────────────────────────────────

describe('dragFileTypes', () => {
  const drag = (items: unknown[] | undefined) =>
    ({ dataTransfer: items && { items } }) as unknown as DragEvent;

  it('lists the type of every file item, in order, unknown ones as empty strings', () => {
    const event = drag([
      { kind: 'file', type: 'image/png' },
      { kind: 'file', type: '' },
      { kind: 'string', type: 'text/plain' },
    ]);
    expect(dragFileTypes(event)).toEqual(['image/png', '']);
  });

  it('is empty when the browser exposes no items', () => {
    expect(dragFileTypes(drag([]))).toEqual([]);
    expect(dragFileTypes(drag(undefined))).toEqual([]);
    expect(dragFileTypes({ dataTransfer: null } as unknown as DragEvent)).toEqual([]);
  });
});

// ─── isNearestDropZone ──────────────────────────────────────────────────────

describe('isNearestDropZone', () => {
  /** outer[data-drop-zone] > middle > inner[data-drop-zone] > leaf */
  function tree() {
    const outer = document.createElement('div');
    outer.setAttribute(DROP_ZONE_ATTRIBUTE, '');
    const middle = outer.appendChild(document.createElement('div'));
    const inner = middle.appendChild(document.createElement('div'));
    inner.setAttribute(DROP_ZONE_ATTRIBUTE, '');
    const leaf = inner.appendChild(document.createElement('span'));
    return { outer, middle, inner, leaf };
  }

  /** An event whose target is `el`, without needing a live dispatch. */
  function eventOn(el: Element): Event {
    const event = new Event('drop');
    Object.defineProperty(event, 'target', { value: el });
    return event;
  }

  it('is true for the zone the drag actually landed on', () => {
    const { outer, middle } = tree();
    expect(isNearestDropZone(eventOn(outer), outer)).toBe(true);
    expect(isNearestDropZone(eventOn(middle), outer)).toBe(true);
  });

  it('is false for an outer zone when the drag landed inside a nested one', () => {
    const { outer, inner, leaf } = tree();
    expect(isNearestDropZone(eventOn(inner), outer)).toBe(false);
    expect(isNearestDropZone(eventOn(leaf), outer)).toBe(false);
  });

  it('is true for the nested zone itself', () => {
    const { inner, leaf } = tree();
    expect(isNearestDropZone(eventOn(leaf), inner)).toBe(true);
  });

  it('allows an event with no element target — the document listeners check their own', () => {
    const { outer } = tree();
    expect(isNearestDropZone(new Event('drop'), outer)).toBe(true);
  });
});

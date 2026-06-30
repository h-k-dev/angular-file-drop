# Angular File Drop

[![npm version](https://img.shields.io/npm/v/@h-k-dev/angular-file-drop.svg)](https://www.npmjs.com/package/@h-k-dev/angular-file-drop)
[![license](https://img.shields.io/npm/l/@h-k-dev/angular-file-drop.svg)](./LICENSE)

A lightweight, **signal-based** Angular directive for drag-and-drop file and folder uploads — with directory traversal, `accept`-type filtering, and a click-to-open file picker. No stylesheets, no XHR wrappers, no DOM mutation. Just the `File` objects.

> This is the workspace repository. The published package lives in [`projects/angular-file-drop`](./projects/angular-file-drop).

## The Philosophy
**[Try the live demo →](https://h-k-dev.github.io/angular-file-drop/angular-file-drop/)**

Dropzone.js is great, but it often fights against modern Angular architecture by injecting its own CSS, mutating the DOM, and hijacking HTTP requests with its own XHR wrappers.

`angular-file-drop` is the "Angular-only" alternative. It does a portion of what Dropzone does, but strictly the Angular way:

- **Native directive** — binds to your existing elements using standard Angular syntax.
- **Headless** — handles the messy HTML5 drag-and-drop events and hands you raw `File` objects.
- **Zero network opinions** — you upload with Angular's own `HttpClient`, keeping interceptors and auth intact.
- **Bring your own UI** — no forced stylesheets. Style your dropzone exactly how your app needs it.

## Features

- Drag-and-drop **and** click-to-open file picker on a single element
- Recursive **folder/directory traversal** (modern File System Access API, with legacy `webkitGetAsEntry` and plain `FileList` fallbacks)
- `accept`-style filtering by extension or MIME (`.png`, `image/*`, `application/pdf`, `*/*`)
- Single- or multiple-file enforcement
- Automatic hidden-file filtering (`.git`, `.DS_Store`, …)
- Signal-based drag-over state for easy template styling
- SSR-safe (guards all browser-only APIs)
- A ready-made `FILE_TYPES` map of common `accept` strings

## Installation

```bash
npm install @h-k-dev/angular-file-drop
```

Requires Angular `17.3+` (standalone directives + signals).

## Quick Start

The directive is standalone — import `AngularFileDrop` directly into your component.

```ts
import { Component } from '@angular/core';
import { AngularFileDrop, FileDropEvent } from '@h-k-dev/angular-file-drop';

@Component({
  selector: 'app-uploader',
  imports: [AngularFileDrop],
  template: `
    <div
      dropZone
      [class.is-dragging]="zone.isDragOver()"
      (fileDrop)="onDrop($event)"
      #zone="dropZone"
    >
      Drag files here, or click to browse
    </div>
  `,
})
export class UploaderComponent {
  onDrop(event: FileDropEvent) {
    for (const { file, relativePath } of event.files) {
      console.log(relativePath, file.size);
    }
  }
}
```

```css
.is-dragging {
  outline: 2px dashed #4f46e5;
  background: #eef2ff;
}
```

## Examples

### Restrict accepted types

Pass any `accept`-style string. The `FILE_TYPES` map provides ready-made values.

```ts
import { FILE_TYPES } from '@h-k-dev/angular-file-drop';

@Component({
  imports: [AngularFileDrop],
  template: `
    <div dropZone [acceptedFiles]="accept" (fileDrop)="onDrop($event)">
      Images and PDFs only
    </div>
  `,
})
export class Component {
  accept = `${FILE_TYPES.ANY_IMAGE},${FILE_TYPES.PDF}`; // "image/*,.pdf,application/pdf"
}
```

You can also write the string by hand: `[acceptedFiles]="'.png,.jpg,image/*'"`.

### Single file only

```html
<div dropZone [multiple]="false" (fileDrop)="onDrop($event)">
  Drop a single file
</div>
```

### Drop a whole folder

`directory` (on by default) recursively walks dropped folders. Each `DroppedFile` carries a `relativePath` that preserves the folder structure.

```ts
template: `<div dropZone [directory]="true" (fileDrop)="onDrop($event)">Drop a folder</div>`;

onDrop(event: FileDropEvent) {
  // e.g. "photos/2026/holiday/IMG_001.jpg"
  event.files.forEach((f) => console.log(f.relativePath));
}
```

### Open a folder picker on click

Set `directoryPicker` to make the click-to-open dialog a folder chooser instead of a file chooser.

```html
<div dropZone [directoryPicker]="true">Click to choose a folder</div>
```

### React to drag events and style the zone

The `isDragOver` signal flips while a valid file drag is over the element. Grab the directive instance via the `dropZone` export.

```html
<div
  dropZone
  #zone="dropZone"
  [class.active]="zone.isDragOver()"
  (dragEnter)="onEnter($event)"
  (dragLeave)="onLeave($event)"
>
  {{ zone.isDragOver() ? 'Release to upload' : 'Drag files here' }}
</div>
```

### Manual activation (custom button)

Disable the built-in click handling with `isManualActivation` and open the picker yourself from a child control.

```ts
@Component({
  imports: [AngularFileDrop],
  template: `
    <div dropZone #zone="dropZone" [isManualActivation]="true" (fileDrop)="onDrop($event)">
      <p>Drag files here</p>
      <button type="button" (click)="zone.openFilePicker($event)">Browse files</button>
      <button type="button" (click)="zone.openDirectoryPicker($event)">Browse folder</button>
    </div>
  `,
})
export class Component {
  onDrop(event: FileDropEvent) {
    /* ... */
  }
}
```

### Disable the zone

```html
<div dropZone [disabled]="isUploading" (fileDrop)="onDrop($event)">…</div>
```

### Upload with HttpClient

The directive stays out of your network layer — wire it up however you like.

```ts
onDrop(event: FileDropEvent) {
  const body = new FormData();
  event.files.forEach((f) => body.append('files', f.file, f.relativePath));
  this.http.post('/api/upload', body).subscribe();
}
```

## API Reference

### Inputs

| Input               | Type      | Default | Description                                                                                 |
| ------------------- | --------- | ------- | ------------------------------------------------------------------------------------------- |
| `multiple`          | `boolean` | `true`  | Allow more than one file. When `false`, only the first file is emitted.                     |
| `directory`         | `boolean` | `true`  | Recursively traverse dropped folders.                                                       |
| `directoryPicker`   | `boolean` | `false` | Make the click-to-open dialog a **folder** picker (`webkitdirectory`) rather than files.    |
| `acceptedFiles`     | `string`  | `''`    | `accept`-style filter, e.g. `.png,image/*,application/pdf`. Empty accepts everything.       |
| `ignoreHiddenFiles` | `boolean` | `true`  | Drop dotfiles and files inside dot-folders (`.git`, `.DS_Store`, …).                         |
| `clickable`         | `boolean` | `true`  | Open the file picker when the host element is clicked or activated via keyboard.            |
| `disabled`          | `boolean` | `false` | Ignore all drops, clicks, and keyboard activation.                                          |
| `isManualActivation`| `boolean` | `false` | Disable built-in click/keyboard activation so you can call the `open*` methods yourself.    |

### Outputs

| Output      | Payload          | Description                                              |
| ----------- | ---------------- | ------------------------------------------------------- |
| `fileDrop`  | `FileDropEvent`  | Emitted after files are dropped or chosen and filtered. |
| `dragEnter` | `DragEvent`      | A valid file drag entered the element.                  |
| `dragOver`  | `DragEvent`      | A valid file drag is moving over the element.           |
| `dragLeave` | `DragEvent`      | A valid file drag left the element.                     |

### Public members

| Member                          | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `isDragOver: Signal<boolean>`   | `true` while a valid file drag is over the element.                |
| `openPicker(event?, options?)`  | Open the hidden file input. `options.directory` toggles folder mode. |
| `openFilePicker(event?)`        | Open a file picker.                                                |
| `openDirectoryPicker(event?)`   | Open a folder picker.                                              |

Access these in templates via the `dropZone` export: `#zone="dropZone"`.

### Types

```ts
interface DroppedFile {
  file: File;
  relativePath: string; // preserves folder structure, e.g. "docs/report.pdf"
}

interface FileDropEvent {
  files: DroppedFile[];
}
```

### Exported utilities

The directive's pure helpers are exported for advanced use and testing: `containsFiles`, `setDropEffect`, `isHiddenPath`, `filterHiddenFiles`, `isFileAccepted`, `filterAcceptedFiles`, `enforceMultiple`, `toDroppedFiles`, `readDroppedFiles`, `walkHandles`, `walkEntries`, `createHiddenFileInput`, and the `FILE_TYPES` map.

## Development

```bash
npm install
npm test          # run the vitest unit suite
npm run test:ci   # single run (CI)
npm run build     # build the library with ng-packagr
```

## Browser Support

Works in all modern browsers. Folder traversal uses the File System Access API where available and falls back to `webkitGetAsEntry` and then a plain `FileList`. Server-side rendering is safe — all browser-only APIs are guarded.

## License

MIT © h-k-dev

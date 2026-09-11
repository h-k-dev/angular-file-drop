# Angular File Drop

[![npm version](https://img.shields.io/npm/v/@h-k-dev/angular-file-drop.svg)](https://www.npmjs.com/package/@h-k-dev/angular-file-drop)
[![license](https://img.shields.io/npm/l/@h-k-dev/angular-file-drop.svg)](./LICENSE)

A lightweight, **signal-based** Angular directive for drag-and-drop file and folder uploads — with directory traversal, `accept`-type filtering, and a click-to-open file picker. No stylesheets, no XHR wrappers, no DOM mutation. Just the `File` objects.

> This is the workspace repository. The published package lives in [`projects/angular-file-drop`](./projects/angular-file-drop).

## The Philosophy

**[Try the live demo →](https://h-k-dev.github.io/angular-file-drop)**

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
- Signal-based drag state for template styling and hints: `isDragOver`, and `dragTypes` for what is in flight
- Optional `preventDocumentDrop`, so a missed drop no longer navigates the browser away from your app
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
    <div dropZone [acceptedFiles]="accept" (fileDrop)="onDrop($event)">Images and PDFs only</div>
  `,
})
export class Component {
  accept = `${FILE_TYPES.ANY_IMAGE},${FILE_TYPES.PDF}`; // "image/*,.pdf,application/pdf"
}
```

You can also write the string by hand: `[acceptedFiles]="'.png,.jpg,image/*'"`.

### Single file only

```html
<div dropZone [multiple]="false" (fileDrop)="onDrop($event)">Drop a single file</div>
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

The `isDragOver` signal flips while a valid file drag is over the element, and
`dragTypes` names what is in flight — the MIME type of each file, as far as the
browser tells during a drag. Grab the directive instance via the `dropZone`
export.

```html
<div
  dropZone
  #zone="dropZone"
  [class.active]="zone.isDragOver()"
  (dragEnter)="onEnter($event)"
  (dragLeave)="onLeave($event)"
>
  @if (zone.dragTypes().length; as count) { Release to upload {{ count }} {{ count === 1 ? 'file' :
  'files' }} } @else if (zone.isDragOver()) { Release to upload } @else { Drag files here }
</div>
```

`dragTypes` is what the browser exposes before the drop, no more: names and
contents are withheld until then, a type it does not know is `''`, and a
browser that exposes no items leaves the list empty. Treat the length as a
count only when it is not `0`, and never as a verdict on `acceptedFiles` — that
can name extensions, which a drag cannot show.

### Stop a stray drop navigating away

Miss the zone by a few pixels and the browser's own default takes over: it
opens the dropped file as if it were a link, and whatever the user had unsaved
on the page is gone. `preventDocumentDrop` turns that default off.

```html
<div dropZone preventDocumentDrop (fileDrop)="onDrop($event)">Drop files here</div>
```

The effect is document-wide, because the drops it catches are by definition
the ones that landed nowhere near this element — so set it on the zone that
owns the page, not on each of several zones. It is **off by default**: a
directive on one widget should not quietly change how the rest of the
application behaves.

Drags that a dropzone or any other handler has taken are untouched; only the
ones nobody wanted are cancelled. Drags of text or in-page items are left
alone entirely.

Swallowing a drop silently is its own kind of broken — the file just vanishes,
which from the user's side looks exactly like a failed upload. `dropMissed`
fires when one is caught, so you can say what happened:

```ts
@Component({
  template: `
    <div dropZone preventDocumentDrop (dropMissed)="onMissed($event)" (fileDrop)="onDrop($event)">
      Drop files here
    </div>
  `,
})
export class Component {
  #snackBar = inject(MatSnackBar);

  onMissed(event: DragEvent) {
    const files = event.dataTransfer?.files;
    const what = files?.length === 1 ? files[0].name : `${files?.length ?? 0} files`;
    this.#snackBar.open(`${what} landed on no dropzone.`, 'Got it', { duration: 4000 });
  }
}
```

It fires only for genuine misses, so it is never a duplicate of `fileDrop`.
The drop is already cancelled by the time you see it; the `DragEvent` is
passed through so you can name what was missed. It carries no read files —
walking folders for something that was thrown away would be work spent on a
list nobody asked for.

> **Why the cursor still says "copy" over dead ground.** A `dropEffect` of
> `none` would be the honest cursor, and it stops the navigation just as well
> — but under the HTML drag-and-drop model a drag operation of `none` is
> cancelled outright: the browser fires `dragleave` instead of `drop`. The
> file would disappear without a word and `dropMissed` would never arrive.
> Telling the user what happened is worth more than a cursor that tells them
> a moment earlier.

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

### Nested zones

Zones nest. A drop is handled by the innermost zone it lands in, and the ones
around it stand down — no configuration needed:

```html
<!-- The page imports a document; the editor inside attaches files. -->
<div dropZone acceptedFiles=".eml" (fileDrop)="importMessage($event)">
  <div class="editor" dropZone (fileDrop)="attachFiles($event)">…</div>
</div>
```

A zone stands down when something else has **claimed** the event. Nested
dropzones claim for themselves; any other handler claims with
`claimDragEvent()` — it does not have to be a dropzone:

```ts
import { claimDragEvent } from '@h-k-dev/angular-file-drop';

// A ProseMirror plugin that embeds dropped images inline, and wants the
// surrounding attachment dropzone to leave them alone.
handleDrop(view, event) {
  if (!isImageDrop(event)) return false; // not ours: the zone outside takes it
  claimDragEvent(event);
  insertImages(view, event.dataTransfer.files);
  return true;
}
```

`preventDefault()` on the **drop** counts as a claim too: that is how a handler
consumes a drop, and every existing editor does it. `preventDefault()` on
`dragenter` and `dragover` does **not**. There it means something else — the
HTML drag-and-drop model's "a drop may land here", which every element that
accepts drops has to say on every drag, whether or not it will want this one.
Read as a claim, it put out the highlight of any zone wrapping an editor over
the very element the file was headed for, while the drop still went to the
zone. So the zone stays lit over an editor, and stands down at the drop if the
editor takes it.

A nested handler that will take the drop, and wants the zone to stand down
_during_ the drag as well, says so on the drag events:

```ts
handleDOMEvents: {
  dragover(view, event) {
    if (isImageDrag(event)) claimDragEvent(event);
    return false; // the editor still accepts the drag as usual
  },
},
```

> **Upgrading from 1.x:** a nested handler that relied on `preventDefault()` on
> `dragover` to keep the outer zone dark needs the `claimDragEvent` call above.
> Drops are unaffected.

#### Claiming without Angular

Everything in the library that is not the directive — the claim,
`containsFiles`, the accept filters, the folder walk, the types, `FILE_TYPES`
— lives in the `core` entry, which has no Angular in it. A plugin or a
framework-free core can import from it without depending on `@angular/core`:

```ts
import { claimDragEvent } from '@h-k-dev/angular-file-drop/core';
```

The main entry re-exports it; both paths share one registry.

#### `selfOnly`

Claiming is a _behavioural_ guarantee: it depends on the inner zone actually
running. `selfOnly` makes it **structural** — a drag that lands inside a nested
zone is never this zone's, whatever that zone did with it:

```html
<div dropZone selfOnly (fileDrop)="importMessage($event)">
  <div dropZone [disabled]="readOnly()" (fileDrop)="attachFiles($event)">…</div>
</div>
```

Without `selfOnly`, dragging over the _disabled_ inner zone highlights the
outer one — which then refuses the drop, because a disabled zone rejects it
rather than passing it up. `selfOnly` stops the outer zone advertising a drop
it will not accept. Reach for it when the two zones _mean_ different things, so
the outer one quietly picking up the inner one's leftovers would be wrong
rather than merely surprising.

Zones recognise each other through the `data-drop-zone` attribute the
directive puts on every host, so this works however you wrote the selector.

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

| Input                 | Type      | Default | Description                                                                                                      |
| --------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `multiple`            | `boolean` | `true`  | Allow more than one file. When `false`, only the first file is emitted.                                          |
| `directory`           | `boolean` | `true`  | Recursively traverse dropped folders.                                                                            |
| `directoryPicker`     | `boolean` | `false` | Make the click-to-open dialog a **folder** picker (`webkitdirectory`) rather than files.                         |
| `acceptedFiles`       | `string`  | `''`    | `accept`-style filter, e.g. `.png,image/*,application/pdf`. Empty accepts everything.                            |
| `ignoreHiddenFiles`   | `boolean` | `true`  | Drop dotfiles and files inside dot-folders (`.git`, `.DS_Store`, …).                                             |
| `clickable`           | `boolean` | `true`  | Open the file picker when the host element is clicked or activated via keyboard.                                 |
| `disabled`            | `boolean` | `false` | Ignore all drops, clicks, and keyboard activation.                                                               |
| `isManualActivation`  | `boolean` | `false` | Disable built-in click/keyboard activation so you can call the `open*` methods yourself.                         |
| `selfOnly`            | `boolean` | `false` | Ignore drags that land inside a **nested** dropzone, rather than on this one. See [Nested zones](#nested-zones). |
| `preventDocumentDrop` | `boolean` | `false` | Stop the browser navigating away when a file is dropped on the page but outside every zone. Document-wide.       |

### Outputs

| Output       | Payload         | Description                                                                       |
| ------------ | --------------- | --------------------------------------------------------------------------------- |
| `fileDrop`   | `FileDropEvent` | Emitted after files are dropped or chosen and filtered.                           |
| `dragEnter`  | `DragEvent`     | A valid file drag entered the element.                                            |
| `dragOver`   | `DragEvent`     | A valid file drag is moving over the element.                                     |
| `dragLeave`  | `DragEvent`     | A valid file drag left the element.                                               |
| `dropMissed` | `DragEvent`     | A file landed on the page but on no zone, and `preventDocumentDrop` swallowed it. |

### Public members

| Member                                 | Description                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isDragOver: Signal<boolean>`          | `true` while a valid file drag is over the element.                                                                                                      |
| `dragTypes: Signal<readonly string[]>` | The MIME types of the files in flight while `isDragOver` is true; empty otherwise. See [React to drag events](#react-to-drag-events-and-style-the-zone). |
| `openPicker(event?, options?)`         | Open the hidden file input. `options.directory` toggles folder mode.                                                                                     |
| `openFilePicker(event?)`               | Open a file picker.                                                                                                                                      |
| `openDirectoryPicker(event?)`          | Open a folder picker.                                                                                                                                    |

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

The directive's pure helpers are exported for advanced use and testing: `containsFiles`, `setDropEffect`, `isHiddenPath`, `filterHiddenFiles`, `isFileAccepted`, `filterAcceptedFiles`, `enforceMultiple`, `toDroppedFiles`, `readDroppedFiles`, `walkHandles`, `walkEntries`, `createHiddenFileInput`, `dragFileTypes`, `claimDragEvent`, `isDragEventClaimed`, `isNearestDropZone`, `DROP_ZONE_ATTRIBUTE`, and the `FILE_TYPES` map — all of them from the Angular-free `@h-k-dev/angular-file-drop/core` entry, which the main entry re-exports.

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

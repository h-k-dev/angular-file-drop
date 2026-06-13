# @h-k-dev/angular-file-drop

A lightweight, signal-based Angular directive for drag-and-drop file and folder
uploads. It supports directory traversal, `accept`-style type filtering, and
click-to-open file/directory pickers — all from a single `dropZone` directive.

- Standalone directive (no `NgModule`)
- Signal inputs/outputs
- Drag-and-drop **and** click-to-pick
- Folder drops with recursive traversal (File System Access API, with
  `webkitGetAsEntry` and `FileList` fallbacks)
- `accept`-style filtering and hidden-file skipping
- SSR-safe (the hidden `<input>` is only created in the browser)

## Installation

```bash
npm install @h-k-dev/angular-file-drop
```

Requires Angular `>= 17.3`.

## Usage

Import the standalone directive and apply `dropZone` to any element:

```ts
import { Component } from '@angular/core';
import { AngularFileDrop, FileDropEvent } from '@h-k-dev/angular-file-drop';

@Component({
  selector: 'app-uploader',
  imports: [AngularFileDrop],
  template: `
    <div
      dropZone
      [acceptedFiles]="'image/*,.pdf'"
      (fileDrop)="onDrop($event)"
    >
      Drop files here, or click to browse.
    </div>
  `,
})
export class UploaderComponent {
  onDrop(event: FileDropEvent) {
    for (const { file, relativePath } of event.files) {
      console.log(relativePath, file);
    }
  }
}
```

### Programmatic pickers

Grab the directive via its exported reference to open pickers from code:

```html
<div dropZone #zone="dropZone" [isManualActivation]="true">
  <button (click)="zone.openFilePicker($event)">Choose files</button>
  <button (click)="zone.openDirectoryPicker($event)">Choose a folder</button>
</div>
```

## Inputs

| Input                | Type      | Default | Description                                                              |
| -------------------- | --------- | ------- | ------------------------------------------------------------------------ |
| `multiple`           | `boolean` | `true`  | Allow selecting more than one file.                                      |
| `directory`          | `boolean` | `true`  | Traverse dropped folders recursively.                                    |
| `directoryPicker`    | `boolean` | `false` | Open the click picker in directory mode (`webkitdirectory`).             |
| `acceptedFiles`      | `string`  | `''`    | `accept`-style filter, e.g. `image/*,.pdf`.                              |
| `ignoreHiddenFiles`  | `boolean` | `true`  | Skip dot-files such as `.DS_Store`.                                      |
| `clickable`          | `boolean` | `true`  | Open the file picker when the host is clicked or activated by keyboard.  |
| `disabled`           | `boolean` | `false` | Ignore drops and clicks.                                                 |
| `isManualActivation` | `boolean` | `false` | Disable host click/keyboard activation (drive pickers programmatically). |

## Outputs

| Output      | Payload         | Description                               |
| ----------- | --------------- | ----------------------------------------- |
| `fileDrop`  | `FileDropEvent` | Emits the filtered files on drop or pick. |
| `dragEnter` | `DragEvent`     | A file drag entered the zone.             |
| `dragOver`  | `DragEvent`     | A file drag is over the zone.             |
| `dragLeave` | `DragEvent`     | A file drag left the zone.                |

`FileDropEvent.files` is an array of `DroppedFile`:

```ts
interface DroppedFile {
  file: File;
  relativePath: string; // e.g. "photos/2024/img.png" for folder drops
}
```

## Accept-type helpers

`FILE_TYPES` provides ready-made `accept` strings for common formats:

```ts
import { FILE_TYPES } from '@h-k-dev/angular-file-drop';

acceptedFiles = `${FILE_TYPES.PDF},${FILE_TYPES.ANY_IMAGE}`;
```

## License

MIT

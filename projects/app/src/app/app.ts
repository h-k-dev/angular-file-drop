import {
  Component,
  computed,
  DOCUMENT,
  inject,
  Pipe,
  PipeTransform,

  // Signals
  signal,
} from '@angular/core';

// Material
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';

// AngularFileDrop
import { AngularFileDrop, FILE_TYPES, FileDropEvent } from '@h-k-dev/angular-file-drop';

// Components
import { DropzoneHint1 } from './dropzone-hint-1/dropzone-hint-1';
import { DropzoneHint2 } from './dropzone-hint-2/dropzone-hint-2';
import { DropzoneHint3 } from './dropzone-hint-3/dropzone-hint-3';

@Pipe({
  name: 'fileSize',
  standalone: true,
})
export class FileSizePipe implements PipeTransform {
  transform(sizeInBytes: number): string {
    if (sizeInBytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(sizeInBytes) / Math.log(k));

    return parseFloat((sizeInBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

@Component({
  selector: '[app-root]',
  imports: [
    // Material
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    MatListModule,

    // Directives
    AngularFileDrop,
    FileSizePipe,

    // Components
    DropzoneHint1,
    DropzoneHint2,
    DropzoneHint3,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.dark-mode]': 'theme() === "dark"',
  },
})
export class App {
  protected readonly title = signal('app');
  document = inject(DOCUMENT);
  theme = signal<'light' | 'dark'>('light');
  themeClass = computed(() => `${this.theme()}-mode`);

  toggleTheme() {
    if (this.document.startViewTransition) {
      this.document.startViewTransition(() => {
        this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
      });

      return;
    }

    this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'));
  }

  zone1Uploads = signal<File[]>([]);
  zone2Uploads = signal<File[]>([]);

  /** Each inner zone can be switched off from its own corner. A disabled zone
      is an area that takes no files — not a hole: it refuses the drop rather
      than letting it fall through to zone 3 behind it. */
  zone1Disabled = signal(false);
  zone2Disabled = signal(false);

  onZone1Upload(event: FileDropEvent) {
    this.zone1Uploads.update((uploads) => [...uploads, ...event.files.map((f) => f.file)]);
  }

  onZone2Upload(event: FileDropEvent) {
    this.zone2Uploads.update((uploads) => [...uploads, ...event.files.map((f) => f.file)]);
  }

  // ─── Zone 3: the application itself ─────────────────────────────────────

  /**
   * What zone 3 takes: text documents, nothing else. Composed from the
   * library's `FILE_TYPES` map rather than a hand-written accept string, so
   * each entry carries both the extension and the MIME type — a `.docx` sent
   * by a system that forgot its MIME type still matches.
   */
  protected readonly documentTypes = [
    FILE_TYPES.PDF,
    FILE_TYPES.DOC,
    FILE_TYPES.DOCX,
    FILE_TYPES.TXT,
    FILE_TYPES.RTF,
  ].join(',');

  /**
   * A single document, not a list: zone 3 is `[multiple]="false"`, so a drop
   * of five replaces whatever was there with the first one that passes the
   * filter. The signal being a `File | null` rather than an array is the
   * model saying the same thing the zone does.
   */
  activeDocument = signal<File | null>(null);

  /** `preventDocumentDrop`: a file that lands on the page but on no zone at
      all is swallowed instead of navigating the browser away from the app. */
  preventMiss = signal(false);

  /** What the strip below the app says about its own lack of a dropzone. */
  protected readonly footerHint = computed(() =>
    this.preventMiss()
      ? 'No dropzone down here — but “Prevent miss” is on, so a file dropped on this strip is caught and reported instead of taking the page with it.'
      : 'No dropzone down here. Drop a file on this strip and the browser leaves the app — turn on “Prevent miss”.',
  );

  #snackBar = inject(MatSnackBar);

  /**
   * Swallowing a stray drop silently is its own kind of broken — the file
   * just disappears. `dropMissed` is the zone saying so, and this is the
   * demo's answer to it.
   */
  onMissedDrop(event: DragEvent) {
    const files = event.dataTransfer?.files;
    const what = files?.length === 1 ? files[0].name : `${files?.length ?? 0} files`;

    // Top centre: the miss happened somewhere on the page at large, so the
    // notice belongs over the app rather than tucked into a corner of it.
    this.#snackBar.open(`Yo, you missed! ${what} landed on no dropzone.`, 'Got it', {
      duration: 4000,
      verticalPosition: 'top',
      horizontalPosition: 'center',
    });
  }

  onDocumentDrop(event: FileDropEvent) {
    this.activeDocument.set(event.files[0]?.file ?? null);
  }
}

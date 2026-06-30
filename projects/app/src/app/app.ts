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

// AngularFileDrop
import {
  AngularFileDrop,
  FileDropEvent,
} from '../../../angular-file-drop/src/lib/angular-file-drop';

// Components
import { DropzoneHint1 } from './dropzone-hint-1/dropzone-hint-1';
import { DropzoneHint2 } from './dropzone-hint-2/dropzone-hint-2';

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

  onZone1Upload(event: FileDropEvent) {
    this.zone1Uploads.update((uploads) => [...uploads, ...event.files.map((f) => f.file)]);
  }

  onZone2Upload(event: FileDropEvent) {
    this.zone2Uploads.update((uploads) => [...uploads, ...event.files.map((f) => f.file)]);
  }
}

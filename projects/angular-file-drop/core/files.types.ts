import { FILE_TYPES } from './files.enum';

export type FileType = (typeof FILE_TYPES)[keyof typeof FILE_TYPES];

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

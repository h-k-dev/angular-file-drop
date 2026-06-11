import { FILE_TYPES } from './files.enum';

export type FileType = (typeof FILE_TYPES)[keyof typeof FILE_TYPES];

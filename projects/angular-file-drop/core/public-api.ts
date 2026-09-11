/*
 * Public API Surface of @h-k-dev/angular-file-drop/core — everything in the
 * library that is not the directive, with no Angular in it: the claim, the
 * drag-event helpers, the accept filters, the folder walk, the types and the
 * `FILE_TYPES` map. For code that must not depend on `@angular/core`. The
 * main entry re-exports all of it.
 */

export * from './claim';
export * from './utils';
export * from './files.types';
export { FILE_TYPES } from './files.enum';

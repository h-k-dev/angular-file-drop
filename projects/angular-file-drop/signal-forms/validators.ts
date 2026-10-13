import { validate } from '@angular/forms/signals';
import type {
  LogicFn,
  PathKind,
  SchemaPath,
  SchemaPathRules,
  ValidationError,
} from '@angular/forms/signals';

import { type DroppedFile, isFileAccepted } from '@h-k-dev/angular-file-drop/core';

/** What a file field holds: one file (`DropZoneControl`) or a list (`DropZoneFilesControl`). */
export type FileFieldValue = File | null | readonly DroppedFile[];

/** The files in a file field's value, whichever shape it has. */
function filesOf(value: FileFieldValue): File[] {
  if (value == null) return [];
  if (value instanceof File) return [value];
  return value.map((dropped) => dropped.file);
}

export interface FileValidatorConfig<
  TValue extends FileFieldValue,
  TPathKind extends PathKind = PathKind.Root,
> {
  /** A user-facing message (or translation key) carried on the error. */
  message?: string | LogicFn<TValue, string, TPathKind>;
}

/** The `kind` of a {@link fileAccept} error. */
export const FILE_ACCEPT = 'fileAccept';

export interface FileAcceptValidationError extends ValidationError {
  readonly kind: typeof FILE_ACCEPT;
  /** The first file that does not match, so a message can name it. */
  readonly file: File;
  readonly accept: string;
}

/**
 * The file — every file, for a list — matches `accept`, in the
 * `<input type="file">` syntax: extensions (`.pdf`), MIME types
 * (`application/pdf`) and wildcards (`image/*`). The same test the dropzone's
 * `acceptedFiles` filters with, so the two cannot disagree.
 *
 * An empty field passes: that is `required()`'s to say (or `minLength` for a
 * list).
 */
export function fileAccept<
  TValue extends FileFieldValue,
  TPathKind extends PathKind = PathKind.Root,
>(
  path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
  accept: string,
  config?: FileValidatorConfig<TValue, TPathKind>,
): void {
  validate(path, (ctx) => {
    const file = filesOf(ctx.value()).find((candidate) => !isFileAccepted(candidate, accept));
    if (!file) return undefined;

    const message = config?.message;
    return {
      kind: FILE_ACCEPT,
      message: message instanceof Function ? message(ctx) : message,
      file,
      accept,
    } satisfies FileAcceptValidationError;
  });
}

/** The `kind` of a {@link maxFileSize} error. */
export const MAX_FILE_SIZE = 'maxFileSize';

export interface MaxFileSizeValidationError extends ValidationError {
  readonly kind: typeof MAX_FILE_SIZE;
  /** The first file over the limit, so a message can name it. */
  readonly file: File;
  /** The limit, in bytes. */
  readonly maxSize: number;
}

/**
 * The file — every file, for a list — is at most `maxSize` bytes. An empty
 * field passes.
 */
export function maxFileSize<
  TValue extends FileFieldValue,
  TPathKind extends PathKind = PathKind.Root,
>(
  path: SchemaPath<TValue, SchemaPathRules.Supported, TPathKind>,
  maxSize: number,
  config?: FileValidatorConfig<TValue, TPathKind>,
): void {
  validate(path, (ctx) => {
    const file = filesOf(ctx.value()).find((candidate) => candidate.size > maxSize);
    if (!file) return undefined;

    const message = config?.message;
    return {
      kind: MAX_FILE_SIZE,
      message: message instanceof Function ? message(ctx) : message,
      file,
      maxSize,
    } satisfies MaxFileSizeValidationError;
  });
}

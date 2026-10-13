import {
  booleanAttribute,
  Directive,
  ElementRef,
  inject,

  // Signals
  input,
  model,
  output,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

// Across entry points, always by package name — see the main entry.
import {
  AngularFileDrop,
  DROP_ZONE_DEFAULTS,
  type DropZoneDefaults,
} from '@h-k-dev/angular-file-drop';
import type { DroppedFile } from '@h-k-dev/angular-file-drop/core';

/**
 * What both controls share: the dropzone they sit on, the field state the
 * `[formField]` binding writes down, and the way back up — `touch` on blur and
 * after a file arrives, `focus()` for `focusFirstInvalid`.
 *
 * The zone's own element is the control. That is where focus lands (the zone
 * is a button while it is clickable), where the drop lands, and where
 * assistive technology is told the field is invalid.
 */
@Directive({
  host: {
    '(blur)': 'touch.emit()',
    '[attr.aria-invalid]': 'invalid() && touched()',
    '[attr.aria-readonly]': 'readonly() || null',
  },
})
abstract class DropZoneControlBase<TValue> implements FormValueControl<TValue> {
  abstract readonly value: FormValueControl<TValue>['value'];

  touched = input(false);
  invalid = input(false);
  /** Kept as it is: drops and picks are ignored. */
  readonly = input(false);
  touch = output<void>();

  protected zone = inject(AngularFileDrop, { self: true });
  #host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    this.zone.fileDrop.subscribe(({ files }) => {
      if (this.readonly() || !files.length) return;
      this.take(files);
      this.touch.emit();
    });
  }

  /** The files of a drop or a pick into the value. */
  protected abstract take(files: DroppedFile[]): void;

  focus(options?: FocusOptions) {
    this.#host.nativeElement.focus(options);
  }
}

/** One file, no folders, and the wrong file kept: `fileAccept` says why. */
const SINGLE_FILE_DEFAULTS: DropZoneDefaults = {
  multiple: false,
  directory: false,
  filterAccepted: false,
};

/** The wrong file kept, for `fileAccept` to say why. */
const FILE_LIST_DEFAULTS: DropZoneDefaults = { filterAccepted: false };

/**
 * Makes a dropzone a signal-forms control for ONE file. The value is
 * `File | null`, so `required()` reads an empty field as empty.
 *
 * On the same element it changes the zone's defaults: one file, no folder
 * traversal, and `filterAccepted` off — `acceptedFiles` narrows the picker,
 * and a wrong dropped file lands in the field for `fileAccept` to report,
 * instead of vanishing without a word. A bound input on the zone still wins.
 *
 * ```html
 * <div dropZone dropZoneControl acceptedFiles=".pdf" [formField]="form.contract">
 *   {{ form.contract().value()?.name ?? 'Drop a PDF or click to choose' }}
 * </div>
 * ```
 */
@Directive({
  selector: '[dropZoneControl]',
  exportAs: 'dropZoneControl',
  providers: [{ provide: DROP_ZONE_DEFAULTS, useValue: SINGLE_FILE_DEFAULTS }],
})
export class DropZoneControl extends DropZoneControlBase<File | null> {
  value = model<File | null>(null);

  protected take(files: DroppedFile[]) {
    this.value.set(files[0].file);
  }
}

/**
 * Makes a dropzone a signal-forms control for a LIST of files, folder paths
 * included. The value is `readonly DroppedFile[]`.
 *
 * A drop replaces the list, as a native `<input type="file" multiple>`
 * replaces its selection; with `append`, it adds to it.
 *
 * `required()` does not read an empty list as empty — signal forms only treat
 * `''`, `false`, `null` and `undefined` that way. Ask for at least one file
 * with `minLength(path, 1)`; `maxLength` caps the count.
 *
 * ```html
 * <div dropZone dropZoneFilesControl append [formField]="form.attachments">…</div>
 * ```
 */
@Directive({
  selector: '[dropZoneFilesControl]',
  exportAs: 'dropZoneFilesControl',
  providers: [{ provide: DROP_ZONE_DEFAULTS, useValue: FILE_LIST_DEFAULTS }],
})
export class DropZoneFilesControl extends DropZoneControlBase<readonly DroppedFile[]> {
  value = model<readonly DroppedFile[]>([]);

  /** Add a drop to the list rather than replace it. */
  append = input(false, { transform: booleanAttribute });

  protected take(files: DroppedFile[]) {
    this.value.update((current) => (this.append() ? [...current, ...files] : files));
  }
}

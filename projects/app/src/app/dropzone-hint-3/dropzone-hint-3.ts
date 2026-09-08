import { Component } from '@angular/core';

/**
 * Zone 3's hint: a courier crossing the toolbar with a single parcel.
 *
 * The other two hints fill a panel; this one has a strip of toolbar, so it is
 * built horizontally and reads as a flight path rather than a target. Same
 * warm register as zone 1 — the same sky, lower down — and it says the zone's
 * one rule out loud: a document at a time.
 */
@Component({
  selector: 'app-dropzone-hint-3',
  imports: [],
  templateUrl: './dropzone-hint-3.html',
  styleUrl: './dropzone-hint-3.scss',
})
export class DropzoneHint3 {
  /** Counts only — the SCSS places and times each one by `nth-child`. */
  clouds = Array.from({ length: 2 });
  motes = Array.from({ length: 3 });
}

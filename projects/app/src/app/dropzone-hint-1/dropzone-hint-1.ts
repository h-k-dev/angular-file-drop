import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dropzone-hint-1',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './dropzone-hint-1.html',
  styleUrl: './dropzone-hint-1.scss',
})
export class DropzoneHint1 {
  /** What is in flight — the zone's `dragTypes`, one entry per file. Only
      the count is shown: a type is all a drag reveals, and a name would be
      more than the browser is willing to say before the drop. */
  types = input<readonly string[]>([]);
  count = computed(() => this.types().length);

  // Generate arrays to loop over in the template
  petals = Array.from({ length: 35 });
  motes = Array.from({ length: 20 });
}

import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dropzone-hint-1',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './dropzone-hint-1.html',
  styleUrl: './dropzone-hint-1.scss',
})
export class DropzoneHint1 {
  // Generate arrays to loop over in the template
  petals = Array.from({ length: 35 });
  motes = Array.from({ length: 20 });
}

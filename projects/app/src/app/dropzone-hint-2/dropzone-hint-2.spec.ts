import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropzoneHint2 } from './dropzone-hint-2';

describe('DropzoneHint2', () => {
  let component: DropzoneHint2;
  let fixture: ComponentFixture<DropzoneHint2>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropzoneHint2],
    }).compileComponents();

    fixture = TestBed.createComponent(DropzoneHint2);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

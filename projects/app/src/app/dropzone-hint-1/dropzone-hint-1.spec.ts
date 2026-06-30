import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropzoneHint1 } from './dropzone-hint-1';

describe('DropzoneHint1', () => {
  let component: DropzoneHint1;
  let fixture: ComponentFixture<DropzoneHint1>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropzoneHint1],
    }).compileComponents();

    fixture = TestBed.createComponent(DropzoneHint1);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

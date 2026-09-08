import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DropzoneHint3 } from './dropzone-hint-3';

describe('DropzoneHint3', () => {
  let component: DropzoneHint3;
  let fixture: ComponentFixture<DropzoneHint3>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropzoneHint3],
    }).compileComponents();

    fixture = TestBed.createComponent(DropzoneHint3);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

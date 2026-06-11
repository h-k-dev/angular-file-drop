import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AngularFileDrop } from './angular-file-drop';

describe('AngularFileDrop', () => {
  let component: AngularFileDrop;
  let fixture: ComponentFixture<AngularFileDrop>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AngularFileDrop],
    }).compileComponents();

    fixture = TestBed.createComponent(AngularFileDrop);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

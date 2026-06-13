import { TestBed } from '@angular/core/testing';
import { AngularFileDrop } from './angular-file-drop';

describe('DopDrop', () => {
  it('should create an instance', () => {
    const directive = TestBed.runInInjectionContext(() => new AngularFileDrop());
    expect(directive).toBeTruthy();
  });
});

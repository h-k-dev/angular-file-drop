import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AngularFileDrop } from './angular-file-drop';

@Component({
  imports: [AngularFileDrop],
  template: `<div dropZone></div>`,
})
class HostComponent {}

describe('AngularFileDrop', () => {
  it('should create an instance', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement
      .query(By.directive(AngularFileDrop))
      .injector.get(AngularFileDrop);

    expect(directive).toBeTruthy();
  });
});

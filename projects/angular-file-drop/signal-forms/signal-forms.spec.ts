import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, minLength, readonly, required } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';

import { AngularFileDrop } from '@h-k-dev/angular-file-drop';
import type { DroppedFile } from '@h-k-dev/angular-file-drop/core';
import { DropZoneControl, DropZoneFilesControl } from './drop-zone-control';
import { FILE_ACCEPT, fileAccept, MAX_FILE_SIZE, maxFileSize } from './validators';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A drop of `files`, carried the way a browser without folder APIs carries it. */
function drop(...files: File[]): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items: [], files, effectAllowed: 'copy', dropEffect: 'copy' },
  });
  return event;
}

const file = (name: string, size = 1) => new File(['x'.repeat(size)], name);

@Component({
  imports: [AngularFileDrop, DropZoneControl, FormField],
  template: `<div dropZone dropZoneControl acceptedFiles=".pdf" [formField]="f.contract"></div>`,
})
class SingleHost {
  locked = signal(false);
  model = signal<{ contract: File | null }>({ contract: null });
  f = form(this.model, (path) => {
    readonly(path.contract, { when: () => this.locked() });
    required(path.contract);
    fileAccept(path.contract, '.pdf', { message: 'PDF only' });
    maxFileSize(path.contract, 10);
  });
}

@Component({
  imports: [AngularFileDrop, DropZoneFilesControl, FormField],
  template: `<div
    dropZone
    dropZoneFilesControl
    [append]="append()"
    [formField]="f.attachments"
  ></div>`,
})
class ListHost {
  append = signal(false);
  model = signal<{ attachments: readonly DroppedFile[] }>({ attachments: [] });
  f = form(this.model, (path) => {
    minLength(path.attachments, 1);
    fileAccept(path.attachments, '.pdf');
  });
}

describe('DropZoneControl', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(SingleHost);
    await fixture.whenStable();
    const zone = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
    return { fixture, host: fixture.componentInstance, zone };
  };

  it('starts empty, and required() reads it as empty', async () => {
    const { host } = await setup();

    expect(host.f.contract().value()).toBeNull();
    expect(
      host.f
        .contract()
        .errors()
        .map((error) => error.kind),
    ).toEqual(['required']);
  });

  it('switches the zone on its element to one file and no folders', async () => {
    const { fixture } = await setup();
    const zone = fixture.debugElement.children[0].injector.get(AngularFileDrop);

    expect(zone.multiple()).toBe(false);
    expect(zone.directory()).toBe(false);
    expect(zone.filterAccepted()).toBe(false);
  });

  it('puts a dropped file into the field and marks it touched', async () => {
    const { fixture, host, zone } = await setup();
    const contract = file('contract.pdf');

    zone.dispatchEvent(drop(contract));
    await settle();
    await fixture.whenStable();

    expect(host.f.contract().value()).toBe(contract);
    expect(host.f.contract().touched()).toBe(true);
    expect(host.f.contract().valid()).toBe(true);
  });

  it('keeps a wrong file for fileAccept to report — by name, with the message', async () => {
    const { fixture, host, zone } = await setup();
    const notes = file('notes.txt');

    zone.dispatchEvent(drop(notes));
    await settle();
    await fixture.whenStable();

    const [error] = host.f.contract().errors();
    expect(error).toMatchObject({
      kind: FILE_ACCEPT,
      message: 'PDF only',
      file: notes,
      accept: '.pdf',
    });
    expect(zone.getAttribute('aria-invalid')).toBe('true');
  });

  it('reports a file over maxFileSize', async () => {
    const { fixture, host, zone } = await setup();

    zone.dispatchEvent(drop(file('big.pdf', 11)));
    await settle();
    await fixture.whenStable();

    expect(host.f.contract().errors()).toMatchObject([{ kind: MAX_FILE_SIZE, maxSize: 10 }]);
  });

  it('is what focusFirstInvalid focuses', async () => {
    const { host, zone } = await setup();

    host.f.contract().focusBoundControl();

    expect(document.activeElement).toBe(zone);
  });

  it('ignores drops while the schema makes it readonly', async () => {
    const { fixture, host, zone } = await setup();
    host.locked.set(true);
    await fixture.whenStable();

    zone.dispatchEvent(drop(file('contract.pdf')));
    await settle();
    await fixture.whenStable();

    expect(host.f.contract().value()).toBeNull();
    expect(zone.getAttribute('aria-readonly')).toBe('true');
  });
});

describe('DropZoneFilesControl', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(ListHost);
    await fixture.whenStable();
    const zone = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
    return { fixture, host: fixture.componentInstance, zone };
  };

  it('needs minLength(1) for "at least one file": required() does not read [] as empty', async () => {
    const { host } = await setup();

    expect(
      host.f
        .attachments()
        .errors()
        .map((error) => error.kind),
    ).toEqual(['minLength']);
  });

  it('replaces the list with a drop, as a native multiple input does', async () => {
    const { fixture, host, zone } = await setup();

    zone.dispatchEvent(drop(file('a.pdf')));
    await settle();
    zone.dispatchEvent(drop(file('b.pdf'), file('c.pdf')));
    await settle();
    await fixture.whenStable();

    expect(
      host.f
        .attachments()
        .value()
        .map((dropped) => dropped.file.name),
    ).toEqual(['b.pdf', 'c.pdf']);
  });

  it('adds to the list with append', async () => {
    const { fixture, host, zone } = await setup();
    host.append.set(true);
    await fixture.whenStable();

    zone.dispatchEvent(drop(file('a.pdf')));
    await settle();
    zone.dispatchEvent(drop(file('b.pdf')));
    await settle();
    await fixture.whenStable();

    expect(
      host.f
        .attachments()
        .value()
        .map((dropped) => dropped.file.name),
    ).toEqual(['a.pdf', 'b.pdf']);
  });

  it('names the first wrong file in a list', async () => {
    const { fixture, host, zone } = await setup();
    const wrong = file('notes.txt');

    zone.dispatchEvent(drop(file('a.pdf'), wrong));
    await settle();
    await fixture.whenStable();

    expect(host.f.attachments().errors()).toMatchObject([{ kind: FILE_ACCEPT, file: wrong }]);
  });
});

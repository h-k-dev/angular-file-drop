import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { AngularFileDrop } from './angular-file-drop';
import { claimDragEvent, DROP_ZONE_ATTRIBUTE } from './utils';
import type { FileDropEvent } from './files.types';

@Component({
  imports: [AngularFileDrop],
  template: `<div dropZone></div>`,
})
class HostComponent {}

/**
 * An outer zone wrapped around an inner one, with a plain element in between
 * — the shape that makes nesting interesting: a drop can land on the outer
 * zone, on the gap, or inside the inner zone.
 */
@Component({
  imports: [AngularFileDrop],
  template: `
    <div
      class="outer"
      dropZone
      [selfOnly]="selfOnly()"
      [clickable]="false"
      (fileDrop)="outerDrops.push($event)"
    >
      <div class="gap">
        <div
          class="inner"
          dropZone
          [disabled]="innerDisabled()"
          [clickable]="false"
          (fileDrop)="innerDrops.push($event)"
        >
          <span class="leaf"></span>
        </div>
      </div>
    </div>
  `,
})
class NestedHost {
  readonly selfOnly = signal(false);
  readonly innerDisabled = signal(false);
  readonly outerDrops: FileDropEvent[] = [];
  readonly innerDrops: FileDropEvent[] = [];
}

/** A drag event carrying one file, with `items` left empty so the read takes
    the plain-FileList path (no File System Access API in the test env). */
function fileDrag(type: 'dragenter' | 'dragover' | 'drop', name = 'a.txt'): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  const files = [new File(['x'], name, { type: 'text/plain' })];
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items: [], files, effectAllowed: 'copy', dropEffect: 'copy' },
  });
  return event;
}

/** Drops settle after an await: `onDrop` reads the DataTransfer async. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AngularFileDrop', () => {
  it('should create an instance', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const directive = fixture.debugElement
      .query(By.directive(AngularFileDrop))
      .injector.get(AngularFileDrop);

    expect(directive).toBeTruthy();
  });

  it('marks its host so other zones can recognise it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
    expect(host.hasAttribute(DROP_ZONE_ATTRIBUTE)).toBe(true);
  });

  describe('a drop claimed by something else', () => {
    it('is left alone when a nested handler calls claimDragEvent', async () => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const drops: FileDropEvent[] = [];
      directive.fileDrop.subscribe((event) => drops.push(event));

      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
      const event = fileDrag('drop');
      claimDragEvent(event);
      host.dispatchEvent(event);
      await settle();

      expect(drops).toHaveLength(0);
      // Claiming must not have to prevent the default to be heard.
      expect(event.defaultPrevented).toBe(false);
    });

    it('is left alone when something calls preventDefault, as before', async () => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const drops: FileDropEvent[] = [];
      directive.fileDrop.subscribe((event) => drops.push(event));

      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
      const event = fileDrag('drop');
      event.preventDefault();
      host.dispatchEvent(event);
      await settle();

      expect(drops).toHaveLength(0);
    });

    it('still handles a drop nobody claimed', async () => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const drops: FileDropEvent[] = [];
      directive.fileDrop.subscribe((event) => drops.push(event));

      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
      host.dispatchEvent(fileDrag('drop'));
      await settle();

      expect(drops).toHaveLength(1);
      expect(drops[0].files.map((f) => f.file.name)).toEqual(['a.txt']);
    });

    it('does not light up isDragOver for a claimed drag', () => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);

      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
      const event = fileDrag('dragenter');
      claimDragEvent(event);
      host.dispatchEvent(event);

      expect(directive.isDragOver()).toBe(false);
    });
  });

  describe('nested zones', () => {
    it('gives a drop on the inner zone to the inner zone only', async () => {
      const fixture = TestBed.createComponent(NestedHost);
      fixture.detectChanges();
      const host = fixture.componentInstance;

      (fixture.nativeElement.querySelector('.leaf') as HTMLElement).dispatchEvent(fileDrag('drop'));
      await settle();

      expect(host.innerDrops).toHaveLength(1);
      expect(host.outerDrops).toHaveLength(0);
    });

    it('gives a drop between the zones to the outer one', async () => {
      const fixture = TestBed.createComponent(NestedHost);
      fixture.detectChanges();
      const host = fixture.componentInstance;

      (fixture.nativeElement.querySelector('.gap') as HTMLElement).dispatchEvent(fileDrag('drop'));
      await settle();

      expect(host.outerDrops).toHaveLength(1);
      expect(host.innerDrops).toHaveLength(0);
    });

    it('gives nobody a drop that lands on a disabled inner zone', async () => {
      const fixture = TestBed.createComponent(NestedHost);
      fixture.componentInstance.innerDisabled.set(true);
      fixture.detectChanges();
      const host = fixture.componentInstance;

      (fixture.nativeElement.querySelector('.leaf') as HTMLElement).dispatchEvent(fileDrag('drop'));
      await settle();

      // A disabled zone refuses the drop rather than passing it up: it is an
      // area that does not take files, not a hole in the page.
      expect(host.innerDrops).toHaveLength(0);
      expect(host.outerDrops).toHaveLength(0);
    });

    it('without selfOnly, the outer zone highlights over a disabled inner one', () => {
      // The inconsistency `selfOnly` exists to fix. `onDragEnter` on a
      // disabled zone returns without claiming, so the drag reaches the outer
      // zone and lights it up — promising a drop that the test above shows is
      // then refused. Pinned so the behaviour cannot change unnoticed.
      const fixture = TestBed.createComponent(NestedHost);
      fixture.componentInstance.innerDisabled.set(true);
      fixture.detectChanges();

      const outer = fixture.debugElement.query(By.css('.outer')).injector.get(AngularFileDrop);

      (fixture.nativeElement.querySelector('.leaf') as HTMLElement).dispatchEvent(
        fileDrag('dragenter'),
      );

      expect(outer.isDragOver()).toBe(true);
    });

    it('selfOnly still takes drops that land outside the nested zone', async () => {
      const fixture = TestBed.createComponent(NestedHost);
      fixture.componentInstance.selfOnly.set(true);
      fixture.detectChanges();
      const host = fixture.componentInstance;

      (fixture.nativeElement.querySelector('.gap') as HTMLElement).dispatchEvent(fileDrag('drop'));
      await settle();

      expect(host.outerDrops).toHaveLength(1);
    });

    it('selfOnly stops the outer zone highlighting over a nested one', () => {
      // The fix for the case above: the outer zone no longer advertises a
      // drop it will not accept.
      const fixture = TestBed.createComponent(NestedHost);
      fixture.componentInstance.selfOnly.set(true);
      fixture.componentInstance.innerDisabled.set(true);
      fixture.detectChanges();

      const outer = fixture.debugElement.query(By.css('.outer')).injector.get(AngularFileDrop);

      (fixture.nativeElement.querySelector('.leaf') as HTMLElement).dispatchEvent(
        fileDrag('dragenter'),
      );

      expect(outer.isDragOver()).toBe(false);
    });

    it('drops its highlight when the drag moves on into a nested zone', () => {
      // The bug this guards: a drag that enters the outer zone and then moves
      // into an inner one used to leave *both* lit. `dragleave` cannot fix it
      // — leaving a zone for a child of that zone reports a relatedTarget the
      // zone still contains, which correctly reads as "staying put" — so the
      // outer zone has to stand down when it declines a drag instead.
      const fixture = TestBed.createComponent(NestedHost);
      fixture.detectChanges();

      const outer = fixture.debugElement.query(By.css('.outer')).injector.get(AngularFileDrop);
      const inner = fixture.debugElement.query(By.css('.inner')).injector.get(AngularFileDrop);
      const outerEl = fixture.nativeElement.querySelector('.outer') as HTMLElement;
      const leaf = fixture.nativeElement.querySelector('.leaf') as HTMLElement;

      // Over the outer zone's own ground first.
      outerEl.dispatchEvent(fileDrag('dragenter'));
      outerEl.dispatchEvent(fileDrag('dragover'));
      expect(outer.isDragOver()).toBe(true);

      // Then on into the inner one.
      leaf.dispatchEvent(fileDrag('dragenter'));
      leaf.dispatchEvent(fileDrag('dragover'));

      expect(inner.isDragOver()).toBe(true);
      expect(outer.isDragOver()).toBe(false);
    });

    it('keeps the outer highlight when the drag moves within the outer zone', () => {
      // The other half: moving between plain children must not flicker it.
      const fixture = TestBed.createComponent(NestedHost);
      fixture.detectChanges();

      const outer = fixture.debugElement.query(By.css('.outer')).injector.get(AngularFileDrop);
      const outerEl = fixture.nativeElement.querySelector('.outer') as HTMLElement;
      const gap = fixture.nativeElement.querySelector('.gap') as HTMLElement;

      outerEl.dispatchEvent(fileDrag('dragenter'));
      gap.dispatchEvent(fileDrag('dragover'));

      expect(outer.isDragOver()).toBe(true);
    });

    it('drops its highlight when any nested handler claims the drag', () => {
      // Not just nested dropzones: an editor or canvas that claims the drag
      // should take the highlight with it.
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;

      host.dispatchEvent(fileDrag('dragenter'));
      expect(directive.isDragOver()).toBe(true);

      const claimedMove = fileDrag('dragover');
      claimDragEvent(claimedMove);
      host.dispatchEvent(claimedMove);

      expect(directive.isDragOver()).toBe(false);
    });

    it('selfOnly still highlights for a drag on the outer zone itself', () => {
      const fixture = TestBed.createComponent(NestedHost);
      fixture.componentInstance.selfOnly.set(true);
      fixture.detectChanges();

      const outer = fixture.debugElement.query(By.css('.outer')).injector.get(AngularFileDrop);

      (fixture.nativeElement.querySelector('.gap') as HTMLElement).dispatchEvent(
        fileDrag('dragenter'),
      );

      expect(outer.isDragOver()).toBe(true);
    });
  });
});

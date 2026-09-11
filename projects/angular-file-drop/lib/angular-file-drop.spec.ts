import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { AngularFileDrop } from './angular-file-drop';
import {
  claimDragEvent,
  DROP_ZONE_ATTRIBUTE,
  type FileDropEvent,
} from '@h-k-dev/angular-file-drop/core';

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

/** A drag event carrying one file, with `items` left empty by default so the
    read takes the plain-FileList path (no File System Access API in the test
    env). Pass `items` only for drag-phase events, which never read. */
function fileDrag(
  type: 'dragenter' | 'dragover' | 'drop',
  name = 'a.txt',
  items: { kind: string; type: string }[] = [],
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  const files = [new File(['x'], name, { type: 'text/plain' })];
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], items, files, effectAllowed: 'copy', dropEffect: 'copy' },
  });
  return event;
}

/** A drag of something that is not a file — text, a link, an in-page item. */
function textDrag(type: 'dragover' | 'drop'): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['text/plain'], items: [], files: [], effectAllowed: 'copy' },
  });
  return event;
}

/**
 * A zone alongside ground that is not a zone — `.outside` is where a drop
 * that missed lands, which is the only place `preventDocumentDrop` shows up.
 */
@Component({
  imports: [AngularFileDrop],
  template: `
    @if (present()) {
      <div
        class="zone"
        dropZone
        [clickable]="false"
        [preventDocumentDrop]="prevent()"
        (fileDrop)="drops.push($event)"
        (dropMissed)="missed.push($event)"
      ></div>
    }
    <div class="outside"></div>
  `,
})
class PreventHost {
  readonly prevent = signal(false);
  readonly present = signal(true);
  readonly missed: DragEvent[] = [];
  readonly drops: FileDropEvent[] = [];
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

    it('stays lit over a nested element that merely accepts the drag', () => {
      // An editor answers every dragover with preventDefault — the spec's "a
      // drop may land here" — without meaning to take this drop. That used
      // to read as a claim and put the highlight out over the very element
      // the file was headed for, while the drop still came here.
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;

      const enter = fileDrag('dragenter');
      enter.preventDefault();
      host.dispatchEvent(enter);
      const over = fileDrag('dragover');
      over.preventDefault();
      host.dispatchEvent(over);

      expect(directive.isDragOver()).toBe(true);
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

  describe('dragTypes', () => {
    const png = { kind: 'file', type: 'image/png' };
    const pdf = { kind: 'file', type: 'application/pdf' };

    function setup() {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const directive = fixture.debugElement
        .query(By.directive(AngularFileDrop))
        .injector.get(AngularFileDrop);
      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;
      return { directive, host };
    }

    it('names the files in flight while the drag is over the zone', () => {
      const { directive, host } = setup();

      host.dispatchEvent(fileDrag('dragenter', 'a.png', [png, pdf]));

      expect(directive.dragTypes()).toEqual(['image/png', 'application/pdf']);
    });

    it('is empty again once the drag leaves', () => {
      const { directive, host } = setup();
      host.dispatchEvent(fileDrag('dragenter', 'a.png', [png]));

      const leave = new Event('dragleave', { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(leave, 'dataTransfer', { value: { types: ['Files'] } });
      Object.defineProperty(leave, 'relatedTarget', { value: document.body });
      host.dispatchEvent(leave);

      expect(directive.isDragOver()).toBe(false);
      expect(directive.dragTypes()).toEqual([]);
    });

    it('is empty when the browser says nothing about the items', () => {
      const { directive, host } = setup();

      host.dispatchEvent(fileDrag('dragenter'));

      expect(directive.isDragOver()).toBe(true);
      expect(directive.dragTypes()).toEqual([]);
    });

    it('does not count an unchanged list as a change', () => {
      const { directive, host } = setup();
      host.dispatchEvent(fileDrag('dragenter', 'a.png', [png]));
      const before = directive.dragTypes();

      host.dispatchEvent(fileDrag('dragover', 'a.png', [png]));

      // The same array back: `dragover` fires every few pixels, and a hint
      // computed from this re-rendering on each would be churn for nothing.
      expect(directive.dragTypes()).toBe(before);
    });
  });

  describe('cursor', () => {
    it('offers a pointer where a click opens the picker', () => {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.detectChanges();
      const host = fixture.nativeElement.querySelector('[dropZone]') as HTMLElement;

      expect(host.style.cursor).toBe('pointer');
    });

    it('leaves the cursor to the host where a click does nothing', () => {
      // An inline `auto` here used to override whatever the host's own
      // stylesheet said — `cursor: text` on an editing surface, say.
      const fixture = TestBed.createComponent(NestedHost);
      fixture.detectChanges();
      const outer = fixture.nativeElement.querySelector('.outer') as HTMLElement;

      expect(outer.style.cursor).toBe('');
    });
  });

  describe('preventDocumentDrop', () => {
    function setup(prevent: boolean) {
      const fixture = TestBed.createComponent(PreventHost);
      fixture.componentInstance.prevent.set(prevent);
      fixture.detectChanges();

      const query = (selector: string) =>
        fixture.nativeElement.querySelector(selector) as HTMLElement;

      return {
        fixture,
        host: fixture.componentInstance,
        zone: query('.zone'),
        outside: query('.outside'),
      };
    }

    it('lets a stray drop navigate when it is off', () => {
      const { outside } = setup(false);

      const over = fileDrag('dragover');
      outside.dispatchEvent(over);

      expect(over.defaultPrevented).toBe(false);
    });

    it('cancels a drag that missed every zone', () => {
      const { outside } = setup(true);

      const over = fileDrag('dragover');
      const drop = fileDrag('drop');
      outside.dispatchEvent(over);
      outside.dispatchEvent(drop);

      // Both halves matter: without cancelling the dragover the browser
      // never fires a cancellable drop, it just navigates.
      expect(over.defaultPrevented).toBe(true);
      expect(drop.defaultPrevented).toBe(true);
    });

    it('leaves the drop effect real, so the browser still delivers the drop', () => {
      const { outside } = setup(true);

      const over = fileDrag('dragover');
      outside.dispatchEvent(over);

      // `'none'` would be the honest cursor — "not here", said while the
      // drag is still in flight — and it stops the navigation just as well.
      // But under the HTML drag-and-drop model a drag operation of `none` is
      // cancelled outright: the browser fires `dragleave` instead of `drop`.
      // The file would vanish in silence and `dropMissed` would never
      // arrive. Pinned here because every synthetic test still passes when
      // this is wrong — a hand-dispatched `drop` bypasses the very decision
      // this is about.
      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer!.dropEffect).not.toBe('none');
    });

    it('leaves a drag over the zone itself alone', () => {
      const { zone } = setup(true);

      const over = fileDrag('dragover');
      zone.dispatchEvent(over);

      // Cancelled by the zone accepting the drag, and the document handler
      // stands down rather than touching it a second time.
      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer!.dropEffect).toBe('copy');
    });

    it('leaves a drag another handler claimed alone', () => {
      const { outside } = setup(true);

      // Claimed off in the corner of the page by something that is not a
      // dropzone — an editor, a canvas. Not ours to cancel: claiming does
      // not prevent the default, so an untouched event still reads as
      // uncancelled here.
      const over = fileDrag('dragover');
      claimDragEvent(over);
      outside.dispatchEvent(over);

      expect(over.defaultPrevented).toBe(false);
    });

    it('leaves a drag some element accepted alone, drop effect included', () => {
      const { outside } = setup(true);

      // An editor said "a drop may land here" and set its own cursor. Not a
      // claim — but a drop will fire, so there is nothing to cancel, and the
      // effect it chose is not ours to overwrite.
      const over = fileDrag('dragover');
      over.dataTransfer!.dropEffect = 'move';
      over.preventDefault();
      outside.dispatchEvent(over);

      expect(over.dataTransfer!.dropEffect).toBe('move');
    });

    it('ignores drags that carry no files', () => {
      const { outside } = setup(true);

      // Dragging text or an in-page item is somebody else's business, and
      // cancelling it would break their drop.
      const over = textDrag('dragover');
      outside.dispatchEvent(over);

      expect(over.defaultPrevented).toBe(false);
    });

    it('still resets the highlight on a drop it does not cancel', () => {
      const { fixture, zone, outside } = setup(false);
      const directive = fixture.debugElement.query(By.css('.zone')).injector.get(AngularFileDrop);

      zone.dispatchEvent(fileDrag('dragenter'));
      expect(directive.isDragOver()).toBe(true);

      // The document reset predates this input and must survive it.
      outside.dispatchEvent(fileDrag('drop'));

      expect(directive.isDragOver()).toBe(false);
    });

    it('stops preventing when the input is unset', () => {
      const { fixture, host, outside } = setup(true);
      host.prevent.set(false);
      fixture.detectChanges();

      const over = fileDrag('dragover');
      outside.dispatchEvent(over);

      expect(over.defaultPrevented).toBe(false);
    });

    it('stops preventing when the zone is destroyed', () => {
      const { fixture, host, outside } = setup(true);

      host.present.set(false);
      fixture.detectChanges();

      const over = fileDrag('dragover');
      outside.dispatchEvent(over);

      expect(over.defaultPrevented).toBe(false);
    });

    describe('dropMissed', () => {
      it('reports the drop it swallowed', () => {
        const { host, outside } = setup(true);

        const drop = fileDrag('drop');
        outside.dispatchEvent(drop);

        // Prevention is otherwise silent: from the user's side a swallowed
        // file is indistinguishable from a broken upload.
        expect(host.missed).toEqual([drop]);
        // Passed through with its payload intact, so the handler can say
        // *what* was missed.
        expect([...(host.missed[0].dataTransfer!.files as any)].map((f: File) => f.name)).toEqual([
          'a.txt',
        ]);
      });

      it('stays quiet when the input is off', () => {
        const { host, outside } = setup(false);

        // Nothing was prevented, so nothing was missed — the browser is
        // navigating away and there is no page left to tell.
        outside.dispatchEvent(fileDrag('drop'));

        expect(host.missed).toHaveLength(0);
      });

      it('does not fire for a drop the zone itself took', async () => {
        const { host, zone } = setup(true);

        zone.dispatchEvent(fileDrag('drop'));
        await settle();

        // A miss and a hit are mutually exclusive; this is the pairing that
        // would double-report if the two were not.
        expect(host.drops).toHaveLength(1);
        expect(host.missed).toHaveLength(0);
      });

      it('does not fire for a drag another handler claimed', () => {
        const { host, outside } = setup(true);

        const drop = fileDrag('drop');
        claimDragEvent(drop);
        outside.dispatchEvent(drop);

        expect(host.missed).toHaveLength(0);
      });

      it('does not fire for a drag carrying no files', () => {
        const { host, outside } = setup(true);

        outside.dispatchEvent(textDrag('drop'));

        expect(host.missed).toHaveLength(0);
      });
    });
  });
});

/**
 * Drag events that some handler has taken responsibility for.
 *
 * A `WeakSet` rather than a property on the event: it adds nothing to an
 * object the browser owns, and it disappears with the event.
 */
const claimed = new WeakSet<Event>();

/**
 * Marks a drag event as handled, so that dropzones further up the tree leave
 * it alone — during the drag, and at the drop.
 *
 * `preventDefault()` is the conventional signal for a *drop*, and the
 * dropzone honours it there. On `dragenter` and `dragover` it means something
 * else entirely: the HTML drag-and-drop model's "a drop may land here", which
 * every element that accepts drops has to say on every drag, whether or not
 * it will want this particular one. A rich-text editor says it over its text,
 * a canvas over its surface, a sortable list over its rows. Read as a claim,
 * that put out the highlight of every dropzone wrapping an editor — over the
 * very element the drop was headed for. So during the drag it is not read as
 * one. This is the unambiguous version: it means "I am handling this drop",
 * and nothing else — and while the drag is in flight it is the only thing
 * that means it.
 *
 * Call it from any nested handler; it does not have to be a dropzone. Call it
 * on the drag events too if the zone around you should stand down while the
 * pointer is over you, not only at the drop:
 *
 * ```ts
 * // A ProseMirror plugin that embeds dropped images inline, and wants the
 * // page's attachment dropzone to stay out of it — from the moment the drag
 * // comes over the editor.
 * handleDOMEvents: {
 *   dragover(view, event) {
 *     if (isImageDrag(event)) claimDragEvent(event);
 *     return false; // ProseMirror still accepts the drag as usual
 *   },
 * },
 * handleDrop(view, event) {
 *   if (!isImageDrop(event)) return false; // not ours: the zone outside takes it
 *   claimDragEvent(event);
 *   insertImages(view, event.dataTransfer.files);
 *   return true;
 * }
 * ```
 *
 * The `core` entry has no Angular in it: import from
 * `@h-k-dev/angular-file-drop/core` in code that must not depend on
 * `@angular/core`. The main entry re-exports it, and both share one registry.
 */
export function claimDragEvent(event: Event): void {
  claimed.add(event);
}

/**
 * Whether a handler has taken this event: {@link claimDragEvent} was called
 * for it, or — on a `drop` only — something called `preventDefault()`.
 *
 * `preventDefault` on a drop is how a handler consumes it (and how it stops
 * the browser opening the file), so it counts. On the drag events before the
 * drop it is only "a drop may land here", said by everything that accepts
 * drops, and says nothing about who will take this one — so it does not.
 */
export function isDragEventClaimed(event: Event): boolean {
  if (claimed.has(event)) return true;
  return event.type === 'drop' && event.defaultPrevented;
}

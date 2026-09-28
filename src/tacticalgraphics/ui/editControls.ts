/// <reference lib="dom" />
/**
 * The edit buttons around a selected graphic, as plain DOM for any engine.
 *
 * In `edit` mode a click selects a graphic and its grips drag. Moving, rotating and resizing
 * the whole graphic need something to grab that is not a grip: a dashed box around the
 * selection with a move, rotate and resize button on its corners. This draws that box and
 * those buttons over a map container, for any engine that answers `selectionBox()`,
 * `selectionGestures()` and `beginGesture()`, which every engine does.
 *
 * It needs no framework. It creates its own elements inside the container you give it, keeps
 * them over the selection on every animation frame while the engine is in `edit` mode, and
 * shows only the gestures the selected symbol accepts: a security operation gets no resize
 * button and the crossed mission tasks get no rotate button.
 *
 * ```ts
 * import {attachEditControls} from '@zaes/tactical-graphics/edit-controls';
 *
 * const controls = attachEditControls(mapContainer, engine);
 * // later
 * controls.destroy();
 * ```
 *
 * Every button can be swapped: `icons` replaces a button's picture, `labels` its tooltip,
 * `corners` where it hangs, and `gestures` which of the three appear at all. For a design
 * of your own from scratch, skip this and build on the three engine methods directly.
 *
 * The look is set with CSS custom properties on the container or any ancestor:
 * `--tg-edit-button-background`, `--tg-edit-button-color`, `--tg-edit-button-border`,
 * `--tg-edit-button-hover`, `--tg-edit-box-color` and `--tg-edit-z-index`. The elements carry
 * the classes `tg-edit-controls`, `tg-edit-box` and `tg-edit-button` (plus
 * `tg-edit-button--translate`, `--rotate` and `--resize`) for anything more.
 *
 * @module edit-controls
 */

import type {AllowedGestures} from '../core/symbology';
// The subpath's own types, so a consumer of it needs no second import from the root.
export type {AllowedGestures} from '../core/symbology';
export type {EditMode, GestureKind, SelectionBox} from '../core/engine';
import type {EditMode, GestureKind, SelectionBox} from '../core/engine';

/** What the controls need from an engine. Every engine returned by `createTacticalGraphics` has it. */
export interface EditControlsEngine {
    selectionBox(): SelectionBox | undefined;
    selectionGestures(): AllowedGestures | null;
    beginGesture(kind: GestureKind, event: PointerEvent): boolean;
    getInteractionMode?(): EditMode;
}

export interface EditControlsOptions {
    /**
     * Whether the controls should show right now. Default: while the engine is in `edit` mode.
     * Asked on every animation frame, so keep it cheap.
     */
    isActive?: () => boolean;
    /** Button labels, used for the tooltip and for screen readers. Default Move, Rotate and Resize. */
    labels?: Partial<Record<GestureKind, string>>;
    /**
     * A button's picture, in place of the built-in one: SVG or HTML markup as a string, or an
     * element (an icon font's `<i>`, an `<img>`), which is moved into the button.
     */
    icons?: Partial<Record<GestureKind, string | Element>>;
    /** Which corner of the box each button hangs from. Default move top-left, rotate top-right, resize bottom-right. */
    corners?: Partial<Record<GestureKind, EditControlCorner>>;
    /**
     * Which buttons to offer at all. Default all three. A button is still hidden for a symbol
     * that refuses its gesture; this only takes buttons away.
     */
    gestures?: readonly GestureKind[];
    /**
     * Whether to add the default stylesheet to the container's document (or shadow root).
     * Default true. Pass false to style the classes yourself.
     */
    injectStyles?: boolean;
}

export interface EditControls {
    /** Measures and redraws now, rather than on the next animation frame. */
    update(): void;
    /** Removes the elements and stops following the map. Safe to call twice. */
    destroy(): void;
}

/** How far outside the graphic the box sits, so the dashes never run along its own lines. */
const BOX_PADDING_PX = 14;
const BUTTON_PX = 28;
/**
 * The gap between the box and its buttons. The buttons sit wholly outside the box: centered
 * on its corners they reached onto the graphic's own corner, which is where a line's end
 * grip is, and covered it.
 */
const BUTTON_GAP_PX = 4;
const BUTTON_OFFSET_PX = BUTTON_PX + BUTTON_GAP_PX;
/** How close to the container's edge a button may be pushed. */
const EDGE_MARGIN_PX = 8;

/** A corner of the selection box. */
export type EditControlCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type Corner = EditControlCorner;

const SVG_ATTRIBUTES = 'viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Move top-left, rotate top-right, resize bottom-right, where a window's size grip is. */
const BUTTONS: {kind: GestureKind; label: string; corner: Corner; icon: string}[] = [
    {
        kind: 'translate',
        label: 'Move',
        corner: 'top-left',
        icon: `<svg ${SVG_ATTRIBUTES}><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>`,
    },
    {
        kind: 'rotate',
        label: 'Rotate',
        corner: 'top-right',
        icon: `<svg ${SVG_ATTRIBUTES}><path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 3v5h5"/></svg>`,
    },
    {
        kind: 'resize',
        label: 'Resize',
        corner: 'bottom-right',
        icon: `<svg ${SVG_ATTRIBUTES}><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>`,
    },
];

const STYLE_ID = 'tg-edit-controls-style';
const STYLES = `
.tg-edit-controls{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:var(--tg-edit-z-index,900)}
.tg-edit-box{position:absolute;box-sizing:border-box;border:1px dashed var(--tg-edit-box-color,rgba(130,130,130,.9));pointer-events:none}
.tg-edit-button{position:absolute;box-sizing:border-box;width:${BUTTON_PX}px;height:${BUTTON_PX}px;padding:0;margin:0;display:flex;align-items:center;justify-content:center;border-radius:50%;pointer-events:auto;cursor:grab;touch-action:none;background:var(--tg-edit-button-background,#fff);color:var(--tg-edit-button-color,rgba(0,0,0,.87));border:1px solid var(--tg-edit-button-border,rgba(0,0,0,.12));box-shadow:0 1px 3px rgba(0,0,0,.25)}
.tg-edit-button:hover{background:var(--tg-edit-button-hover,#f2f2f2)}
.tg-edit-button:active{cursor:grabbing}
.tg-edit-button:focus-visible{outline:2px solid var(--tg-edit-button-color,#1976d2);outline-offset:2px}
.tg-edit-controls [hidden]{display:none}
`;

function injectStyles(container: HTMLElement): void {
    const root = container.getRootNode() as Document | ShadowRoot;
    const inShadow = typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot;
    const host = inShadow ? root : container.ownerDocument.head;
    if (!host || root.querySelector?.(`#${STYLE_ID}`)) return;
    const style = container.ownerDocument.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLES;
    host.appendChild(style);
}

/**
 * Where a button sits inside the container, pushed inside it when the selection runs past an
 * edge. A graphic larger than the view had its resize button below the bottom of the page,
 * where it could not be pressed; pinned inside, it stays on the side it belongs to.
 * @internal
 */
export function placeButton(box: SelectionBox, corner: Corner, frame: {width: number; height: number}): {left: number; top: number} {
    const left = box.x - BOX_PADDING_PX;
    const top = box.y - BOX_PADDING_PX;
    const right = left + box.width + BOX_PADDING_PX * 2;
    const bottom = top + box.height + BOX_PADDING_PX * 2;
    const rawX = corner.endsWith('left') ? left - BUTTON_OFFSET_PX : right + BUTTON_GAP_PX;
    const rawY = corner.startsWith('top') ? top - BUTTON_OFFSET_PX : bottom + BUTTON_GAP_PX;
    const maxX = Math.max(EDGE_MARGIN_PX, frame.width - BUTTON_PX - EDGE_MARGIN_PX);
    const maxY = Math.max(EDGE_MARGIN_PX, frame.height - BUTTON_PX - EDGE_MARGIN_PX);
    return {left: Math.min(Math.max(rawX, EDGE_MARGIN_PX), maxX), top: Math.min(Math.max(rawY, EDGE_MARGIN_PX), maxY)};
}

/**
 * Draws the edit box and its buttons over `container`, following `engine`'s selection.
 *
 * `container` should be the element the map fills, or one laid exactly over it: the engine's
 * selection box is measured from the map container's top-left. The controls are positioned
 * absolutely inside it, so give it `position: relative` (or any positioning) if it has none;
 * this function sets `relative` when it finds `static`.
 */
export function attachEditControls(container: HTMLElement, engine: EditControlsEngine, options: EditControlsOptions = {}): EditControls {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (options.injectStyles !== false) injectStyles(container);
    if (view && view.getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const isActive = options.isActive ?? (() => (engine.getInteractionMode ? engine.getInteractionMode() === 'edit' : true));

    // The layer is inert: a rectangle that took clicks would make every graphic unselectable
    // and eat the grip drags. Only the buttons take the pointer.
    const layer = doc.createElement('div');
    layer.className = 'tg-edit-controls';
    const boxElement = doc.createElement('div');
    boxElement.className = 'tg-edit-box';
    boxElement.hidden = true;
    layer.appendChild(boxElement);

    const offered = BUTTONS.filter(spec => !options.gestures || options.gestures.includes(spec.kind)).map(spec => ({
        ...spec,
        corner: options.corners?.[spec.kind] ?? spec.corner,
    }));
    const buttons = offered.map(spec => {
        const button = doc.createElement('button');
        const label = options.labels?.[spec.kind] ?? spec.label;
        const icon = options.icons?.[spec.kind];
        button.type = 'button';
        button.className = `tg-edit-button tg-edit-button--${spec.kind}`;
        button.title = label;
        button.setAttribute('aria-label', label);
        if (icon && typeof icon !== 'string') button.appendChild(icon);
        else button.innerHTML = icon ?? spec.icon;
        button.hidden = true;
        // The map must not see this press as well: OpenLayers would start a second drag and
        // MapLibre would pan the map out from under the gesture.
        button.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            engine.beginGesture(spec.kind, event);
        });
        layer.appendChild(button);
        return {spec, button};
    });
    container.appendChild(layer);

    // Written only when it changes: the loop runs every frame and most frames change nothing.
    let drawn = '';
    function update(): void {
        const box = isActive() ? engine.selectionBox() : undefined;
        const gestures = box ? engine.selectionGestures() : null;
        const width = layer.clientWidth;
        const height = layer.clientHeight;
        const key = box && gestures ? `${box.x},${box.y},${box.width},${box.height},${width},${height},${+gestures.translate}${+gestures.rotate}${+gestures.resize}` : '';
        if (key === drawn) return;
        drawn = key;
        if (!box || !gestures) {
            boxElement.hidden = true;
            for (const {button} of buttons) button.hidden = true;
            return;
        }
        boxElement.hidden = false;
        boxElement.style.left = `${box.x - BOX_PADDING_PX}px`;
        boxElement.style.top = `${box.y - BOX_PADDING_PX}px`;
        boxElement.style.width = `${box.width + BOX_PADDING_PX * 2}px`;
        boxElement.style.height = `${box.height + BOX_PADDING_PX * 2}px`;
        for (const {spec, button} of buttons) {
            button.hidden = !gestures[spec.kind];
            if (button.hidden) continue;
            const {left, top} = placeButton(box, spec.corner, {width, height});
            button.style.left = `${left}px`;
            button.style.top = `${top}px`;
        }
    }

    // A frame loop rather than map events: the box moves with every pan, zoom and resize, and
    // with every frame of a gesture, and each engine names those events differently.
    let frame: number | undefined;
    const tick = () => {
        update();
        frame = view?.requestAnimationFrame(tick);
    };
    frame = view?.requestAnimationFrame(tick);

    let destroyed = false;
    return {
        update: () => {
            if (!destroyed) update();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame !== undefined) view?.cancelAnimationFrame(frame);
            layer.remove();
        },
    };
}

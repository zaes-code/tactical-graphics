/**
 * # The edit controls a customer gets
 *
 * Plain DOM over the map: a dashed box around the selection and one button per gesture the
 * symbol accepts, each handing its press to the engine.
 */
import type {AllowedGestures} from '../core/symbology';
import type {EditMode, GestureKind, SelectionBox} from '../core/engine';
import {attachEditControls, placeButton} from './editControls';

function fakeEngine(gestures: Partial<AllowedGestures> = {}) {
    const state = {
        mode: 'edit' as EditMode,
        box: {x: 100, y: 80, width: 200, height: 120} as SelectionBox | undefined,
        gestures: {translate: true, rotate: true, resize: true, modify: true, ...gestures} as AllowedGestures,
        begun: [] as GestureKind[],
    };
    const engine = {
        selectionBox: () => state.box,
        selectionGestures: () => (state.box ? state.gestures : null),
        beginGesture: (kind: GestureKind) => {
            state.begun.push(kind);
            return true;
        },
        getInteractionMode: () => state.mode,
    };
    return {engine, state};
}

const visibleButtons = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>('.tg-edit-button')].filter(b => !b.hidden).map(b => b.getAttribute('aria-label'));

describe('the edit controls', () => {
    let container: HTMLElement;
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });
    afterEach(() => container.remove());

    it('draws the box and one button per gesture the selection accepts', () => {
        const {engine} = fakeEngine({rotate: false});
        const controls = attachEditControls(container, engine);
        controls.update();
        const box = container.querySelector<HTMLElement>('.tg-edit-box')!;
        expect(box.hidden).toBe(false);
        expect(box.style.left).toBe('86px');
        expect(box.style.width).toBe('228px');
        expect(visibleButtons(container)).toEqual(['Move', 'Resize']);
        controls.destroy();
    });

    it('shows nothing outside edit mode, or with nothing selected', () => {
        const {engine, state} = fakeEngine();
        const controls = attachEditControls(container, engine);
        state.mode = 'view';
        controls.update();
        expect(visibleButtons(container)).toEqual([]);
        expect(container.querySelector<HTMLElement>('.tg-edit-box')!.hidden).toBe(true);
        state.mode = 'edit';
        state.box = undefined;
        controls.update();
        expect(visibleButtons(container)).toEqual([]);
        controls.destroy();
    });

    it('hands a press to the engine, and keeps it from the map', () => {
        const {engine, state} = fakeEngine();
        const controls = attachEditControls(container, engine);
        controls.update();
        let mapSawIt = false;
        container.addEventListener('pointerdown', () => (mapSawIt = true));
        const rotate = container.querySelector<HTMLButtonElement>('.tg-edit-button--rotate')!;
        rotate.dispatchEvent(new Event('pointerdown', {bubbles: true, cancelable: true}));
        expect(state.begun).toEqual(['rotate']);
        expect(mapSawIt).toBe(false);
        controls.destroy();
    });

    it('takes the customer’s icons, labels, corners and choice of buttons', () => {
        const {engine} = fakeEngine();
        const icon = document.createElement('i');
        icon.className = 'my-icon';
        const controls = attachEditControls(container, engine, {
            gestures: ['translate', 'rotate'],
            icons: {translate: icon, rotate: '<span class="spin"></span>'},
            labels: {rotate: 'Turn'},
            corners: {rotate: 'bottom-left'},
        });
        controls.update();
        expect(visibleButtons(container)).toEqual(['Move', 'Turn']);
        expect(container.querySelector('.tg-edit-button--resize')).toBeNull();
        expect(container.querySelector('.tg-edit-button--translate .my-icon')).not.toBeNull();
        expect(container.querySelector('.tg-edit-button--rotate .spin')).not.toBeNull();
        controls.destroy();
    });

    it('follows isActive when the host decides', () => {
        const {engine} = fakeEngine();
        let on = false;
        const controls = attachEditControls(container, engine, {isActive: () => on});
        controls.update();
        expect(visibleButtons(container)).toEqual([]);
        on = true;
        controls.update();
        expect(visibleButtons(container)).toEqual(['Move', 'Rotate', 'Resize']);
        controls.destroy();
    });

    it('adds its stylesheet once, and leaves it out on request', () => {
        const {engine} = fakeEngine();
        const a = attachEditControls(container, engine);
        const b = attachEditControls(container, engine);
        expect(document.querySelectorAll('#tg-edit-controls-style')).toHaveLength(1);
        a.destroy();
        b.destroy();
        document.getElementById('tg-edit-controls-style')!.remove();
        attachEditControls(container, engine, {injectStyles: false}).destroy();
        expect(document.getElementById('tg-edit-controls-style')).toBeNull();
    });

    it('removes itself on destroy, and a second destroy does nothing', () => {
        const {engine} = fakeEngine();
        const controls = attachEditControls(container, engine);
        controls.destroy();
        expect(container.querySelector('.tg-edit-controls')).toBeNull();
        expect(() => controls.destroy()).not.toThrow();
        expect(() => controls.update()).not.toThrow();
    });
});

describe('where a button sits', () => {
    const box = {x: 100, y: 80, width: 200, height: 120};
    const frame = {width: 1000, height: 800};

    it('hangs wholly outside the box, clear of the graphic’s corner grips', () => {
        expect(placeButton(box, 'top-left', frame)).toEqual({left: 100 - 14 - 32, top: 80 - 14 - 32});
        expect(placeButton(box, 'bottom-right', frame)).toEqual({left: 100 + 200 + 14 + 4, top: 80 + 120 + 14 + 4});
    });

    it('is pushed back inside the map when the selection runs past its edge', () => {
        const big = {x: -50, y: 700, width: 1200, height: 400};
        expect(placeButton(big, 'top-left', frame)).toEqual({left: 8, top: 700 - 14 - 32});
        expect(placeButton(big, 'bottom-right', frame)).toEqual({left: 1000 - 28 - 8, top: 800 - 28 - 8});
    });
});

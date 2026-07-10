// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom has no canvas implementation, so `getContext('2d')` returns null. The
// style functions measure glyph widths through a module-level 2D context
// (`getTextWidth` in openlayerStyles.ts), which would throw on import.
//
// Rather than pull in the native `canvas` package, stub the sliver of the API
// the styles actually touch. `measureText` approximates advance width from the
// font's px size, which is enough for label-gap math to produce sane numbers —
// tests must not assert on exact pixel widths.
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, contextId: string) {
        if (contextId !== '2d') return null;
        let font = '10px sans-serif';
        return {
            canvas: this,
            get font() {
                return font;
            },
            set font(value: string) {
                font = value;
            },
            measureText: (text: string) => {
                const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
                return {width: text.length * px * 0.6};
            },
            // OpenLayers probes these during style/render setup.
            save: () => undefined,
            restore: () => undefined,
            beginPath: () => undefined,
            closePath: () => undefined,
            moveTo: () => undefined,
            lineTo: () => undefined,
            stroke: () => undefined,
            fill: () => undefined,
            translate: () => undefined,
            scale: () => undefined,
            rotate: () => undefined,
            setTransform: () => undefined,
            clearRect: () => undefined,
            fillRect: () => undefined,
            drawImage: () => undefined,
            createLinearGradient: () => ({addColorStop: () => undefined}),
            createPattern: () => null,
            getImageData: () => ({data: new Uint8ClampedArray(4)}),
        } as unknown as CanvasRenderingContext2D;
    } as typeof HTMLCanvasElement.prototype.getContext;
}

/**
 * MapLibre stretches a dash with the fractional zoom; `dashZoomStep` picks the correction.
 *
 * Measured before the fix, on the running app: a 12 px dash drew 12 at zoom 6, 18 at 6.5
 * and 21 at 6.75, then snapped back at 7. After it, 12 to 13 at every tenth of a level (the
 * extra pixel is the round cap). A pixel measurement cannot live in jsdom, so this pins the
 * arithmetic and `tmp/probe-mlb-dashzoom.mjs` is the one that looks. @see dashZoomStep
 */
import {DASH_ZOOM_STEPS, dashZoomStep} from './paintToLayers';

/**
 * The renderer applies the correction in steps, one fixed layer per step, because rewriting a
 * live layer's `line-dasharray` crashed MapLibre's line render and took every label with it.
 */
describe('dashZoomStep', () => {
    it('rounds the fraction up to a step, so a dash is never stretched past its length', () => {
        for (let zoom = 6; zoom < 7; zoom += 0.01) {
            const step = dashZoomStep(zoom);
            const drawnFactor = Math.pow(2, zoom - 6) / Math.pow(2, step);
            expect(drawnFactor).toBeLessThanOrEqual(1 + 1e-9);
            expect(drawnFactor).toBeGreaterThan(Math.pow(2, -1 / DASH_ZOOM_STEPS) - 1e-9);
        }
    });

    it('answers a bounded set of steps, so the layer count stays a small constant', () => {
        const steps = new Set<number>();
        for (let zoom = 0; zoom < 22; zoom += 0.013) steps.add(dashZoomStep(zoom));
        expect(steps.size).toBeLessThanOrEqual(DASH_ZOOM_STEPS + 1);
    });
});

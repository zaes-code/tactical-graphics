/**
 * # A label's size must not depend on who built the feature
 *
 * `scaleOf` asks the host how big a label should be (`configuredLabelScale`) and the symbol
 * how big it may be (`capLabelToGraphic`). It used to ask a third thing whenever the
 * graphic's extent was missing: the zoom the operator happened to be at when they drew it.
 *
 * That fallback made the answer depend on the *renderer's bookkeeping* rather than on the
 * graphic. A holder-backed feature has bounds — the OpenLayers layer recovers them through
 * its registry — while a host that builds its own features has none, so the same corridor
 * at the same zoom drew its designation at **1.00** in this library's own app and **0.55**
 * in a consuming one, with no setting to explain the difference.
 *
 * The zoom anchor is the thing `scaleOf` was changed to stop using, on the grounds that it
 * is not saved with the graphic and so cannot be reproduced. Leaving it as the fallback
 * kept it in use for exactly the consumers who had no way to see why.
 */

import {scaleOf} from './paintFunctions';
import {configuredLabelScale} from '../core/symbology';
import type {PaintContext, PaintFeature} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig, setDefaultLabelSize} from '../core/config';

const context: PaintContext = {
    resolution: 9784,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/** A corridor about 600 px across at the resolution above — room for its designation. */
const SPAN = 600 * context.resolution;

const properties = {
    name: TacticalGraphicName.AirCorridor,
    designation: 'CORRIDOR ONE',
    width: 391_358,
} as never;

/** What a host that builds its own features hands the paint: no bounds, no drawing zoom. */
const hostBuilt = {
    geometry: {type: 'MultiPoint', coordinates: [[0, 0], [SPAN / 2, 1e5], [SPAN, 0]]},
    properties,
    graphicSize: 195_679,
} as unknown as PaintFeature;

/** What a holder hands it: the same feature, plus the graphic's extent. */
const holderBacked = {
    ...hostBuilt,
    bounds: {minX: -1e5, minY: -2e5, maxX: SPAN + 1e5, maxY: 3e5},
} as unknown as PaintFeature;

/** The same again, carrying the zoom it was drawn at — which must no longer matter. */
const withDrawingZoom = {...hostBuilt, drawingResolution: 300} as unknown as PaintFeature;

beforeEach(() => resetTacticalGraphicsConfig());

describe('scaleOf', () => {
    it('gives a host-built feature the same size as a holder-backed one', () => {
        expect(scaleOf(hostBuilt, context)).toBeCloseTo(scaleOf(holderBacked, context), 5);
    });

    it('gives both of them the size the host configured', () => {
        // Nothing caps here: the corridor is far wider than its own designation.
        expect(scaleOf(holderBacked, context)).toBeCloseTo(configuredLabelScale(), 5);
        expect(scaleOf(hostBuilt, context)).toBeCloseTo(configuredLabelScale(), 5);
    });

    it('ignores the zoom the graphic happened to be drawn at', () => {
        expect(scaleOf(withDrawingZoom, context)).toBeCloseTo(scaleOf(hostBuilt, context), 5);
    });

    it('follows the configured label size, which is the setting that should decide it', () => {
        setDefaultLabelSize(24);
        const bigger = scaleOf(hostBuilt, context);
        resetTacticalGraphicsConfig();
        expect(bigger).toBeGreaterThan(scaleOf(hostBuilt, context));
    });

    it('still lets the graphic cap a label too big for it', () => {
        // A corridor a twentieth as wide has no room, and the cap — not the zoom — is what
        // brings the label down.
        const narrow = {
            ...holderBacked,
            bounds: {minX: 0, minY: 0, maxX: SPAN / 40, maxY: 1e4},
        } as unknown as PaintFeature;
        expect(scaleOf(narrow, context)).toBeLessThan(scaleOf(holderBacked, context));
    });
});

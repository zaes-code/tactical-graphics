/**
 * # APP-06's protection lines
 *
 * Five line symbols from Tables 8-17 and 8-18: the mineline, the mine cluster, the trip
 * wire, the raft site and the fortified position. None has an FM 1-02.2 counterpart.
 *
 * Four of the five put **nothing** in the geometry beyond the line the user drew, because
 * their draw rules say so. Each reads some variation of *"points 1 and 2 determine the
 * length of the symbol, which varies only in length"* — the arrowheads on a raft site and
 * the legs on a fortified position are a fixed size, and a fixed size belongs in screen
 * space where the paint layer can hold it, not baked into meters at whatever zoom the user
 * happened to be at. @see protectionLinePaints.ts
 *
 * The mine cluster is the exception and states its proportion outright: *"the radius of
 * the semicircle is ½ the length of the straight line."* That is geometry — it scales with
 * the graphic and survives a zoom — so it is built here.
 */

import {Feature, LineString, MultiLineString, MultiPoint} from 'geojson';
import * as turf from '../core/turf';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {IBaseGraphicOptions, TacticalGraphicName} from '../core/type';
import geometryService from '../core/GeometryService';

/** How many points the mine cluster's dome is drawn with. */
const DOME_STEPS = 48;

/**
 * The shared half of all five: the drawn line, with a handle and a label anchor at each
 * end. Only `generateGraphics` differs, and only for the mine cluster.
 */
abstract class ProtectionLineBase extends TacticalGraphicsBase {
    type: string = 'LineString';

    generateGraphics(base: Feature<LineString>, opts?: IBaseGraphicOptions): Feature {
        return this.asLineStringFeature(base.geometry.coordinates);
    }

    generateHandles(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }

    generateLabels(base: Feature<LineString>): Feature<MultiPoint> {
        const c = base.geometry.coordinates;
        return this.asMultiPointFeature([c[0], c[c.length - 1]]);
    }
}

/**
 * APP-06 290101 — a run of mines along a line, drawn as the line itself with `N` at each
 * end and a free-text modifier at its middle.
 *
 * **The Example column shows a string of filled discs and we do not draw them.** The
 * template is the normative half of the row, and it draws a plain line with three text
 * fields; the discs are one vendor's depiction of what a mineline *is*, in the column
 * whose own heading warns that its contents are there to explain the control measure
 * rather than define it. The symbol's distinguishing mark is the `N`, which is why the
 * template bothers to place one at both ends of a line rather than one in the middle.
 */
export class Mineline extends ProtectionLineBase {
    name: string = TacticalGraphicName.Mineline;
}

/**
 * APP-06 290400 — a dome over its own chord, both broken.
 *
 * Points 1 and 2 are the *corners*: the chord runs between them and the semicircle stands
 * on it with a radius of half its length, which makes the dome a true half-circle rather
 * than a bow of arbitrary depth.
 *
 * The dome goes to the **right of `PT1 → PT2`**, matching the template — where point 1 is
 * the right-hand corner and the arc rises above the chord — and matching the fortified
 * position below, so the two symbols agree about which side "the far side" is.
 */
export class MineCluster extends ProtectionLineBase {
    name: string = TacticalGraphicName.MineCluster;

    generateGraphics(base: Feature<LineString>): Feature<MultiLineString> {
        const coords = base.geometry.coordinates;
        const start = coords[0];
        const end = coords[coords.length - 1];
        const span = turf.distance(start, end, {units: 'meters'});

        // `createSemicircle` takes the amplitude, and a semicircle's is its radius —
        // half the chord, which is exactly what the draw rule specifies.
        const dome = geometryService.createSemicircle(
            start,
            end,
            turf.bearing(start, end),
            span / 2,
            DOME_STEPS,
            // `createSemicircle` bulges to the left of start → end by default.
            true,
        );

        return this.asMultiLineStringFeature([[start, end], dome]);
    }
}

/** APP-06 290500 — the wire, plus the mine's stake glyph at point 1. @see tripWirePaint */
export class TripWire extends ProtectionLineBase {
    name: string = TacticalGraphicName.TripWire;
}

/** APP-06 290800 — a shaft with a crossed arrowhead at each end. @see raftSitePaint */
export class RaftSite extends ProtectionLineBase {
    name: string = TacticalGraphicName.RaftSite;
}

/**
 * APP-06 291000 — an open three-sided bracket whose front edge is the drawn line.
 *
 * **The arrowheads in the template are the standard's own `PT 1` / `PT 2` callouts, not
 * part of the symbol.** The Example column settles it: it draws the bracket bare. Cropping
 * the template cell alone would have shipped a fortified position with four arrowheads on
 * it, which is the reason for reading whole rows.
 */
export class FortifiedPosition extends ProtectionLineBase {
    name: string = TacticalGraphicName.FortifiedPosition;
}

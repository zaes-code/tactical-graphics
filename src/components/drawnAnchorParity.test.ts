/**
 * # For these six the points are the description, and both engines have to say so
 *
 * `DRAWN_ANCHOR_GRAPHICS` are defined by a point layout — Contain's two, a turn's three,
 * Envelop's four — and everything else about them follows from it. Two ways that broke:
 *
 * **The anchor set was taken as given.** A base can describe the symbol without being the
 * layout APP-06 names: the sample sweep hands Contain three points and Envelopment three.
 * OpenLayers silently rewrote them, because its holder republishes the base from state on
 * every gesture; MapLibre kept what it was given. The two then held different anchor counts
 * for one picture — `vertices 2/3` and `4/3` in `compare:engines` — and offered a different
 * number of handles to drag.
 *
 * **And the figures beside the points were trusted over them.** That same sweep stamps
 * `radius: 180000` next to anchors measuring 125,392, so a restored turn reported the
 * stamped figure here and the adopted one there.
 *
 * A third, opposite fault sat in the OpenLayers holder: its arrowhead is 26 screen pixels
 * converted at the first centre, and the conversion was skipped for every restore — but
 * this family restores through `adoptAnchors`, which sets the centre from the points and
 * calls `updateGeom` with a size alone. So the six graphics whose head most needed the
 * correction never got it, and drew a head 1/cos(latitude) too large.
 */

import {TacticalGraphicName, drawnAnchors, listTacticalGraphicNames, usesDrawnAnchors} from '@zaes/tactical-graphics';
import {Feature} from 'ol';
import {LineString} from 'ol/geom';
import {fromLonLat} from 'ol/proj';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';
import {getController} from './openlayers/controllerRegistry';

const RES = 6_000;
const CENTRE: [number, number] = [12, 42];
const SIZE = 125_392;

const family = listTacticalGraphicNames()
    .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
    .filter(usesDrawnAnchors);

/** The layout each graphic is defined by, as a base. */
const canonical = (name: TacticalGraphicName) =>
    ({type: 'LineString' as const, coordinates: drawnAnchors(name, {center: CENTRE, size: SIZE, rotation: 20})!});

describe('the anchor set MapLibre builds from', () => {
    it.each(family)('is the layout %s is defined by, however many points arrive', name => {
        const expected = canonical(name).coordinates.length;

        // Three points for everything — right for some of the family, wrong for the rest,
        // and exactly what the sweep hands over.
        const asGiven = {type: 'LineString' as const, coordinates: drawnAnchors(name, {center: CENTRE, size: SIZE, rotation: 20})!.slice(0, 3)};
        const built = buildTacticalGraphic(name, asGiven, {}, RES);

        expect(built).toBeDefined();
        expect((built!.base.geometry as {coordinates: unknown[]}).coordinates).toHaveLength(expected);
    });

    /** Already canonical in, unchanged out — every base this engine draws itself. */
    it.each(family)('leaves a canonical base alone — %s', name => {
        const base = canonical(name);
        const built = buildTacticalGraphic(name, base, {}, RES);
        expect((built!.base.geometry as {coordinates: unknown[]}).coordinates).toHaveLength(base.coordinates.length);
    });

    /** The points outrank a figure that arrived beside them. */
    it('reads the radius off the anchors, not off the description', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.Turn, canonical(TacticalGraphicName.Turn), {radius: 180_000}, RES);
        expect(built!.properties.radius! / SIZE).toBeCloseTo(1, 1);
    });
});

describe('the OpenLayers arrowhead', () => {
    /**
     * 26 px at this resolution is 156 km projected; at 42 degrees north that is 116 km on
     * the ground. Before the fix a restored turn kept the projected figure.
     */
    it.each([TacticalGraphicName.Turn, TacticalGraphicName.Envelopment])(
        'is converted where the graphic lands, on the anchor restore path — %s',
        name => {
            const handler = getController(name, RES) as unknown as {
                graphic: {headSize: number; setBaseFeature(base: Feature<LineString>): void};
            };
            const projected = handler.graphic.headSize;
            expect(projected).toBeGreaterThan(0);

            handler.graphic.setBaseFeature(new Feature(new LineString(
                canonical(name).coordinates.map(c => fromLonLat(c as [number, number])),
            )));

            const cosLatitude = Math.cos((CENTRE[1] * Math.PI) / 180);
            expect(handler.graphic.headSize / projected).toBeCloseTo(cosLatitude, 2);
        },
    );
});

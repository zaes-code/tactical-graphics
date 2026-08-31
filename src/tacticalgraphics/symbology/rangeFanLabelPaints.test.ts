/**
 * # A range fan's labels have to stay on the fan
 *
 * Two escapes, both reported from the app and both invisible to every test that only
 * checks what a label *says*.
 *
 * The band block was capped against its neighbour, which meant a fan with one band was
 * capped against nothing — so it kept its full configured size while the circle it names
 * shrank underneath it, and the text walked out of the ring on the way out. Two bands hid
 * it, because the second band is what holds the first one in.
 *
 * The bearings on a sector were never capped at all. They outgrew their own arc while the
 * fixed 16px nudge stayed put, which looks like the number drifting off the edge it marks.
 *
 * Both are about scale against room, so both are measured here rather than eyeballed.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {rangeFanLabelPaint} from './boundaryPaints';

const CHAR_WIDTH_SHARE = 0.6;

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * CHAR_WIDTH_SHARE;
    },
});

/**
 * `[centre, ...one anchor per band at mid-radius]`, which is what `generateLabels` emits.
 * Ranges are km; the projected units here are metres, matching EPSG:3857 closely enough
 * for a scale comparison.
 */
function circularFan(rangesKm: number[]): PaintFeature {
    const coords: ProjectedPosition[] = [[0, 0]];
    let prev = 0;
    for (const range of rangesKm) {
        coords.push([((prev + range) / 2) * 1000, 0]);
        prev = range;
    }
    return {
        geometry: {type: 'MultiPoint', coordinates: coords},
        properties: {name: TacticalGraphicName.WeaponSensorRangeFanCircular},
        rangeFanShape: 'circular',
        rangeFanBands: rangesKm.map(range => ({range})),
    };
}

/** The sector packs three points per band: mid-radius, then the two arc edges. */
function sectorFan(rangeKm: number): PaintFeature {
    const r = rangeKm * 1000;
    return {
        geometry: {
            type: 'MultiPoint',
            coordinates: [
                [0, 0],
                [r / 2, 0],
                [r * Math.cos(-0.4), r * Math.sin(-0.4)],
                [r * Math.cos(0.4), r * Math.sin(0.4)],
            ],
        },
        properties: {name: TacticalGraphicName.WeaponSensorRangeFanSector},
        rangeFanShape: 'sector',
        rangeFanBands: [{range: rangeKm, resolvedLeftAz: 45, resolvedRightAz: 135}],
    };
}

/** Every text mark the paint emitted, as `{text, scale}`. */
function marks(feature: PaintFeature, name: TacticalGraphicName, resolution: number) {
    return rangeFanLabelPaint(name)(feature, context(resolution))
        .filter(p => p.text)
        .map(p => ({text: p.text!.text, scale: p.text!.scale ?? 1}));
}

const widestRowPx = (block: string) => Math.max(...block.split('\n').map(row => row.length * 16 * CHAR_WIDTH_SHARE));

beforeEach(() => resetTacticalGraphicsConfig());

describe('a one-band circular fan', () => {
    it('shrinks its block as the ring shrinks on screen', () => {
        // The bug exactly: same fan, further out, and the label used to hold its size.
        const near = marks(circularFan([200]), TacticalGraphicName.WeaponSensorRangeFanCircular, 200)[0];
        const far = marks(circularFan([200]), TacticalGraphicName.WeaponSensorRangeFanCircular, 4000)[0];

        expect(near.text).toBe('MIN RG 200');
        expect(far.scale).toBeLessThan(near.scale);
    });

    it('keeps the block inside the ring it names', () => {
        // The ring is what the label has to fit in, so that is what it is measured against.
        for (const resolution of [200, 800, 2000, 6000]) {
            const [mark] = marks(circularFan([200]), TacticalGraphicName.WeaponSensorRangeFanCircular, resolution);
            const radiusPx = (200 * 1000) / resolution;
            expect(widestRowPx(mark.text) * mark.scale).toBeLessThanOrEqual(radiusPx);
        }
    });

    it('is not punished for being alone when there is room', () => {
        // Capping against the centre was the first attempt and halved the room, because the
        // anchor sits at mid-radius. Zoomed in, a lone band should draw at full size.
        const [mark] = marks(circularFan([200]), TacticalGraphicName.WeaponSensorRangeFanCircular, 20);
        expect(mark.scale).toBeCloseTo(1, 5);
    });
});

describe('a multi-band circular fan', () => {
    it('still measures each block against its neighbour', () => {
        const bands = marks(circularFan([100, 200, 300]), TacticalGraphicName.WeaponSensorRangeFanCircular, 4000);
        expect(bands.map(b => b.text)).toEqual(['MIN RG 100', 'MIN RG 200', 'MIN RG 300']);
        // Three blocks 50 km apart at 4000 m/px is 12.5px of room — far too little for ten
        // characters, so every one of them is held well under full size.
        for (const band of bands) expect(band.scale).toBeLessThan(0.5);
    });
});

describe('a sector fan', () => {
    it('caps its bearings instead of letting them outgrow the arc', () => {
        const near = marks(sectorFan(180), TacticalGraphicName.WeaponSensorRangeFanSector, 4000);
        const far = marks(sectorFan(180), TacticalGraphicName.WeaponSensorRangeFanSector, 40000);

        const bearing = (m: {text: string}[]) => m.filter(x => /^\d{3}$/.test(x.text));
        expect(bearing(near).map(b => b.text)).toEqual(['045', '135']);
        for (const b of bearing(far)) {
            expect(b.scale).toBeLessThan(bearing(near)[0].scale);
        }
    });

    it('scales the outward nudge with the bearing it is clearing', () => {
        // At a resolution where the cap actually bites, so a fixed 16px nudge under a
        // shrunken label fails this rather than passing by coincidence at scale 1.
        const paints = rangeFanLabelPaint(TacticalGraphicName.WeaponSensorRangeFanSector)(sectorFan(180), context(40_000));
        const bearings = paints.filter(p => /^\d{3}$/.test(p.text?.text ?? ''));
        expect(bearings.length).toBe(2);
        for (const b of bearings) {
            const scale = b.text!.scale ?? 1;
            expect(scale).toBeLessThan(1); // the cap is engaged, so the assertion below means something
            const offset = Math.hypot(b.text!.offsetXPx ?? 0, b.text!.offsetYPx ?? 0);
            expect(offset).toBeCloseTo(16 * scale, 5);
        }
    });
});

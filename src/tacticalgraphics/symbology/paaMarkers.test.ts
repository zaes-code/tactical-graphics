/**
 * # PAA rides the outline of a turned rectangle
 *
 * The markers sat at the bounding box's edge midpoints, which stand off the corners of a
 * rectangle turned 45 degrees (found turning every line-based graphic, 2026-11-01).
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {positionAreaArtilleryLabelPaint} from './areaLabelPaints';

beforeEach(() => resetTacticalGraphicsConfig());

const context: PaintContext = {resolution: 100, measureText: text => text.length * 9};

it('sets each PAA at the middle of a turned rectangle side', () => {
    const ring: ProjectedPosition[] = [[0, 40000], [40000, 0], [0, -40000], [-40000, 0], [0, 40000]];
    const feature = {
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name: TacticalGraphicName.PositionAreaArtilleryRectangular, designation: 'ALPHA'},
        bounds: {minX: -40000, minY: -40000, maxX: 40000, maxY: 40000},
        ring,
    } as unknown as PaintFeature;
    const spots = positionAreaArtilleryLabelPaint(TacticalGraphicName.PositionAreaArtilleryRectangular)(feature, context)
        .filter(p => p.text?.text === 'PAA')
        .map(p => (p.geometry.coordinates as number[]).map(Math.round));
    expect(spots).toEqual(expect.arrayContaining([[20000, 20000], [20000, -20000], [-20000, -20000], [-20000, 20000]]));
});

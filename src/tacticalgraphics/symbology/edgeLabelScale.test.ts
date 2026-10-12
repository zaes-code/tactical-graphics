/**
 * A label that rides the outline is not fitted inside it.
 *
 * Every centred area label is shrunk until its box fits the ring. The four PAA markers and the
 * group-of-targets designation sit on the edge, so half their box is outside by construction,
 * and that search ended at scale 0: none of them was ever drawn, on any engine or in any picture.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {groupOrSeriesOfTargetsLabelPaint, positionAreaArtilleryLabelPaint} from './areaLabelPaints';

const context: PaintContext = {resolution: 10, measureText: text => text.length * 16 * 0.6};

const ring: ProjectedPosition[] = [[-2000, -1000], [2000, -1000], [2000, 1000], [-2000, 1000], [-2000, -1000]];

const feature = (name: TacticalGraphicName, at: ProjectedPosition, extra: Partial<PaintFeature> = {}): PaintFeature => ({
    geometry: {type: 'Point', coordinates: at},
    properties: {name, designation: 'ALPHA'},
    ring,
    bounds: {minX: -2000, minY: -1000, maxX: 2000, maxY: 1000},
    graphicSize: 2000,
    ...extra,
});

const scales = (paints: {text?: {text: string; scale?: number}}[], text?: string) =>
    paints.filter(p => p.text && (!text || p.text.text === text)).map(p => p.text!.scale ?? 1);

beforeEach(() => resetTacticalGraphicsConfig());

it('draws the four PAA markers at a size you can read', () => {
    const name = TacticalGraphicName.PositionAreaArtilleryRectangular;
    const paints = positionAreaArtilleryLabelPaint(name)(feature(name, [0, 0]), context);
    const markers = scales(paints, 'PAA');
    expect(markers).toHaveLength(4);
    markers.forEach(scale => expect(scale).toBeGreaterThan(0.2));
});

it('draws the group-of-targets designation on its top edge at a size you can read', () => {
    const name = TacticalGraphicName.GroupOrSeriesOfTargets;
    const paints = groupOrSeriesOfTargetsLabelPaint(name)(
        feature(name, [0, 1000], {labelSegment: [[-2000, 1000], [2000, 1000]]}),
        context,
    );
    const [scale] = scales(paints);
    expect(scale).toBeGreaterThan(0.2);
});

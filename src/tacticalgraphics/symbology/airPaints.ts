/**
 * # The air-coordinating areas' label blocks
 *
 * Fourteen graphics whose amplifiers are a **block of labelled lines** rather than a
 * designation: the eleven air-coordinating zones, and the three airspace coordination
 * areas. They were the last families whose layout lived only in `openlayerStyles.ts`,
 * and the registry said so — they fell through to the default area label, which draws
 * a centred designation and nothing else.
 *
 * With only a `label` set the difference is invisible, which is why it survived every
 * sweep until one carried altitudes and date-time groups. Then MapLibre drew two
 * centred labels on top of each other and no altitudes at all, against OpenLayers'
 * six-line block.
 *
 * The two families look alike and are not the same: the zones take the doctrinal
 * prefix over the user's designation and a time-from/time-to block, the coordination
 * areas take prefix-and-designation joined on one line over the *second* designation,
 * a grid, one combined effective-time line — and a cap that keeps the block inside
 * the polygon.
 */

import type {Paint, PaintContext, PaintFeature} from '../core/paint';
import {fontStyle, formatAltitude, getLabelFillColor} from '../core/symbology';
import {TacticalGraphicName, getLabel} from '../core/type';
import {textWidth} from './decorations';
import {getFullLabel, halo, scaleOf} from './paintFunctions';

/** A paint function, in the shape the registry stores. */
type AirPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * Width of the label column, in characters, before the value starts.
 *
 * The lines are padded to a fixed width so the values start at roughly the same
 * place — "roughly" because the font is proportional, so `MIN ALT:` and `TIME FROM:`
 * do not pad to the same pixel. Reproduced verbatim from the OpenLayers original;
 * changing it would move every one of these labels.
 */
const LABEL_COLUMN = 11;

/** Share of the polygon's shorter side the block may fill before it is capped. */
const FIT_SHARE = 0.8;

const column = (label: string, value: string) => `${label.padEnd(LABEL_COLUMN)}${value}`;

/**
 * One multi-line label, left-justified, centred on the anchor as a block.
 *
 * **The block is centred by measuring it, not by centring the text.** The lines are
 * left-justified against each other — that is what puts the values in a column — so
 * the anchor sits at the block's left edge and is then pushed left by half the widest
 * line. Centring the text instead would ragged-edge the columns.
 *
 * A blank line separates the name block from the altitude block, per the MIL-STD-2525E
 * layout. It is an empty string rather than an offset because the renderer owns line
 * spacing, and a fixed offset only ever looks right at one zoom.
 */
function labelBlock(
    names: string[],
    values: string[],
    feature: PaintFeature,
    context: PaintContext,
    fitToPolygon: boolean,
): Paint[] {
    const lines = names.length && values.length ? [...names, '', ...values] : [...names, ...values];
    if (lines.length === 0 || feature.geometry.type !== 'Point') return [];

    const widest = Math.max(...lines.map(line => (line ? textWidth(context, line, fontStyle, 1) : 0)));
    const scale = fitToPolygon ? Math.min(scaleOf(feature, context), fitScale(feature, context, widest)) : scaleOf(feature, context);

    return [{
        geometry: feature.geometry,
        text: {
            text: lines.join('\n'),
            font: fontStyle,
            fill: getLabelFillColor(),
            halo: halo(),
            align: 'left',
            justify: 'left',
            baseline: 'middle',
            offsetXPx: -(widest * scale) / 2,
            scale,
        },
    }];
}

/**
 * The largest scale at which the block still fits inside the polygon, measured
 * against the **shorter** side of its bounding box so it fits whichever way the shape
 * is oriented. `Infinity` when the bounds have not been stamped yet — a first render,
 * before the holder has measured the geometry — so the ordinary scale stands.
 *
 * **This changes what OpenLayers draws, in one place, on purpose.** The old code read
 * `polygonExtentWidth` / `polygonExtentHeight`, and the *circular* airspace
 * coordination area's holder stamps `polygonMinX`…`polygonMaxY` without them — so it
 * was the one ACA of the three that never got the cap, and its designation could grow
 * past the circle. That was an accident of which properties one holder happens to
 * stamp, not a decision, and reading the bounds gives all three the same rule. It is
 * the only pixel that moves in the OpenLayers gallery: a 23x9 px block where that
 * sample's "ACA" is now capped like its siblings.
 */
function fitScale(feature: PaintFeature, context: PaintContext, widest: number): number {
    const bounds = feature.bounds;
    if (!bounds || widest <= 0) return Infinity;
    const shorter = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    return ((shorter / context.resolution) * FIT_SHARE) / widest;
}

/**
 * The eleven air-coordinating zones: the doctrinal prefix over the user's
 * designation, a blank line, then whichever of the four altitude and time lines are
 * set.
 */
export function airCoordinatingAreaLabelPaint(name: TacticalGraphicName): AirPaint {
    return (feature, context) => {
        const props = feature.properties;
        const names: string[] = [];
        const identifier = getLabel(name).trim();
        if (identifier) names.push(identifier);
        if (props.label?.trim()) names.push(props.label.trim());

        const values: string[] = [];
        if (props.minAltitude) values.push(column('MIN ALT:', formatAltitude(props.minAltitude)));
        if (props.maxAltitude) values.push(column('MAX ALT:', formatAltitude(props.maxAltitude)));
        if (props.startDate) values.push(column('TIME FROM:', props.startDate));
        if (props.endDate) values.push(column('TIME TO:', props.endDate));

        return labelBlock(names, values, feature, context, false);
    };
}

/**
 * The three airspace coordination areas.
 *
 * Prefix and designation are joined on **one** line here, and the second line is
 * `secondId` rather than `label` — these carry two designations where the zones carry
 * one. The value block is grid and one combined effective-time line rather than two
 * separate times.
 *
 * And the scale is capped to the polygon. Without the cap the block keeps growing as
 * you zoom out until it dwarfs the shape it annotates: measured against OpenLayers,
 * MapLibre drew **2.5x the ink** at the far zoom and 0.65x at the near one, which is
 * the signature of a cap applied in one engine and not the other.
 */
export function airspaceCoordinationAreaLabelPaint(name: TacticalGraphicName): AirPaint {
    return (feature, context) => {
        const props = feature.properties;
        const names: string[] = [];
        const identifier = getFullLabel(name, props.label ?? '').trim();
        if (identifier) names.push(identifier);
        if (props.secondId?.trim()) names.push(props.secondId.trim());

        const values: string[] = [];
        if (props.minAltitude) values.push(column('MIN ALT:', formatAltitude(props.minAltitude)));
        if (props.maxAltitude) values.push(column('MAX ALT:', formatAltitude(props.maxAltitude)));
        if (props.grid) values.push(column('GRID:', props.grid));
        // The effective time is the two date-time groups joined, and it **replaces** any
        // `eff` the caller set rather than falling back to it: the OpenLayers dispatcher
        // assigns `labels.eff = dateLabel` before calling the style, so an `eff` typed by
        // a user never reaches the label. Falling back to it instead added a line to the
        // block on any graphic carrying one, which widened it, which tightened the
        // fit-to-polygon cap — visible in the gallery as an ACA whose designation shrank.
        const effective = dateRange(props.startDate, props.endDate);
        if (effective) values.push(column('EFF', effective));

        return labelBlock(names, values, feature, context, true);
    };
}

/** The two date-time groups as one line — "start - end", or whichever is set. */
function dateRange(start?: string, end?: string): string {
    const from = start?.trim();
    const to = end?.trim();
    if (from && to) return `${from} - ${to}`;
    return from || to || '';
}

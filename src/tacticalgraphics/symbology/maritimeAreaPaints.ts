/**
 * # APP-06 §8.10 Table 8-12 — the maritime control areas
 *
 * Nine drawable leaves, and six of them need nothing here: 200101, 200201, 200202, 200401
 * and 200402 are a plain outline with a label block, and 200300 is a plain circle with two
 * lines of text in it. Those go through `areaOutlinePaint` and the label painters, like
 * every other area in the library.
 *
 * **This module is the three that carry a colour of their own**, plus the label rules that
 * are not the ordinary centred stack.
 *
 * ## The colour rule this file applies, and why it is not "follow the plate"
 *
 * Table 8-12 states colour in three different registers, and they are not interchangeable:
 *
 * | plate | wording | treated as |
 * |---|---|---|
 * | 200101 | *"may be depicted as orange (RGB: 255,155,0)"* | a host option — **not applied** |
 * | 200201 / 200202 | *"may be depicted as grey (RGB: 85,119,136)"* | a host option — **not applied** |
 * | 200600 | *"Cued Acquisition Doctrine symbol **has** a white border … with a 75% transparent Grey fill"* | applied, less the border |
 * | 200700 | *"RSD Graphic **has** a dark cyan border … with a 75% transparent dark cyan fill"* | applied |
 * | 200500 | nothing in prose; the Template's ring is drawn amber | applied, and measured |
 *
 * *"May be depicted as"* is an option a host exercises, and this library takes colours from
 * the host rather than deciding for it — so the four optional fills are recorded here and
 * left to `configureTacticalGraphics`. *"Has"* is the symbol, and is honoured, on the same
 * footing as `HAZARD_YELLOW` on the contaminated areas. @see ai/decisions.md
 *
 * **The one deliberate departure is 200600's white border.** A white stroke is invisible on
 * every basemap this library's default palette is drawn for — the plate's own Note 2 says
 * the grey behind it is there only so the border can be seen — so the outline takes the
 * affiliation colour and the fill carries the symbol. Painting a fixed white would produce
 * a graphic that is *technically* conformant and cannot be seen, and only the host knows
 * what its chart looks like.
 *
 * ## "75% transparent" — the words and the artwork disagree, and the words win
 *
 * Sampled off 200700's own Template at 300 dpi, the fill is `rgb(99,164,165)`. Composited
 * over white that is dark cyan at **alpha 0.75**, not 0.25: `0.75·51 + 0.25·255 = 102`.
 * So the plate's artwork is drawn at 75% *opacity* while its caption says 75%
 * *transparent* — the two readings differ by a factor of three and the caption is the
 * normative text. A quarter-opacity fill is also the only one that leaves a basemap
 * legible underneath, which is what an area fill on a chart is for.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintGeometryMembers, paintLineWork} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicStatus} from '../core/type';
import {formatDistance} from '../core/symbology';
import {labelColorOf, lineColorOf, scaleOf} from './paintFunctions';

type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The active manoeuvre area's amber, **measured** off 200500's Template at 300 dpi:
 * `#FFC000`, the modal non-grey pixel of its ring.
 *
 * It is here rather than left to the affiliation because the amber is the entire
 * difference between 200500 and 200400, whose Template is the same bare circle in black.
 * Neither plate letters anything, neither has a second arc or a tick, and neither carries a
 * fill — so a 200500 drawn in the ordinary line colour would be a circle indistinguishable
 * from any other, which is the failure mode that let the mined anti-tank ditch render as
 * the unmined one. @see ai/conventions.md, "compare every symbol against its own plate"
 */
export const ACTIVE_MANEUVER_AMBER = '#FFC000';

/**
 * 200101's orange and 200201 / 200202's grey — **outline and fill both**.
 *
 * **These are the "may be depicted as" colours, and they are applied.** The first version
 * of this file left them to the host on the reading that an optional colour is a host
 * choice; the user's call (2026-09-04) is to draw what the plate shows.
 *
 * The colour reached the fill alone at first, on the same reasoning 200600 still follows:
 * fill from the plate, outline from the affiliation. **The user's correction is that the
 * outline is the plate's too** — the Examples draw an orange ellipse with an orange rim and
 * a grey one with a grey rim, not a black rim round a tinted middle.
 *
 * That has a consequence, and it is the one 200500 and 200700 already carry: with no line
 * work left in the affiliation's colour, **these three stop offering an identity**. A
 * hostile launch area drawn red would be some other symbol entirely, and the sample sweep
 * asserts that anything still claiming hostility paints red from a bag-only stamp — so the
 * two halves have to move together. @see COLOUR_NAMED_AREAS, supportsHostility
 */
export const LAUNCH_AREA_COLOR = 'rgb(255,155,0)';
export const LAUNCH_AREA_FILL = 'rgba(255,155,0,0.25)';
export const DEFENDED_AREA_COLOR = 'rgb(85,119,136)';
export const DEFENDED_AREA_FILL = 'rgba(85,119,136,0.25)';

/** 200600's fill: the plate's grey at the caption's alpha. @see the module header */
export const CUED_ACQUISITION_FILL = 'rgba(85,119,136,0.25)';

/** 200700's dark cyan, stated by its Note as the border colour. */
export const RADAR_SEARCH_STROKE = 'rgb(51,136,136)';
/** 200700's fill: the same dark cyan at the caption's alpha. */
export const RADAR_SEARCH_FILL = 'rgba(51,136,136,0.25)';

/** The dash a planned graphic wears, matching every other area. */
const PLANNED_DASH_PX = [10, 10];

function plannedDash(feature: PaintFeature): number[] | undefined {
    return feature.properties.status === TacticalGraphicStatus.planned ? PLANNED_DASH_PX : undefined;
}

/** The outline, whatever geometry the generator handed over. */
function outline(feature: PaintFeature): Paint['geometry'] {
    return feature.geometry.type === 'GeometryCollection'
        ? {type: 'MultiLineString', coordinates: paintLineWork(feature.geometry)}
        : feature.geometry;
}

/**
 * Active manoeuvre area — APP-06 200500. A ring in the plate's amber, and nothing else.
 *
 * **It does not answer to hostility**, for the same reason the contaminated areas do not:
 * the colour is what names the symbol here rather than what identifies a side, and a
 * hostile one drawn red would be a different symbol — 200400 in red — rather than the same
 * symbol on the other team.
 */
export function activeManeuverAreaPaint(): AreaPaint {
    return feature => [{
        geometry: outline(feature),
        stroke: {color: ACTIVE_MANEUVER_AMBER, widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
    }];
}

/**
 * Cued acquisition doctrine — APP-06 200600. A rotated rectangle with the plate's grey
 * fill, outlined in the affiliation's colour rather than the plate's white.
 *
 * The shape comes from `RectangularTarget`: one anchor point at the centre, a length
 * `AM1`, a width `AM2` and a rotation `AN`. **`AN` here is a compass bearing** — *"0
 * degrees is North, and a positive rotation angle rotates the rectangle in a clockwise
 * direction"* — which is the opposite convention from the three ellipses in the same
 * table, whose `AN` is counter-clockwise from east. Both land on the same stored
 * `rotation`, because `RectangularTarget.frame` converts. @see EllipticalArea
 */
export function cuedAcquisitionDoctrinePaint(): AreaPaint {
    return feature => {
        const geometry = outline(feature);
        const areal = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
        return [{
            geometry,
            ...(areal ? {fill: {color: CUED_ACQUISITION_FILL}} : {}),
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
        }];
    };
}

/**
 * The three maritime areas the plate says "may be depicted as" a colour: 200101 in orange,
 * 200201 and 200202 in grey.
 *
 * **Both the rim and the fill**, from the plate. `stroke` is the solid colour and `fill`
 * the same colour at the caption's alpha, which is what the Examples draw.
 */
export function maritimeFilledAreaPaint(color: string, fill: string): AreaPaint {
    return feature => {
        const geometry = outline(feature);
        const areal = geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
        return [{
            geometry,
            ...(areal ? {fill: {color: fill}} : {}),
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
        }];
    };
}

/** Clearance between the shape's lower edge and the amplifier block under it, screen px. */
const AXIS_BLOCK_GAP_PX = 10;

/**
 * `AM`, `AM1` and `AN`, set under the shape — the three numbers that *are* an ellipse.
 *
 * ## Why these are drawn at all
 *
 * The Templates letter all three in boxes on their own construction arrows, which in this
 * library's reading is a plate asking for a field; the Examples then print the values as a
 * caption under the symbol (`AM = 60 Metres`, `AM1 = 112 Metres`, `AN = +30 degrees`).
 * The first version offered the three as dialog inputs and drew none of them. Drawing them
 * is the user's call (2026-09-04), and the Example's own layout is what says where.
 *
 * ## The mapping, which is two factors of two and a convention
 *
 * `AM` is the **minor axis radius** and `AM1` the **major axis radius**, while the public
 * schema carries a full `width` and a full `length` — so both are halved here. `AN` is the
 * rotation as stored: the plate's "0 degrees is east/west, positive rotates
 * counter-clockwise" is the trigonometric convention this library keeps `rotation` in, so
 * it passes through untouched and only the sign is written out, the way the Example does.
 *
 * Distances go through `formatDistance`, the same formatter field `AM` uses on the
 * corridors, rather than the Example's spelled-out "Metres": the unit convention is the
 * library's and the Example's prose is explaining its own numbers.
 *
 * **The whole block is one `amplifier` mark**, so "name only" drops it entire — which is
 * what the user asked for, and is right: none of the three names the symbol.
 */
export function axisAmplifierPaint(): AreaPaint {
    return (feature, context) => {
        const box = feature.bounds;
        if (!box) return [];

        const {width, length, rotation} = feature.properties;
        const lines: string[] = [];
        if (typeof width === 'number' && width > 0) lines.push(`AM = ${formatDistance(width / 2)}`);
        if (typeof length === 'number' && length > 0) lines.push(`AM1 = ${formatDistance(length / 2)}`);
        if (typeof rotation === 'number' && Number.isFinite(rotation)) {
            const turned = Math.round(rotation);
            lines.push(`AN = ${turned > 0 ? '+' : ''}${turned}°`);
        }
        if (!lines.length) return [];

        return [{
            geometry: {
                type: 'Point',
                coordinates: [(box.minX + box.maxX) / 2, box.minY - AXIS_BLOCK_GAP_PX * context.resolution],
            },
            text: {
                text: lines.join('\n'),
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'top',
                scale: scaleOf(feature, context),
                kind: 'amplifier',
            },
        }];
    };
}

/**
 * A label painter with the axis block appended under it.
 *
 * Composed rather than folded into `actionAreaLabelPaint`, which forty other graphics share
 * and none of the rest letters an axis.
 */
export function withAxisAmplifiers(base: AreaPaint): AreaPaint {
    const axis = axisAmplifierPaint();
    return (feature, context) => [...base(feature, context), ...axis(feature, context)];
}

/**
 * Radar search doctrine — APP-06 200700. The annular sector, in the dark cyan its Note
 * states outright.
 *
 * Border *and* fill, unlike 200600: dark cyan reads on a light chart and a white border
 * does not, so there is nothing to trade away here. @see the module header
 */
export function radarSearchDoctrinePaint(): AreaPaint {
    return (feature, context) => {
        /*
         * **The sector and its `T` arrive in one collection**, because the graphic is drawn
         * from three anchor points and so lives on a `LineGraphicBase`, which puts nothing
         * on a label feature. @see RadarSearchDoctrine.generateGraphics
         */
        const members = paintGeometryMembers(feature.geometry);
        const paints: Paint[] = [];
        for (const member of members) {
            if (member.type === 'Point') continue;
            const areal = member.type === 'Polygon' || member.type === 'MultiPolygon';
            paints.push({
                geometry: member,
                ...(areal ? {fill: {color: RADAR_SEARCH_FILL}} : {}),
                stroke: {color: RADAR_SEARCH_STROKE, widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
            });
        }

        const anchor = members.find(m => m.type === 'Point');
        const value = (feature.properties.designation ?? '').trim();
        if (anchor?.type === 'Point' && value) {
            paints.push(...radarSearchLabelPaint()({...feature, geometry: anchor}, context));
        }
        return paints;
    };
}

/**
 * Radar search doctrine's field `T`: *"positioned in the centre of the search area aligned
 * with the search axis"*.
 *
 * Both halves of that come from the generator, not from here — it anchors the label
 * midway between the start and stop ranges on the axis, and the rotation is read back off
 * the anchor's bearing from the graphic's own centre. This paint only draws it.
 *
 * **Upright rather than laid along the axis.** The plate boxes `T` and draws it level, and
 * a search axis sweeps the whole compass by design, so text turned to the axis would be
 * upside down through half of it. Same call as the bearing lines' letter.
 */
export function radarSearchLabelPaint(): AreaPaint {
    return (feature, context) => {
        const at = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as ProjectedPosition) : undefined;
        if (!at) return [];
        /*
         * **Not through `amplifierText`.** That helper blanks a line when the graphic is
         * hiding its amplifiers, and a designation is not one: it names the symbol, and
         * `amplifierSweep` asserts for every graphic that it survives the toggle. This
         * paint went through the helper first and the sweep caught it.
         */
        const value = (feature.properties.designation ?? '').trim();
        if (!value) return [];
        return [{
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: value,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                /*
                 * **No `kind: 'amplifier'`.** A designation names the symbol, and the
                 * standing rule is that it survives "hide amplifiers" -- `amplifierSweep`
                 * asserts exactly that for every graphic, and caught this one.
                 */
                scale: scaleOf(feature, context),
            },
        }];
    };
}

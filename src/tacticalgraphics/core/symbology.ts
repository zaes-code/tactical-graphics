/**
 * # Symbology — the colors, weights and label sizes, with no renderer in them
 *
 * These accessors used to live in `openlayerStyles.ts`, which made them
 * unreachable from anywhere that is not OpenLayers even though not one of them
 * mentions it. They are the same class of thing as `core/config.ts`, which is
 * already here for exactly this reason: what color a hostile line is, and how
 * big a label renders, describe the *symbology* — they would mean the same to a
 * MapLibre view, a Cesium view, or a consumer drawing to a canvas.
 *
 * `openlayerStyles.ts` re-exports every name below, so the OpenLayers layer's
 * public surface is unchanged and there is exactly one implementation of each.
 *
 * Values and pure functions only, like `config.ts`. Nothing here touches a DOM,
 * so this module loads in Node.
 */

import {
    BASE_FONT_SIZE_PX,
    DEFAULT_PALETTE,
    getDefaultLabelSize,
    getDefaultLineColorOverride,
    getDefaultLineWidth,
    getDrawMarkerColorOverride,
    getDrawMarkerOutlineColorOverride,
    getHandleColorOverride,
    getHostilityColorOverride,
    getInertHandleColorOverride,
    getLabelFillColorOverride,
    getLabelUsesHostilityColor,
    getLabelHaloColorOverride,
    ALTITUDE_UNIT_SUFFIX,
    getAltitudeUnit,
} from './config';
import {AltitudeDatum, TacticalGraphicHostility, TacticalGraphicName} from './type';
import {GRAPHIC_CATEGORIES, TacticalGraphicCategory} from './categories';
import {baseGeometryFor} from './render';
import {SECURITY_OPERATION_PX} from '../graphics/SecurityOperation';

// ── Line weight ──────────────────────────────────────────────────────────────

/**
 * Stroke width in screen pixels for every graphic's line work.
 *
 * A **function**, backed by the live config. Caching the result in a
 * module-level const is the bug this shape exists to prevent: a host's width
 * change could then never reach that stroke.
 */
export const LINE_WIDTH = (): number => getDefaultLineWidth();

/** Text-halo stroke width, in screen pixels. Independent of `LINE_WIDTH` by design. */
export const HALO_WIDTH = 4;

// ── Colors ──────────────────────────────────────────────────────────────────

/**
 * The doctrinal FM 1-02.2 affiliation colors.
 *
 * A host re-tints these through `configureTacticalGraphics({hostilityColors})`
 * rather than by editing this table.
 */
const HOSTILITY_COLORS = {
    friend: 'rgba(0, 0, 255, 1)',
    hostile: 'rgba(255, 0, 0, 1)',
    neutral: 'rgba(0, 128, 0, 1)',
    pending: 'rgba(255, 255, 0, 1)',
} as const;

/**
 * Affiliations that draw as another one. Doctrine gives assumed-friend the friendly
 * blue and suspect/joker the pending yellow, so an override on the affiliation a host
 * actually thinks about (`friend`, `pending`) carries to its alias without their having
 * to name both. An override on the alias itself still wins, for a host that wants them
 * distinguishable.
 */
const HOSTILITY_ALIASES: Partial<Record<TacticalGraphicHostility, TacticalGraphicHostility>> = {
    [TacticalGraphicHostility.assumedFriend]: TacticalGraphicHostility.friend,
    [TacticalGraphicHostility.suspectJoker]: TacticalGraphicHostility.pending,
};

/**
 * The doctrinal FM 1-02.2 color for an affiliation, **ignoring any config override**.
 * `undefined` for `unknown`, whose color is `getDefaultLineColor()` rather than an
 * affiliation color of its own.
 *
 * Exported because it is a *pure* answer to "what would this be with no override" —
 * something a settings UI needs and cannot get from `getColorByHostility`, which reads
 * the live config. Reading the live config to render a control that edits the live
 * config renders one frame stale: clearing an override re-renders before the host has
 * republished, so the cleared value is still what comes back.
 */
export function getDoctrinalHostilityColor(hostility: TacticalGraphicHostility): string | undefined {
    switch (HOSTILITY_ALIASES[hostility] ?? hostility) {
        case TacticalGraphicHostility.friend:
            return HOSTILITY_COLORS.friend;
        case TacticalGraphicHostility.hostileFaker:
            return HOSTILITY_COLORS.hostile;
        case TacticalGraphicHostility.neutral:
            return HOSTILITY_COLORS.neutral;
        case TacticalGraphicHostility.pending:
            return HOSTILITY_COLORS.pending;
        default:
            return undefined;
    }
}

/** An affiliation's line color: the host's override if there is one, else doctrine. */
export const getColorByHostility = (hostility: TacticalGraphicHostility): string => {
    const canonical = HOSTILITY_ALIASES[hostility] ?? hostility;
    const override = getHostilityColorOverride(hostility) ?? getHostilityColorOverride(canonical);
    if (override) return override;

    return getDoctrinalHostilityColor(hostility) ?? getDefaultLineColor();
};

/** Default stroke/fill color for graphics with no specific hostility color. */
export function getDefaultLineColor(): string {
    return getDefaultLineColorOverride() ?? DEFAULT_PALETTE.defaultLineColor;
}

/** Text label fill color. Follows the default line color unless overridden on its own. */
export function getLabelFillColor(): string {
    return getLabelFillColorOverride() ?? getDefaultLineColor();
}

/**
 * Whether text amplifiers take their graphic's affiliation colour rather than
 * `labelFillColor`. Re-exported here so a paint function has one place to import colour
 * rules from. @see TacticalGraphicsConfigOptions.labelUsesHostilityColor
 */
export {getLabelUsesHostilityColor};

/** Text label halo (outline) color — contrast against the map background. */
export function getLabelHaloColor(): string {
    return getLabelHaloColorOverride() ?? DEFAULT_PALETTE.labelHaloColor;
}

/**
 * ## Editor chrome
 *
 * The affordances a user edits a graphic with — handle dots, the inert center, the draw
 * marker. Not part of any symbol: they say "you can drag this", and that meaning must
 * not shift with a graphic's affiliation. Tinting handles by hostility made a hostile
 * graphic's handles the same red as its own strokes, so they stopped reading as handles
 * at all.
 */

/** Draggable handle dots. Renderers apply their own opacity on top. */
export function getHandleColor(): string {
    return getHandleColorOverride() ?? DEFAULT_PALETTE.handleColor;
}

/** Handle dots that exist but cannot be dragged in the current mode. */
export function getInertHandleColor(): string {
    return getInertHandleColorOverride() ?? DEFAULT_PALETTE.inertHandleColor;
}

/** The marker and sketch line shown while a graphic is being drawn. */
export function getDrawMarkerColor(): string {
    return getDrawMarkerColorOverride() ?? DEFAULT_PALETTE.drawMarkerColor;
}

/** That marker's outline. */
export function getDrawMarkerOutlineColor(): string {
    return getDrawMarkerOutlineColorOverride() ?? DEFAULT_PALETTE.drawMarkerOutlineColor;
}

/**
 * Re-expresses a color at a given alpha.
 *
 * Handles both forms the palette can hold: `rgb()`/`rgba()`, and the hex the
 * default line color is written as. Returns its input unchanged for anything
 * else, so a host's `hsl()` or named color degrades to full opacity rather than
 * to a crash.
 */
export function withOpacity(color: string, alpha: number): string {
    const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/);
    if (rgb) {
        const [, r, g, b] = rgb;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const hex = color.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length <= 4) h = h.split('').map(c => c + c).join(''); // #rgb(a) → #rrggbb(aa)
        return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
    }

    return color;
}

// ── Label scale ──────────────────────────────────────────────────────────────

/** The font most labels render at. Note `BASE_FONT_SIZE_PX` is 16, not the 24 many literals use. */
export const fontStyle = `bold ${BASE_FONT_SIZE_PX}px sans-serif`;

/**
 * The font literal every ratio-locked mission-task label renders with. Anything
 * that measures one of those labels has to pass this same string, or the measured
 * width won't match the drawn glyph.
 */
export const RATIO_LOCKED_LABEL_FONT = 'bold 24px sans-serif';
/** Declared px size of `RATIO_LOCKED_LABEL_FONT`, for glyph-height math. */
export const RATIO_LOCKED_LABEL_FONT_PX = 24;

/** Used when a feature carries no `drawingResolution` to anchor against. */
const TEXT_RESOLUTION_FALLBACK = 3000;

/**
 * Readability clamp on the zoom multiplier. Without the cap a graphic drawn from
 * high altitude grows its label without bound as the user zooms in past the
 * drawing zoom; without the floor the label shrinks to nothing zoomed out.
 */
const MIN_LABEL_ZOOM_MULTIPLIER = 0.3;
const MAX_LABEL_ZOOM_MULTIPLIER = 1.5;

export function labelZoomMultiplier(drawingResolution: number | undefined, resolution: number): number {
    const zoom = drawingResolution && drawingResolution > 0
        ? drawingResolution / resolution
        : Math.sqrt(TEXT_RESOLUTION_FALLBACK / resolution);
    return Math.min(MAX_LABEL_ZOOM_MULTIPLIER, Math.max(MIN_LABEL_ZOOM_MULTIPLIER, zoom));
}

/**
 * Ceiling shared by every *size-proportional* label scale.
 *
 * Both size-proportional formulas track the graphic's rendered size with nothing
 * stopping them, so a large or zoomed-in graphic grew a letter of unbounded
 * height. This is the same ceiling a zoom-anchored label stops at, expressed as a
 * multiple of the *configured* label size so raising `labelSize` raises it too.
 */
export function maxGraphicLabelScale(): number {
    return (getDefaultLabelSize() / BASE_FONT_SIZE_PX) * MAX_LABEL_ZOOM_MULTIPLIER;
}

/**
 * Zoom-anchored label scale — the default.
 *
 * At the drawing zoom the text is exactly `labelSize` px; zoomed out it shrinks
 * proportionally, clamped to [0.3, 1.5] of `labelSize` so it stays readable at
 * every altitude. Does **not** react to a resize; for that see
 * {@link graphicLabelScale}.
 */
export function labelScale(drawingResolution: number | undefined, resolution: number): number {
    return (getDefaultLabelSize() / BASE_FONT_SIZE_PX) * labelZoomMultiplier(drawingResolution, resolution);
}

/** Share of a graphic's on-screen size its label may span, for the block family. */
const GRAPHIC_LABEL_FRACTION = 0.5;

/**
 * Size-proportional label scale: the label grows with both user resize and
 * zoom-in. Falls back to {@link labelScale} when the graphic has no size stamped.
 */
export function graphicLabelScale(graphicSize: number | undefined, drawingResolution: number | undefined, resolution: number): number {
    if (graphicSize && graphicSize > 0) {
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        return Math.min(maxGraphicLabelScale(), sizeFactor * GRAPHIC_LABEL_FRACTION * (graphicSize / resolution) / BASE_FONT_SIZE_PX);
    }
    return labelScale(drawingResolution, resolution);
}

/**
 * Label height as a fraction of the graphic's size on screen, for the ratio-locked
 * mission tasks. Lower than `GRAPHIC_LABEL_FRACTION` because mission tasks store a
 * radius where the block family stores a perpendicular size — 0.3 lines the two
 * families up at their respective minimums.
 */
export const RATIO_LOCKED_LABEL_FRACTION = 0.3;

/**
 * The four tactical mission tasks FM 1-02.2 draws as two straight lines crossing at
 * a one-letter designation, table 6-1. They share one generator and one style.
 */
export const CROSSED_MISSION_TASKS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.Suppress,
];

/**
 * A distance for a user to read, from meters.
 *
 * Meters below a kilometer — a 400 m radius shown as "0.4 km" is both harder to read
 * and less precise than the number it came from. Above that, kilometers: one decimal
 * while the figure is small enough for it to mean something, whole numbers beyond
 * 10 km where it is noise.
 *
 * **In the core, because every renderer's measure read-out has to agree with every
 * other and with the properties dialog** — they report the same quantity and a user
 * compares them. It was in `openlayerStyles.ts`, which is why MapLibre had no
 * read-out to be consistent with.
 */
export const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    const km = meters / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
};

/**
 * An altitude or height for a label, from whatever the user typed.
 *
 * The number is written in the configured {@link AltitudeUnit} and the unit is appended,
 * which is what FM 1-02.2 asks for — fields X and X1 say "measurement units shall be
 * displayed in the string" — while keeping the input a plain number a host can store,
 * compare and sort. The plates append it tight: `1500FT`, not `1500 ft`.
 *
 * **Anything non-numeric is shown verbatim**, and that is what keeps the doctrine
 * whole. A flight level is not a count of feet and a datum is not a unit, so `FL150`,
 * `1500MSL` and `1500FT AGL` all pass through untouched — restored from a save,
 * imported from another system, or typed where a host allows it. Formatting them would
 * destroy the very thing they carry.
 *
 * @see getAltitudeUnit for why the unit is a host-level setting rather than per symbol.
 */
export const formatAltitude = (value: string | number | undefined, datum?: AltitudeDatum): string => {
    if (value === undefined) return '';
    const text = String(value).trim();
    const altitude = Number(text);
    if (text === '' || !Number.isFinite(altitude)) return text;

    // **A flight level is not a number of feet with a label on it.** `FL150` is 15,000 ft
    // of pressure altitude against the standard setting, and the number written is the
    // level itself — 150. So it takes the prefix and no unit, rather than a suffix.
    if (datum === AltitudeDatum.flightLevel) return `FL${Math.round(altitude)}`;

    const written = `${Math.round(altitude)}${ALTITUDE_UNIT_SUFFIX[getAltitudeUnit()]}`;
    // Spaced, as the plates print it: `1500FT AGL`.
    return datum ? `${written} ${datum}` : written;
};

/**
 * Graphics that carry a radius a user can read: the circular areas, the arc mission
 * tasks, the range fans.
 *
 * Drives both the properties dialog's read-out and the measure line drawn while the
 * graphic is sized. The coupling is deliberate — a graphic showing a radius in one
 * place and not the other reads as a bug — and it belongs here for the same reason
 * the formatter does: a second renderer draws the same read-out.
 */
export const RADIUS_GRAPHICS: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.BaseDefenseZone,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.FightingPosition,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.Isolate,
    // Movement to contact is deliberately absent. It is sized by a radius like the
    // rest of this list, but it is a **badge**, not an area: FM 1-02.2 table 5-10
    // draws it with no amplifier of any kind, and a distance is not one of the
    // things the symbol says. Reporting one put a measurement on the properties
    // dialog and a hashed read-out under the cursor that meant nothing.
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.PositionAreaArtilleryCircular,
    TacticalGraphicName.PurpleKillBoxCircular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
    TacticalGraphicName.TargetAreaCircular,
    TacticalGraphicName.WeaponSensorRangeFanCircular,
    TacticalGraphicName.WeaponSensorRangeFanSector,
]);

/** Whether this graphic reports a radius. @see RADIUS_GRAPHICS */
export function hasRadiusReadout(name: TacticalGraphicName): boolean {
    return RADIUS_GRAPHICS.has(name);
}

/**
 * Circle graphics that draw the read-out while being sized but carry **no radius field
 * in the properties dialog**.
 *
 * Seven, not ten: `TargetReferencePoint`, `PointTarget` and `FireSupportStation` also
 * route through the circular family but are commented out of the controller registry,
 * so they are not drawable. @see ai/excluded-graphics.md
 *
 * ## Why the two lists came apart
 *
 * They used to be one. `RADIUS_GRAPHICS` drove both the dialog's read-out and the hashed
 * line under the cursor, and the coupling was deliberate — a graphic reporting a radius
 * in one place and not the other reads as a bug.
 *
 * But the coupling ran the wrong way for a third of the family. These ten are drawn as
 * circles and sized by dragging, and the number the user is dragging *to* is the whole
 * point of showing it — while the dialog deliberately does not offer a radius field,
 * because the amplifier is not one the symbol carries. So they resized blind: the
 * neighbouring zone showed a distance and they showed nothing, for a reason no operator
 * can see. **A read-out is feedback on a gesture; a dialog field is an amplifier.**
 *
 * `MovementToContact` stays out of both, and that is doctrine rather than an omission:
 * FM 1-02.2 table 5-10 draws it with no amplifier of any kind, and it is a badge rather
 * than an area — a distance is not one of the things the symbol says.
 */
const SIZE_READOUT_ONLY: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Locate,
    TacticalGraphicName.PsyOpsZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
]);

/**
 * Whether this graphic draws the hashed read-out while it is being drawn or resized.
 *
 * Broader than {@link hasRadiusReadout}, which answers a different question — whether
 * the properties dialog offers a radius field. Both renderers read this one for the
 * measure line. @see SIZE_READOUT_ONLY
 */
export function showsSizeReadout(name: TacticalGraphicName): boolean {
    return RADIUS_GRAPHICS.has(name) || SIZE_READOUT_ONLY.has(name);
}

/**
 * Graphics whose designation gap is cut from the **rendered glyph** at paint time,
 * so the generated geometry must carry none of its own.
 *
 * The two bowed turns. Their generator leaves `0.16 * size` for the letter when
 * nobody says otherwise, which is right for a consumer taking the raw GeoJSON and
 * wrong for a renderer that measures the letter and cuts its own hole — the two
 * gaps add, and the curve opens three times wider than the "T" needs.
 *
 * A renderer that paints through this library's paint functions passes
 * `labelGap: 0` for these. It is a list rather than a per-renderer constant because
 * both renderers need the same answer, and the OpenLayers holder having it alone is
 * exactly how the two came to disagree.
 */
export const GLYPH_CUT_GAP_GRAPHICS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.Turn,
    TacticalGraphicName.TacticalTurn,
];

/**
 * The mission tasks whose designation is **ratio-locked**: a 24 px base font scaled
 * from the graphic's own `graphicSize`, so the letter grows and shrinks with the
 * circle it sits in. Every other mission task takes the ordinary zoom-anchored
 * 16 px label.
 *
 * Which list a task is on is a *symbology* fact, not a renderer's opinion — a letter
 * that tracks its circle in one view and holds a zoom-anchored size in another is
 * two different symbols. It lived in the OpenLayers holder, and the second renderer
 * duly disagreed with it: every mission-task letter was drawn ratio-locked there,
 * which put a 24 px "T" on a turn that OpenLayers drew at 16 px and scaled it by a
 * different rule as the map moved.
 *
 * The crossed four are here for the font only. Their scale is overridden with a
 * constant, because the whole symbol is pinned to a fixed screen size — but keeping
 * them on the list keeps the family's font literal in one place.
 */
export const RATIO_LOCKED_MISSION_TASKS: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.Isolate,
    // The other three arc-and-arrowhead circles. Their letters used to render at the
    // zoom-anchored 16 px default while Isolate's "I" tracked its circle, so four
    // graphics built from the same arcs disagreed about how big a one-letter label is.
    TacticalGraphicName.Occupy,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Secure,
    // **And the last five, 2026-08-26.** The same reasoning had been applied twice and
    // stopped short both times: these are built from the identical two arcs and carry the
    // identical rim letter, so leaving them zoom-anchored meant a `LOC` or a `C/S` held
    // its screen size while the circle around it shrank — at a far zoom the letter is the
    // graphic. A zoom-anchored scale is *deliberately* insensitive to the shape; this
    // family needs the opposite.
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.Deny,
    TacticalGraphicName.Locate,
    ...CROSSED_MISSION_TASKS,
]);

/** Scale of a ratio-locked mission task's label. Anything opening a gap for that label must use this number. */
export function ratioLockedLabelScale(graphicSize: number | undefined, drawingResolution: number | undefined, resolution: number): number {
    if (graphicSize && graphicSize > 0) {
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        return Math.min(maxGraphicLabelScale(), sizeFactor * RATIO_LOCKED_LABEL_FRACTION * (graphicSize / resolution) / BASE_FONT_SIZE_PX);
    }
    return labelScale(drawingResolution, resolution);
}

/**
 * Fraction of a font's declared px size taken up by a capital letter's height.
 *
 * Used wherever a gap has to clear a glyph's *height* rather than its width —
 * the arc mission tasks' tangential gap, which runs along the letter's height
 * when the label sits due east.
 */
export const CAP_HEIGHT_FRACTION = 0.72;

/**
 * Tic length on the arc mission tasks, as a fraction of the graphic's radius.
 *
 * APP-06 sets it against the letter rather than against the circle:
 *
 * > The default tic length should be the same as the text height of the identifying
 * > letter. Spacing between the tics should also be the height of the identifying
 * > letter. (151204 Contain; 151205 Retain states the length half)
 *
 * **Derived, not measured.** These labels are ratio-locked, so the letter's cap height
 * is a fixed share of the radius at every zoom: the scale is
 * `RATIO_LOCKED_LABEL_FRACTION x radiusPx / BASE_FONT_SIZE_PX`, rendered at
 * `RATIO_LOCKED_LABEL_FONT_PX`, of which `CAP_HEIGHT_FRACTION` is the capital. Writing
 * the 0.324 out as a literal would silently stop matching the letter the first time any
 * of those four moved.
 *
 * Contain and Retain both drew their tics at `size / 2.5` — 0.4 of the radius, about a
 * quarter too long — and spaced them nearly twice as far apart as the letter is tall.
 */
export const ARC_TIC_FRACTION =
    RATIO_LOCKED_LABEL_FRACTION * (RATIO_LOCKED_LABEL_FONT_PX / BASE_FONT_SIZE_PX) * CAP_HEIGHT_FRACTION;

/**
 * How many tics span `spanDegrees` of arc at that spacing, counting both ends.
 *
 * The spacing APP-06 asks for is a *chord* — one letter-height along the rim — so the
 * angular step is `2 * asin(fraction / 2)` rather than the fraction itself. At the
 * radius these graphics are drawn the difference is small, but it grows with the
 * fraction and getting it wrong puts the last tic through the label's gap.
 */
export function arcTicCount(spanDegrees: number): number {
    const stepDegrees = (2 * Math.asin(Math.min(ARC_TIC_FRACTION / 2, 1)) * 180) / Math.PI;
    if (!(stepDegrees > 0)) return 2;
    return Math.max(2, Math.round(Math.abs(spanDegrees) / stepDegrees) + 1);
}

/**
 * Graphics that draw both standard identities at once, so selecting one is
 * meaningless. Line of contact is the whole set: FM 1-02.2's line control measure
 * table prints it as two opposed waves - the enemy side red, the friendly side
 * black - and the generator does exactly that, unconditionally. A hostility here
 * has nothing to change.
 */
const BOTH_IDENTITIES_AT_ONCE = new Set<TacticalGraphicName>([TacticalGraphicName.LineOfContact]);

/**
 * The four FM 1-02.2 table 5-19 obstacle effects, each an exact copy of the
 * Chapter 6 tactical mission task of the same doctrinal name apart from the
 * letter. They are Chapter 5, so the category derivation would switch hostility on
 * and a hostile one would draw red - but a twin that renders differently from what
 * it twins is not a twin. Kept separate from the set above because the reason is
 * different: line of contact has nothing to change, these have something to change
 * and must not.
 */
const MISSION_TASK_TWINS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Block,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.Fix,
    TacticalGraphicName.Turn,
]);

/**
 * Whether a graphic's line work takes the standard identity color at all.
 *
 * **A symbology fact, not a UI one**, which is why it lives here rather than beside
 * the dialog's field list. FM 1-02.2 gives no amplifier fields to the Chapter 6
 * tactical mission tasks: a hostile Seize is drawn exactly like any other Seize.
 * Deriving that from the category beats repeating a boolean 198 times - a graphic
 * added later inherits the right answer instead of whatever was copied above it.
 *
 * It moved out of `openlayers/graphicFieldRegistry.ts` (which still re-exports it)
 * once there was a second renderer. Hiding the input is only half the rule: it
 * stops a *user* choosing an identity, and does nothing about one that arrives in
 * an imported file or from a host that writes the bag itself. The other half is
 * {@link getColorByHostility}'s caller refusing it - see `lineColorOf`.
 */
/**
 * The three obstacle bypasses, whose own row says so in as many words:
 *
 * > Obstacle bypass symbols indicate a mobility function and should be rendered in black.
 *
 * A third reason, distinct from both sets above: these have something to change and are
 * told not to, like the mission-task twins, but the instruction is the standard's own
 * rather than an inference from what they twin.
 */
const MOBILITY_FUNCTION_SYMBOLS = new Set<TacticalGraphicName>([
    TacticalGraphicName.ObstacleBypassEasy,
    TacticalGraphicName.ObstacleBypassDifficult,
    TacticalGraphicName.ObstacleBypassImpossible,
]);

/**
 * The CBRN contaminated areas, which describe **ground rather than a force**.
 *
 * Table 8-19 draws all seven one way: the hazard yellow, the inverted triangle, the
 * letter. A contaminated area warns about a place — it belongs to nobody, and asking who
 * it is affiliated with has no answer the symbol could show.
 *
 * The yellow was already fixed for that reason, on the reading that "the outline still
 * carries the affiliation". That half is gone: a hostile contaminated area drew red line
 * work around a hazard whose whole point is that it does not care who is standing in it,
 * and the field offered an identity the plate has no form for. (User's call, 2026-08-26.)
 */
const HAZARD_AREAS = new Set<TacticalGraphicName>([
    TacticalGraphicName.BiologicalContaminatedArea,
    TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.ChemicalContaminatedArea,
    TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial,
    TacticalGraphicName.NuclearContaminatedArea,
    TacticalGraphicName.RadiologicalContaminatedArea,
    TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial,
]);

/**
 * Restricted terrain and severely restricted terrain, for the same reason as the hazard
 * areas: they describe **ground rather than a force**.
 *
 * APP-06 152400 and 152500 say what a piece of country does to movement -- a gradient, a
 * marsh, dense woodland -- and the answer is the same whoever is trying to cross it. Their
 * Templates carry a Sector 1 modifier, a Sector 2 modifier and field H, and nothing else:
 * no `T`, no `N`, no status form. So the identity had nowhere to go but the outline, where
 * it turned a statement about the ground into a claim about a side. (User's call,
 * 2026-08-26.) @see sectorModifierPaints
 *
 * **The limited access area is deliberately not here.** Its FM 1-02.2 Template offers a
 * date-time group, so it is a restriction someone imposes for a while rather than a
 * standing property of the ground, and the affiliation still reads.
 */
const TERRAIN_DESCRIPTIONS = new Set<TacticalGraphicName>([
    TacticalGraphicName.RestrictedTerrain,
    TacticalGraphicName.SeverelyRestrictedTerrain,
]);

export function supportsHostility(name: TacticalGraphicName): boolean {
    if (BOTH_IDENTITIES_AT_ONCE.has(name) || MISSION_TASK_TWINS.has(name)) return false;
    if (MOBILITY_FUNCTION_SYMBOLS.has(name) || HAZARD_AREAS.has(name)) return false;
    if (TERRAIN_DESCRIPTIONS.has(name)) return false;
    return GRAPHIC_CATEGORIES[name] !== TacticalGraphicCategory.TacticalMissionTasks;
}

/**
 * The gestures a graphic accepts.
 *
 * **A property of the symbol, not of a renderer.** Some of these are badges: they
 * mark a point and describe no ground extent, so there is no size for a resize to
 * be right about and no axis for a rotate to turn. Others are pinned to a screen
 * size outright and would simply ignore the number.
 *
 * It reads as doctrine rather than as UI: refusing a gesture is how the symbol
 * says "this dimension is not yours to set". A renderer that let the user drag it
 * anyway would store a number the generator throws away, which looks like a
 * gesture that silently does nothing.
 *
 * The OpenLayers side enforces the same thing by choosing a controller —
 * `PointDropController` no-ops both for the crossed tasks and keeps resize for the
 * readiness states; `SecurityOperationsController` no-ops resize and keeps rotate.
 * This is that knowledge as a table any renderer can read.
 */
export interface AllowedGestures {
    translate: boolean;
    rotate: boolean;
    resize: boolean;
    /** Whether the base has vertices a user can drag. A point never does. */
    modify: boolean;
}

/**
 * The security operations. They rotate — the arms point somewhere — but they are
 * badges and do not resize; every dimension is a screen constant.
 */
const ROTATE_ONLY_SYMBOLS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

/**
 * The point-anchored symbols the operator **scales but does not turn**.
 *
 * Each is dropped whole on one click and then sized — an airfield covers ground, a
 * completed roadblock spans a road, a crossed mission task covers the area the task
 * applies to — but each has a single doctrinal orientation, so `PointDropController`
 * no-ops the rotate.
 *
 * **All four crossed tasks are here as of 2026-08-17.** They were fixed-size badges,
 * pinned to a constant 100 px so a stored size was divided straight back out. The
 * security operations still are, and stay out of this set: they mark a screening force,
 * not an extent of ground. @see ROTATE_ONLY_SYMBOLS
 *
 * **Neither was listed here, and only OpenLayers refused the rotate.** The refusal lived
 * in the controller, which MapLibre does not have, so a rotate drag turned a graphic on
 * one engine and did nothing on the other. That is the standing failure mode for anything
 * decided in a holder: the table is portable, the controller is not.
 * @see ai/conventions.md — "A symbology fact never lives in a holder"
 */
const RESIZE_ONLY_SYMBOLS = new Set<TacticalGraphicName>([
    TacticalGraphicName.Airfield,
    TacticalGraphicName.RoadblockCompleteExecuted,
    TacticalGraphicName.Destroy,
    TacticalGraphicName.Interdict,
    TacticalGraphicName.Neutralize,
    TacticalGraphicName.Suppress,
]);

/** How far a security operation's arm reaches from the centre, in screen pixels. */
const SECURITY_OPERATION_REACH_PX =
    SECURITY_OPERATION_PX.labelPadding + SECURITY_OPERATION_PX.labelGap + SECURITY_OPERATION_PX.arrowLength;

/**
 * Half of a security operation's own width, in screen pixels — the figure it files as its
 * `radius`, and the size its generator lays every arm out from.
 *
 * **It is not an amplifier.** These three refuse a resize because their size is not a user
 * input: it is this constant times the live resolution, so the symbol holds 410 x 29 px at
 * every zoom. What the number does is tell the generator how big to build, and tell a
 * saved file what the graphic's size was when it was last realised.
 *
 * It is here because the two engines were saying different things about it. MapLibre
 * computed this expression inline and re-derived it on every build; OpenLayers filed
 * nothing at all and let whatever a snapshot happened to carry pass straight through — so
 * `compare:engines` read the same three graphics as `radius 180000 vs 1320000`, a stale
 * figure from the file's own zoom beside a current one.
 *
 * **A save and a restore at a different zoom will not agree on it, by design.** The figure
 * is pixels times a resolution and a snapshot carries no viewport state
 * (`ai/context.md`), so restoring two zooms out files four times the metres for the same
 * 410 px symbol. That is the pinning working, and `fullRoundTrip` exempts it for that
 * reason.
 *
 * Multiplied by the **raw** resolution rather than converted to ground metres, because
 * these symbols are placed in projected space and hold their pixel size at any latitude.
 * @see placeOriginCentered
 */
export const SECURITY_OPERATION_HALF_EXTENT_PX =
    SECURITY_OPERATION_PX.labelPadding + SECURITY_OPERATION_PX.labelGap + 2 * SECURITY_OPERATION_PX.arrowLength;

/**
 * The half-width, in **screen pixels**, that a one-click graphic is dropped at — and, by
 * being defined at all, the statement that the graphic *is* a one-click drop.
 *
 * **Both engines need this and neither owned it.** OpenLayers had it as a literal in each
 * controller factory (`res * 50`, `res * 34`, `res * 100`) and MapLibre had no idea these
 * graphics existed as a family: it decided one-click-ness from `allowedGestures(name).resize`
 * instead, on the reasoning that a resizable point graphic is *sized by the draw* in two
 * clicks. That is true of the graphics OpenLayers draws through a Circle interaction and
 * false of every one below, so the moment the airfield became resizable it took two clicks
 * on MapLibre and one on OpenLayers.
 *
 * **In pixels, converted at the moment of the drop.** A metre default is a different symbol
 * at every zoom — a few pixels across when zoomed out, with its handles piled on top of each
 * other and nothing grabbable. A pixel default lands the same size on screen wherever the
 * operator is working, and is then stored as the metres it came to.
 */
const DROP_SIZE_PX: Partial<Record<TacticalGraphicName, number>> = {
    // The crossed tasks, fixed and resizable alike: the size the family has always
    // been drawn at. @see CROSSED_HALF_WIDTH_PX
    [TacticalGraphicName.Destroy]: 50,
    [TacticalGraphicName.Interdict]: 50,
    [TacticalGraphicName.Neutralize]: 50,
    [TacticalGraphicName.Suppress]: 50,
    [TacticalGraphicName.Airfield]: 34,
    // Twice the crossed tasks', which was only the number these were specified from
    // rather than the size they landed on.
    [TacticalGraphicName.RoadblockCompleteExecuted]: 100,
    // The security operations, whose arms reach label padding + gap + arrow. Computed
    // from the table the generator lays them out with rather than restated, so the drop
    // cannot drift away from the symbol. They are pinned, so nothing *renders* from this
    // — but a stored size that means something beats `DEFAULT_RADIUS_METERS`, which is
    // what they were getting.
    [TacticalGraphicName.Cover]: SECURITY_OPERATION_REACH_PX,
    [TacticalGraphicName.Guard]: SECURITY_OPERATION_REACH_PX,
    [TacticalGraphicName.Screen]: SECURITY_OPERATION_REACH_PX,
};

/**
 * The size a one-click graphic is dropped at, or `undefined` if it is not one.
 *
 * A renderer asks two things of this: whether to finish the draw on the first click, and
 * how big to make what it just dropped. @see DROP_SIZE_PX
 */
export function dropSizePx(name: TacticalGraphicName): number | undefined {
    return DROP_SIZE_PX[name];
}

export function allowedGestures(name: TacticalGraphicName): AllowedGestures {
    // A point-anchored graphic has one vertex and dragging it is a move, not a
    // reshape — so `modify` is off and `translate` covers it.
    const pointAnchored = baseGeometryFor(name) === 'Point';

    if (ROTATE_ONLY_SYMBOLS.has(name)) {
        return {translate: true, rotate: true, resize: false, modify: false};
    }
    if (RESIZE_ONLY_SYMBOLS.has(name)) {
        return {translate: true, rotate: false, resize: true, modify: false};
    }
    return {translate: true, rotate: true, resize: true, modify: !pointAnchored};
}


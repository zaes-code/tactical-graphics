/**
 * # The style pair for a graphic, without owning the graphic
 *
 * A host that renders saved graphics itself — its own layer, its own features, its own
 * ids — needs one thing from this package that it could not get: **which style functions
 * draw this symbol.** That fact lives in the holder classes, which are internal, so the
 * question had no public answer and every consumer guessed at one.
 *
 * The guess that keeps getting made is `getStyle`, because it is exported, takes a name
 * and returns styles. It is the *area outline* dispatcher: its fallback is
 * `areaOutlinePaint`, it draws no text at all, and for the two hundred graphics that are
 * not areas it is simply the wrong function. A downstream integration shipped with every
 * area unlabelled and every arc mission task missing the letter that identifies it —
 * `R`, `I`, `AD` — because `getStyle` was applied to the label feature too. Nothing
 * errored; the symbols were just quietly wrong.
 *
 * `stylesFor(name)` answers the real question, and answers it from the holder that
 * actually draws the graphic rather than from a second table that would drift:
 *
 * ```ts
 * const {graphic, labels} = stylesFor(name);
 * const rendered = renderTacticalGraphic(feature);
 * graphicFeature.setStyle(graphic);
 * if (labels) labelFeature.setStyle(labels);
 * ```
 *
 * ## `labels` is optional, and the absence is information
 *
 * 84 of the 292 registered graphics draw every glyph they have on the graphic feature —
 * a phase line's `PL ALPHA` end labels, an anti-tank ditch's teeth, the direction
 * arrows. Their holders create no label feature, so `labels` is `undefined` and a host
 * should not add one: `renderTacticalGraphic` still returns a `labels` geometry for
 * them, and styling it is how a duplicate or a stray mark appears.
 *
 * ## Why building a holder is the right implementation
 *
 * It looks wasteful and it is the only version that cannot go stale. The pairing is
 * decided in twelve holder constructors that dispatch on the name alone; restating it
 * here would be the same fact in two places, which is the failure this repo names in
 * `ai/conventions.md` and has paid for repeatedly. So this constructs the holder the
 * controller registry would build, reads the styles off the features it created, and
 * throws the holder away. The result is cached per name — the pairing cannot change for
 * a given name within a session.
 *
 * @see getStyle for the area outline alone, which is all it ever was.
 */

import type {Feature} from 'ol';
import type {StyleFunction, StyleLike} from 'ol/style/Style';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import openlayersAdapter from './openlayersAdapter';
import {ROLE_KEY} from './graphicProperties';

/** The style functions that draw one graphic. @see stylesFor */
export interface GraphicStyles {
    /** Draws the graphic's own geometry — `renderTacticalGraphic(...).graphic`. */
    graphic: StyleFunction;
    /**
     * Draws `renderTacticalGraphic(...).labels`, or **undefined** when this graphic keeps
     * all of its text on the graphic feature and its label geometry should be left
     * unstyled.
     */
    labels?: StyleFunction;
}

/**
 * The resolution the throwaway holder is built at.
 *
 * Any value works and the test pins that: every style function reads what it needs off
 * the feature it is handed — amplifiers through `readGraphicLabels`, size through
 * `graphicSize` — and takes the live resolution as its second argument. The constructor's
 * resolution decides the holder's *geometry*, which is discarded here.
 */
const PROBE_RESOLUTION = 40;

/** `Style | Style[] | StyleFunction` narrowed to something a host can just call. */
function asStyleFunction(style: StyleLike | null | undefined): StyleFunction | undefined {
    if (!style) return undefined;
    return typeof style === 'function' ? (style as StyleFunction) : () => style;
}

const cache = new Map<TacticalGraphicName, GraphicStyles>();

/**
 * How `name` is drawn: the style function for its geometry, and for its labels when it
 * has a separate label feature.
 *
 * Throws for a name with no controller, which is the same error `getController` raises —
 * an unregistered graphic is a wiring mistake, not a styling one.
 */
export function stylesFor(name: TacticalGraphicName): GraphicStyles {
    const cached = cache.get(name);
    if (cached) return cached;

    const holder = openlayersAdapter.getTacticalGraphicController(name, PROBE_RESOLUTION, 0);
    const byRole = (role: string): Feature | undefined => holder.getFeatures().find(f => f.get(ROLE_KEY) === role);

    const graphic = asStyleFunction(byRole('graphic')?.getStyle());
    if (!graphic) {
        throw new Error(`[TacticalGraphics] "${name}" has no styled graphic feature. This is a bug in its holder, not in the caller.`);
    }

    const styles: GraphicStyles = {graphic, labels: asStyleFunction(byRole('label')?.getStyle())};
    cache.set(name, styles);
    return styles;
}

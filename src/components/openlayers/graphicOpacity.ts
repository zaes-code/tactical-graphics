/**
 * # A dimmed graphic, as the OpenLayers features carry it
 *
 * View state the host owns, held the way "name only" is: a flag on each OL feature of the
 * graphic, which the style functions read. There is no second copy, it never reaches the
 * portable description, and it survives edits because edits move these same features.
 * @see TacticalGraphicsEngine.setOpacity
 * @see amplifierVisibility
 */

import type {Map as OlMap} from 'ol';
import type {FeatureLike} from 'ol/Feature';
import type {Style} from 'ol/style';
import {featuresOf} from './amplifierVisibility';

/** The feature property a graphic's opacity rides on, 0 to 1. Absent means opaque. */
export const GRAPHIC_OPACITY_KEY = 'opacity';

/** Puts `opacity` on every feature of `symbolId`. True when any feature carried that id. */
export function stampGraphicOpacity(map: OlMap, symbolId: string, opacity: number): boolean {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(opacity) ? opacity : 1));
    const features = featuresOf(map, symbolId);
    for (const feature of features) {
        feature.set(GRAPHIC_OPACITY_KEY, clamped >= 1 ? undefined : clamped);
        feature.changed();
    }
    return features.length > 0;
}

/** The opacity a feature asks to be drawn at, 1 when it asks for none. */
export function graphicOpacityOf(feature: FeatureLike | undefined): number {
    const value = feature?.get(GRAPHIC_OPACITY_KEY);
    return typeof value === 'number' && value < 1 ? value : 1;
}

/**
 * A center-symbol style drawn at `opacity`. A copy, because these styles are cached per
 * provider and shared: fading the original would fade every graphic that uses it.
 */
export function fadedSymbolStyle(style: Style | undefined, opacity: number): Style | undefined {
    if (!style || opacity >= 1) return style;
    const faded = style.clone();
    faded.getImage()?.setOpacity(opacity);
    return faded;
}

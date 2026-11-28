/**
 * # "Name only", as the MapLibre renderer carries it
 *
 * Whether a graphic shows its name only is view state the host owns, not part of the
 * portable description, so it never reaches `properties.tacticalGraphic`. This renderer
 * holds it where the paint layer reads it: `hideAmplifiers` on the graphic's paint
 * features. @see PaintFeature.hideAmplifiers
 *
 * The flag on the held graphic **is** the state. There is no second copy to fall out of
 * step, and nothing here reads or writes browser storage: remembering the choice beyond
 * the graphic's lifetime is the host's business. A rebuild keeps it through
 * `carryPaintFlags`. @see TacticalGraphicsEngine.setAmplifiersHidden
 */

import type {MapLibreTacticalGraphic} from './maplibreAdapter';

/** The two renderer verbs this needs, so a stub or another renderer can supply them. */
export interface HeldGraphics {
    find(id: string): MapLibreTacticalGraphic | undefined;
    replace(id: string, next: MapLibreTacticalGraphic): void;
}

/**
 * Puts the choice onto the graphic's paint features and re-realizes it.
 *
 * MapLibre bakes each paint result into a GeoJSON source, so a flag only the paints read
 * has to be put on the paint features and the graphic swapped in again. Returns whether a
 * graphic with that id was on the map.
 */
export function stampAmplifierVisibility(renderer: HeldGraphics, id: string, hidden: boolean): boolean {
    const current = renderer.find(id);
    if (!current) return false;
    renderer.replace(id, {
        ...current,
        graphic: {...current.graphic, hideAmplifiers: hidden || undefined},
        labels: current.labels ? {...current.labels, hideAmplifiers: hidden || undefined} : current.labels,
    });
    return true;
}

/** Whether the graphic `id` is currently drawn name-only. */
export function amplifiersHiddenOn(renderer: HeldGraphics, id: string): boolean {
    return renderer.find(id)?.graphic.hideAmplifiers === true;
}

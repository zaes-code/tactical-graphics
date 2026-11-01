import type {Position} from 'geojson';
import * as turf from './turf';
import {axisOf, carriesWidthPointInBase, squareWidthPoint, upgradeAxisBase} from './axisWidth';
import {TIP_FIRST_SINCE_SNAPSHOT_3, generatorOrder} from './drawOrder';

/**
 * # One reading of an older base, for every engine
 *
 * A file's bases are repaired on the way in when the file is older than the shape this
 * library writes now. Both repairs depend on the version, and both engines' restores and
 * every add-on that reads a file go through this one function, so an old file cannot open
 * as two different drawings. @see SNAPSHOT_VERSION
 */

/** What {@link upgradeSavedLine} did to a base. */
export interface UpgradedLine {
    coordinates: Position[];
    /** True when a version 1 `width` amplifier was turned into the axis's width point. */
    widthSpent: boolean;
}

/**
 * Whether an axis arrow's base already ends in its width point.
 *
 * The question a **versionless** file forces. Its axis arrows can be either shape: an old
 * MapLibre export or a hand-built file from before 2026-09-10 holds the route and a `width`,
 * while a file a host assembled from a current export (or one whose stamp was dropped on the
 * way) holds the route plus the width point. Reading the second as the first appended a
 * second width point, which drew a broken arrow on every engine and then moved it on every
 * import and export (measured 2026-10-31: about 40 to 80 m per hop, 366 m after seven).
 *
 * The geometry answers it. The width point sits at the back corner of the arrowhead, a head's
 * length from the tip, while a legacy base's last coordinate is the rear of the route. So the
 * last coordinate is a width point when it lies nearer the tip than the route's own last
 * vertex, or when squaring it reproduces it.
 */
export function endsInWidthPoint(name: string | undefined, coords: Position[]): boolean {
    if (!carriesWidthPointInBase(name) || coords.length < 3) return false;
    const last = coords[coords.length - 1];
    const axis = generatorOrder(name, axisOf(name, coords));
    const tip = axis[axis.length - 1];
    const rear = axis[0];
    const toTip = turf.distance(turf.point(last), turf.point(tip), {units: 'meters'});
    const toRear = turf.distance(turf.point(last), turf.point(rear), {units: 'meters'});
    if (toTip < toRear) return true;
    const squared = squareWidthPoint(name, coords);
    const settled = squared[squared.length - 1];
    return turf.distance(turf.point(last), turf.point(settled), {units: 'meters'}) <= Math.max(0.01, toTip * 1e-6);
}

/**
 * A saved line base in the shape this version of the library writes.
 *
 * - **Before version 2** the eleven axis arrows filed their width as an amplifier. The width
 *   becomes the base's last coordinate. A file that declares no version is checked base by
 *   base, because it may hold either shape. @see endsInWidthPoint
 * - **Before version 3** the four direction-of-attack arrows were stored rear first. APP-06
 *   numbers their arrowhead point 1, so the line is reversed. @see TIP_FIRST_SINCE_SNAPSHOT_3
 *
 * @param version the version the file declares, or the legacy version where it declares none
 * @param declared whether the file stated a version at all
 */
export function upgradeSavedLine(
    version: number,
    declared: boolean,
    name: string | undefined,
    coords: Position[],
    width: number | undefined,
    fallbackWidth?: number,
): UpgradedLine {
    let coordinates = coords;
    let widthSpent = false;
    if (version < 2 && !(!declared && endsInWidthPoint(name, coords))) {
        const upgraded = upgradeAxisBase(name, coords, width, fallbackWidth);
        if (upgraded !== coords) {
            coordinates = upgraded;
            widthSpent = true;
        }
    }
    if (version < 3 && name !== undefined && TIP_FIRST_SINCE_SNAPSHOT_3.includes(name) && coordinates.length >= 2) {
        coordinates = [...coordinates].reverse();
    }
    return {coordinates, widthSpent};
}

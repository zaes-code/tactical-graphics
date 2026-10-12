/**
 * Angle conversion helpers.
 *
 * Declared here rather than imported from `ol/math` so the geometry layer
 * carries no map-library dependency. `GeometryService` exposes an identical
 * `toRadians` as an instance method; prefer these module-level functions in
 * graphic generators that don't otherwise need the service.
 */

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Great-circle metres between two lon/lat positions.
 *
 * On the **mean** sphere, 6371008.8 m — what turf measures every other distance in this
 * library with, and what `ol/sphere.getDistance` uses on the other side of the boundary.
 * The equatorial radius was 0.11% larger, which is nothing on its own and everything when
 * two implementations of one amplifier are compared: it is the whole of the 391,193 m
 * against 390,756 m the two engines used to file for the same drawn box.
 */
export function groundMeters(a: [number, number], b: [number, number]): number {
    const R = 6371008.8;
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

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

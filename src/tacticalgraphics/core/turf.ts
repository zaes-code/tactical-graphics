/**
 * # The turf surface this library uses, and nothing else
 *
 * Every module here imports turf through this file rather than from
 * `@turf/turf`. Import the meta-package and you get all of turf, which is how
 * an **AGPL-3.0** dependency ended up in the production tree:
 *
 * ```
 * @turf/turf
 *   ├─┬ @turf/isobands  → marchingsquares (AGPL-3.0)
 *   └─┬ @turf/isolines  → marchingsquares (AGPL-3.0)
 * ```
 *
 * Neither `isobands` nor `isolines` is used here, and never was. Strong
 * copyleft in the dependency tree of a package offered commercially is the
 * first thing a buyer's software-composition scan raises, and several primes
 * reject AGPL outright — so the cost of the meta-package was a licensing
 * problem, not a bundle-size one.
 *
 * ## Why a barrel rather than per-file imports
 *
 * The call sites read `turf.distance(...)`, 246 of them across 9 files. Keeping
 * the namespace means adding a dependency is a **visible one-line decision in a
 * file that exists to record it**, instead of an import buried in whichever
 * module happened to need it. That is the property that stopped this from being
 * noticed for 19 releases.
 *
 * ## Adding a function
 *
 * Add the named re-export below and the matching `@turf/*` package to
 * `dependencies` — never `@turf/turf`. Then re-check the tree:
 *
 * ```bash
 * npm sbom --sbom-format cyclonedx --omit dev \
 *   | node -e "…" # confirm no AGPL/unknown licenses appear
 * ```
 */

export {along} from '@turf/along';
export {bearing} from '@turf/bearing';
export {booleanPointInPolygon} from '@turf/boolean-point-in-polygon';
export {centroid} from '@turf/centroid';
export {circle} from '@turf/circle';
export {clone} from '@turf/clone';
export {destination} from '@turf/destination';
export {distance} from '@turf/distance';
export {getCoord, getCoords} from '@turf/invariant';
export {length} from '@turf/length';
export {lineArc} from '@turf/line-arc';
export {lineOffset} from '@turf/line-offset';
export {lineSliceAlong} from '@turf/line-slice-along';
export {coordEach} from '@turf/meta';
export {midpoint} from '@turf/midpoint';
export {pointOnFeature} from '@turf/point-on-feature';
export {pointToLineDistance} from '@turf/point-to-line-distance';
export {transformRotate} from '@turf/transform-rotate';
export {transformScale} from '@turf/transform-scale';
export {transformTranslate} from '@turf/transform-translate';

/** Constructors and the geometry union, all from `@turf/helpers`. */
export {lineString, multiLineString, point, polygon} from '@turf/helpers';
export type {AllGeoJSON} from '@turf/helpers';

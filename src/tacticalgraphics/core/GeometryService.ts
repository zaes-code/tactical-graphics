/**
 * `geometryService` — the map-agnostic geometry toolkit every graphic
 * generator in `graphics/*.ts` draws on: turf wrappers plus custom arrow,
 * arc, toothed-shape, and label math.
 *
 * This file is a thin barrel over `geometry/*.ts`, where the actual code
 * lives, split by concern:
 *   - `geometry/primitives.ts`          — bearings, projections, ring/point math
 *   - `geometry/arcs.ts`                — arcs, radial fans
 *   - `geometry/arrows.ts`              — arrowheads and arrow bodies
 *   - `geometry/wavesBendsDashes.ts`    — waves, bends, S-curves, dashes, zigzags
 *   - `geometry/toothedShapes.ts`       — crenellated/toothed lines & polygons
 *   - `geometry/labels.ts`              — polygon outline label gaps
 *   - `geometry/missionTaskGraphics.ts` — attack-by-fire/support-by-fire/etc.
 *
 * Kept as a single merged object (not a class) so every existing call site —
 * `geometryService.foo(...)`, across ~40 files — keeps working unchanged.
 *
 * **Inside `src/tacticalgraphics/`, prefer importing directly from the relevant
 * `geometry/*.ts` module in new code**; reach for this barrel only when you are
 * already touching a call site that uses it. The advice stops at the library's
 * edge: the modules are not exported from `index.ts`, so a consumer has only
 * this object, and a deep import from the sample app is what `check:layering`
 * exists to refuse.
 */
import * as primitives from './geometry/primitives';
import * as arcs from './geometry/arcs';
import * as arrows from './geometry/arrows';
import * as wavesBendsDashes from './geometry/wavesBendsDashes';
import * as toothedShapes from './geometry/toothedShapes';
import * as labels from './geometry/labels';
import * as missionTaskGraphics from './geometry/missionTaskGraphics';

const geometryService = {
    ...primitives,
    ...arcs,
    ...arrows,
    ...wavesBendsDashes,
    ...toothedShapes,
    ...labels,
    ...missionTaskGraphics,
};

export default geometryService;

/**
 * # The amplifier bag, and the geometry inputs beside it — renderer-free
 *
 * Both types were declared inside OpenLayers-specific modules:
 * `GraphicLabels` in `utils/graphicLinkRegistry.ts`, which imports `ol` and two
 * controllers, and `GraphicGeometryState` in `openlayers/graphicProperties.ts`.
 * Neither type mentions a map library — they describe a graphic's *amplifiers* and
 * its *shape inputs*, which are symbology, not rendering.
 *
 * Where they lived stopped mattering only when a second renderer needed them.
 * `components/featurePropertiesSource.ts` is shared by both engines, and a
 * type-only import out of it still pulls the declaring file into the TypeScript
 * program — so the published MapLibre entry point compiled the whole OpenLayers
 * tree and the build's isolation assertion caught `ol` leaking into it. Erasure
 * does not help: `import type` is stripped from the *emit*, not from the program.
 *
 * Both original modules re-export these, so nothing else had to change.
 */

import type {GraphicLabels, TacticalGraphicProperties} from '@zaes/tactical-graphics';

/**
 * The amplifiers a user can put on a graphic — what the Feature Properties dialog
 * edits, and what the style and paint functions read back.
 *
 * Kept separate from `TacticalGraphicProperties` rather than aliased to it: that
 * is the *saved* bag, which also carries the graphic's name and its geometry
 * inputs, and a dialog that edited those by accident would resize the shape.
 */
// Re-exported from the map-agnostic half, where it now lives — a type describing a
// graphic's amplifiers is symbology, and the renderer-neutral symbol registry needs to
// name it. Every existing import of `GraphicLabels` from here still resolves.
export type {GraphicLabels};

/**
 * The geometry inputs a graphic carries — meters and degrees, the portable
 * description any renderer can rebuild from.
 *
 * A `Pick` of the saved bag rather than its own shape, so the two can never
 * disagree about what a `radius` is.
 */
export type GraphicGeometryState = Pick<
    TacticalGraphicProperties,
    'radius' | 'decorationSize' | 'width' | 'length' | 'rotation' | 'bend' | 'mirrored'
>;

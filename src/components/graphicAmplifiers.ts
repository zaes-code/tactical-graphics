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

import type {
    RangeFanConfig,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicProperties,
    TacticalGraphicStatus,
} from '@zaes/tactical-graphics';

/**
 * The amplifiers a user can put on a graphic — what the Feature Properties dialog
 * edits, and what the style and paint functions read back.
 *
 * Kept separate from `TacticalGraphicProperties` rather than aliased to it: that
 * is the *saved* bag, which also carries the graphic's name and its geometry
 * inputs, and a dialog that edited those by accident would resize the shape.
 */
export interface GraphicLabels {
    label: string;
    countryCode?: string;
    secondId?: string;
    secondCountryCode?: string;
    startDate?: string;
    endDate?: string;
    minAltitude?: string;
    maxAltitude?: string;
    /**
     * Full width in metres, edge to edge. The same field the geometry schema uses —
     * `TacticalGraphicProperties.width` — so the dialog edits the graphic's actual
     * width rather than a string mirror of it that has to be kept in step.
     */
    width?: number;
    eff?: string;
    grid?: string;
    weapon?: string;
    hostility?: TacticalGraphicHostility;
    echelon?: TacticalGraphicEchelon;
    direction?: RouteDirection;
    status?: TacticalGraphicStatus;
    confidence?: TacticalGraphicConfidence;
    rangeFan?: RangeFanConfig;
}

/**
 * The geometry inputs a graphic carries — metres and degrees, the portable
 * description any renderer can rebuild from.
 *
 * A `Pick` of the saved bag rather than its own shape, so the two can never
 * disagree about what a `radius` is.
 */
export type GraphicGeometryState = Pick<
    TacticalGraphicProperties,
    'radius' | 'decorationSize' | 'width' | 'rotation' | 'bend' | 'mirrored'
>;

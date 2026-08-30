import type {Feature} from 'ol';
import type {GraphicLabels} from '../components/graphicAmplifiers';
import type {LineGraphic} from '../components/openlayers/controllers/LineGraphicController';
import type {PolygonGraphic} from '../components/openlayers/controllers/PolygonGraphicController';
import {
    RouteDirection
} from '@zaes/tactical-graphics';
import {MissionTaskGraphic} from "../components/openlayers/controllers/MissionTaskController";

export interface LabelableGraphic {
    setLabel?(labels: GraphicLabels): void;

    setRouteDirection?(direction: RouteDirection): void;
}

/**
 * User-edited config for a weapon/sensor range fan. Only the two range fan
 * graphics consume this; everything else ignores it. Storing it on
 * GraphicLabels keeps it on the same edit/persist path as the other label
 * fields (dialog → setLabel → applyChanges).
 *
 * Defined in the map-agnostic core (it is part of the public
 * `properties.tacticalGraphic` schema) and re-exported here so existing
 * OpenLayers-side imports keep working.
 */
export type {RangeFanConfig} from '@zaes/tactical-graphics';

/**
 * **Moved to `components/graphicAmplifiers.ts`** and re-exported here, so this
 * module's surface is unchanged. It describes amplifiers, not feature links, and
 * leaving it in a file that imports `ol` made it unreachable from the MapLibre
 * half — see the note in that file.
 */
export type {GraphicLabels};

// `SecurityOperationGraphic` was an arm of this union until 2026-08-29: it held
// rotation/scale rather than size/rotation/updateGeom, because a security operation was a
// badge placed on one anchor. They are drawn two-point lines now and register as
// `LineGraphic` like every other one. @see SecurityOperation
export type GraphicObject = (LineGraphic | PolygonGraphic | MissionTaskGraphic) & LabelableGraphic;

// WeakMap: runtime live mapping (auto-GC)
const featureToGraphic = new WeakMap<Feature, GraphicObject>();

// Map: persistent registry keyed by symbolId
const symbolRegistry = new Map<string, GraphicObject>();

export const GraphicLinkRegistry = {
    /** Associate a feature and its parent graphic */
    register(feature: Feature, graphic: GraphicObject, symbolId: string) {
        featureToGraphic.set(feature, graphic);
        symbolRegistry.set(symbolId, graphic);
    },

    /**
     * (Re-)registers every feature of a graphic under `symbolId`.
     *
     * Controllers register in their constructors, which run before the manager assigns
     * a symbolId — so every graphic used to land in `symbolRegistry` under the empty
     * string, each one overwriting the last. The feature WeakMap saved it in practice,
     * because `getFromFeature` is what the dialog uses; `getFromSymbolId` was simply
     * always wrong. Call this again from `setSymbolId` once the real id is known.
     *
     * Clears the placeholder `''` entry so the map does not keep a stale graphic alive.
     */
    registerAll(features: Feature[], graphic: GraphicObject, symbolId: string) {
        features.forEach(feature => featureToGraphic.set(feature, graphic));
        if (!symbolId) return;
        if (symbolRegistry.get('') === graphic) symbolRegistry.delete('');
        symbolRegistry.set(symbolId, graphic);
    },

    /** Get a graphic from a live feature (preferred) */
    getFromFeature(feature: Feature): GraphicObject | undefined {
        return featureToGraphic.get(feature);
    },

    /** Fallback lookup by ID (for persistence or reload) */
    getFromSymbolId(symbolId: string): GraphicObject | undefined {
        return symbolRegistry.get(symbolId);
    },

    /** Optional: cleanup registry when symbol removed */
    unregister(symbolId: string) {
        symbolRegistry.delete(symbolId);
    },
};

import type {Feature} from 'ol';
import type {LineGraphic} from '../components/openlayers/controllers/LineGraphicController';
import type {PolygonGraphic} from '../components/openlayers/controllers/PolygonGraphicController';
import {
    RangeFanConfig,
    RouteDirection, TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicStatus
} from '@zaes-code/tactical-graphics';
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
export type {RangeFanConfig} from '@zaes-code/tactical-graphics';

export interface GraphicLabels {
    label: string;
    countryCode?: string;
    secondId?: string;
    secondCountryCode?: string;
    startDate?: string;
    endDate?: string;
    minAltitude?: string;
    maxAltitude?: string;
    width?: string;
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

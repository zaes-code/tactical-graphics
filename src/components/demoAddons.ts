import type React from 'react';
import type {TacticalGraphicsConfigOptions, EditMode} from '@zaes/tactical-graphics';
import type {MapEngineHandle} from './mapEngine';

/**
 * # Engines and tools the demo can borrow from outside this repo
 *
 * The demo's picker offers OpenLayers and MapLibre. A separately licensed add-on can add an
 * engine, or a tool panel that works on whatever the map is showing, **on a developer's machine
 * only**: `npm run start:addons` starts Vite in its `addons` mode, which loads the Vite plugins
 * listed in the untracked `demo-addons.local.json`. Each plugin names its entry module
 * (`demoAddonEntry`), and `@demo/addons` joins every entry's engines and tools.
 * Everywhere else, including every build and so the public sample, `@demo/addons` is
 * `demoAddonsNone.ts` and the list is empty. `vite.config.mts` refuses to build in `addons`
 * mode at all, so an add-on cannot reach a deployable bundle.
 *
 * Nothing about any particular add-on belongs in this repo: it is MIT, and an add-on's own
 * code, its name included, stays in the add-on.
 */

/** What an add-on engine's view is given, the same as the built-in views. */
export interface DemoEngineViewProps {
    darkMode: boolean;
    graphicsSettings: TacticalGraphicsConfigOptions;
    onReady(handle: MapEngineHandle | null): void;
    /** A mode the engine chose, such as back to view when a draw ends. */
    onInteractionModeChange(mode: EditMode): void;
}

export interface DemoAddonEngine {
    /** Stored in localStorage as the chosen engine, so keep it stable. */
    id: string;
    /** The picker's label. */
    label: string;
    /** Loaded lazily is best: the picker should not pull an engine in until it is chosen. */
    View: React.ComponentType<DemoEngineViewProps>;
}

/** What an add-on tool's panel is given: the live map, whichever engine it is. */
export interface DemoToolProps {
    /** `null` while an engine is being swapped. */
    engine: MapEngineHandle | null;
    darkMode: boolean;
}

/**
 * A panel an add-on puts beside the controls: something done *to* the graphics on the map,
 * whichever engine is showing them, rather than another way of showing them. It reaches the
 * graphics through the same handle the controls use (`snapshot`, `restore` and the rest).
 */
export interface DemoAddonTool {
    id: string;
    label: string;
    Panel: React.ComponentType<DemoToolProps>;
}

/**
 * What an add-on's entry module exports; either list may be absent. In `addons` mode
 * `vite.config.mts` gathers the entries every listed plugin names and concatenates them.
 */
export interface DemoAddonModule {
    demoAddons?: readonly DemoAddonEngine[];
    demoTools?: readonly DemoAddonTool[];
}

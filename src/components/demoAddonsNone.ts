import type {DemoAddonEngine, DemoAddonTool} from './demoAddons';

/**
 * What `@demo/addons` is everywhere but a developer's `npm run start:addons`: no add-on
 * engines and no add-on tools. @see demoAddons.ts
 */
export const demoAddons: readonly DemoAddonEngine[] = [];
export const demoTools: readonly DemoAddonTool[] = [];

/**
 * # No holder may publish a feature that carries geometry and no style
 *
 * **An unstyled OpenLayers feature is not an invisible one.** With no style set, `ol` falls
 * back to its library default — a 5 px circle, white at 40% inside a `#3399CC` stroke — and
 * draws it at every coordinate of whatever geometry the feature holds. Nothing throws and
 * nothing logs; a small hollow blue dot simply appears on the map, outside edit mode, in
 * every screenshot, and it looks enough like a handle to be reported as one.
 *
 * That is exactly what happened on 2026-09-06. `RetrogradeTask` never styled its label
 * feature, which cost nothing while the feature held no geometry — and then 344000 pursuit
 * moved onto that holder and needed its "P" drawn, so the geometry was filled in for every
 * graphic the holder serves. The seven cane arrows have no label paint, so seven symbols
 * grew a stray dot. (User's report: "I'm seeing a small hollow blue handle at the end of all
 * the cane graphics while NOT on edit mode".)
 *
 * The rule this pins is the general one, over every registered graphic rather than the
 * holder that happened to break it: **if a feature has geometry, it has a style** — even if
 * that style is an explicit "draw nothing".
 */
import {listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {applyBaseGeometry} from './sampleGallery';

const RESOLUTION = 1200;
const CX = 500_000;
const CY = 2_000_000;

/** Built the way the sample sweep builds one, which is the path that fills in geometry. */
function build(name: TacticalGraphicName) {
    const handler = getController(name, RESOLUTION);
    handler.setSymbolId(`id-${name}`);
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', `id-${name}`);
    });
    applyBaseGeometry(handler, name, CX, CY, `id-${name}`);
    return handler;
}

describe('every published feature that has geometry has a style', () => {
    it('over every registered graphic', () => {
        const stray: string[] = [];

        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            let handler;
            try {
                handler = build(name);
            } catch (error) {
                // A holder that cannot build from a synthesised base is a different defect,
                // and `fullRoundTrip` is where it is caught. Not silently passed over: it is
                // reported, so this suite cannot go quiet by failing early.
                stray.push(`${name} did not build: ${(error as Error).message}`);
                continue;
            }

            for (const feature of handler.getFeatures()) {
                const geometry = feature.getGeometry();
                if (!geometry) continue;
                // An empty geometry draws nothing whatever its style, so it is not a risk.
                const coordinates = (geometry as unknown as {getCoordinates?: () => unknown}).getCoordinates?.();
                if (Array.isArray(coordinates) && coordinates.length === 0) continue;
                if (!feature.getStyle()) {
                    stray.push(`${name} · role=${feature.get('role')} · ${geometry.getType()}`);
                }
            }
        }

        expect(stray).toEqual([]);
    });
});

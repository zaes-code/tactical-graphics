/**
 * # Every symbol the changelog announces is reachable from the barrel
 *
 * `affiliationColorOf` shipped in 4.1.0's notes under **Added** and was not on the barrel.
 * The function existed and its own module exported it, so it typechecked, grepped fine and
 * worked internally — it simply could not be imported. The notes described a symbol nobody
 * could reach, and only a smoke test against the *published tarball* found it.
 *
 * The release checklist has carried the rule since 1.6.0 — *assert every release-note
 * symbol against `dist/`, not the source* — and the reason it keeps needing saying is that
 * source and barrel disagree silently. Nothing in TypeScript objects to a function that is
 * exported from a module and never re-exported.
 *
 * **Asserted against the barrel module, not against a list of files.** A name is public
 * here or it is not public, and that is the only question this file asks.
 */
import * as api from './index';

/**
 * Names this repository has announced as public and must keep.
 *
 * Add to this when a release note claims a new export. It is deliberately not generated
 * from anything: a list derived from the barrel would agree with the barrel by
 * construction and could never catch an omission.
 */
const ANNOUNCED = [
    // 4.1.0 — the obstacle colour rule
    'OBSTACLE_GRAPHICS',
    'drawsAsObstacle',
    'affiliationColorOf',
    'getObstacleColor',
    'FORTIFIED_MERLON_PX',
    'FORTIFIED_CRENEL_PX',
    'FORTIFIED_HEIGHT_PX',
    'FORTIFIED_MIN_PX',
    'castellatedPath',
    'crenellatedPath',
    // long-standing, spot-checked so a barrel rewrite cannot quietly drop them
    'renderTacticalGraphic',
    'configureTacticalGraphics',
    'DEFAULT_PALETTE',
    'listTacticalGraphicNames',
    'TacticalGraphicName',
] as const;

describe('the public surface', () => {
    it.each(ANNOUNCED)('exports %s', name => {
        expect(api).toHaveProperty(name);
        expect((api as Record<string, unknown>)[name]).toBeDefined();
    });

    it('exports affiliationColorOf as a working function, not merely a name', () => {
        // The 4.1.0 omission would have been caught by the property check alone, but a
        // name that resolves to undefined is the other half of the same failure.
        const feature = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]},
            properties: {name: api.TacticalGraphicName.ObstacleZone},
        };
        const affiliation = api.affiliationColorOf(feature as never);
        expect(typeof affiliation).toBe('string');
        // …and it is genuinely the affiliation colour, not the obstacle green, which is the
        // whole reason it is a separate function.
        expect(affiliation).not.toBe(api.getObstacleColor());
    });
});

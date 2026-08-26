import Feature from 'ol/Feature';
import {LineString, MultiPoint, Point} from 'ol/geom';
import Style from 'ol/style/Style';
import {readGraphicLabels, TACTICAL_GRAPHIC_KEY, writeGraphicProperties} from './graphicProperties';
import {
    listTacticalGraphicNames,
    RouteDirection,
    TacticalGraphicName,
    TacticalGraphicStatus,
    configureTacticalGraphics,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
import {coordinatedFireLineStyle, defaultLineStyle, getAreaLabelStylesFn, obstacleLineStyle, phaseLineStyleFunc, routeControlMeasureStyle} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import type {GraphicLabels} from '../../utils/graphicLinkRegistry';

/** A 3857 line long enough that the style functions emit their labels. */
const lineFeature = () => new Feature(new LineString([[0, 0], [10000, 0], [20000, 0]]));

/** Collects every rendered text string out of a style result. */
const texts = (result: Style | Style[] | void): string[] => {
    const styles = Array.isArray(result) ? result : result ? [result] : [];
    return styles.map(s => s.getText()?.getText()).filter((t): t is string => typeof t === 'string');
};

describe('readGraphicLabels', () => {
    it('returns the stamped amplifiers', () => {
        const f = lineFeature();
        writeGraphicProperties([f], TacticalGraphicName.PhaseLine, {label: 'ALPHA', secondId: 'BRAVO'});
        expect(readGraphicLabels(f).label).toBe('ALPHA');
        expect(readGraphicLabels(f).secondId).toBe('BRAVO');
    });

    it('defaults to blank amplifiers on an unstamped feature', () => {
        expect(readGraphicLabels(lineFeature())).toEqual({label: ''});
    });

    it('never returns undefined, so style functions need no null check', () => {
        expect(readGraphicLabels(new Feature())).toBeDefined();
    });

    it('does not let a caller mutate the shared default', () => {
        const labels = readGraphicLabels(new Feature());
        expect(() => {
            (labels as {label: string}).label = 'MUTATED';
        }).toThrow();
        expect(readGraphicLabels(new Feature()).label).toBe('');
    });
});

describe('writeGraphicProperties', () => {
    it('stamps the graphic name alongside the amplifiers', () => {
        const f = lineFeature();
        writeGraphicProperties([f], TacticalGraphicName.CoordinatedFireLine, {label: 'X'});
        expect(f.get(TACTICAL_GRAPHIC_KEY)).toEqual({name: TacticalGraphicName.CoordinatedFireLine, label: 'X'});
    });

    it('stamps every feature it is given', () => {
        const [a, b, c] = [lineFeature(), lineFeature(), lineFeature()];
        writeGraphicProperties([a, b, c], TacticalGraphicName.PhaseLine, {label: 'Y'});
        for (const f of [a, b, c]) expect(readGraphicLabels(f).label).toBe('Y');
    });

    it('tolerates undefined features (optional offset handles)', () => {
        expect(() => writeGraphicProperties([undefined], TacticalGraphicName.PhaseLine, {label: 'Z'})).not.toThrow();
    });

    it('fires a change event so OpenLayers re-renders', () => {
        const f = lineFeature();
        const onChange = jest.fn();
        f.on('change', onChange);
        writeGraphicProperties([f], TacticalGraphicName.PhaseLine, {label: 'Q'});
        expect(onChange).toHaveBeenCalled();
    });
});

// The migration's whole point: a style function derives its label from the
// feature, with no graphic-holder instance and no closure argument in sight.
describe('style functions read amplifiers off the feature', () => {
    it('phaseLineStyleFunc renders the doctrinal prefix plus the user label', () => {
        const f = lineFeature();
        writeGraphicProperties([f], TacticalGraphicName.PhaseLine, {label: 'ALPHA'});
        expect(texts(phaseLineStyleFunc(TacticalGraphicName.PhaseLine)(f, 10))).toContain('PL ALPHA');
    });

    it('re-stamping the feature changes what the same style function renders', () => {
        const f = lineFeature();
        const style = phaseLineStyleFunc(TacticalGraphicName.PhaseLine);

        writeGraphicProperties([f], TacticalGraphicName.PhaseLine, {label: 'ALPHA'});
        expect(texts(style(f, 10))).toContain('PL ALPHA');

        writeGraphicProperties([f], TacticalGraphicName.PhaseLine, {label: 'BRAVO'});
        expect(texts(style(f, 10))).toContain('PL BRAVO');
    });

    it('coordinatedFireLineStyle picks up the label', () => {
        const f = lineFeature();
        writeGraphicProperties([f], TacticalGraphicName.CoordinatedFireLine, {label: 'CFL1'});
        expect(texts(coordinatedFireLineStyle(TacticalGraphicName.CoordinatedFireLine)(f, 10)).join(' ')).toContain('CFL1');
    });

    it('an unstamped feature still styles, with a blank user label', () => {
        expect(() => defaultLineStyle(TacticalGraphicName.PhaseLine)(lineFeature(), 10)).not.toThrow();
    });

    it('reads status, not just text — planned graphics dash their stroke', () => {
        const present = lineFeature();
        const planned = lineFeature();
        writeGraphicProperties([present], TacticalGraphicName.PhaseLine, {label: 'P', status: TacticalGraphicStatus.present});
        writeGraphicProperties([planned], TacticalGraphicName.PhaseLine, {label: 'P', status: TacticalGraphicStatus.planned});

        const dashOf = (f: Feature) => {
            const result = defaultLineStyle(TacticalGraphicName.PhaseLine)(f, 10);
            const styles = Array.isArray(result) ? result : [result];
            return styles.map(s => s?.getStroke()?.getLineDash()).find(d => d != null);
        };
        expect(dashOf(present)).toBeUndefined();
        expect(dashOf(planned)).toBeDefined();
    });
});

/**
 * The traffic arrows are decoration on the route, so they must stay thinner than
 * the line they decorate — at every width a host can configure.
 *
 * They were a fixed 2px, which was only correct while the route was itself always
 * 4. Once `lineWidth` became a host setting (1-8), `lineWidth: 1` rendered a
 * "thinner" decoration *thicker* than its route: the comment's intent inverted
 * without the constant changing. Nothing failed loudly, which is why this is a
 * test rather than a code comment.
 */
describe('route traffic arrows scale with the configured line width', () => {
    afterEach(resetTacticalGraphicsConfig);

    /** A 3857 route long enough for the endpoint figures to be emitted. */
    const routeFeature = () => {
        const f = new Feature(new MultiPoint([[0, 0], [40000, 0]]));
        writeGraphicProperties([f], TacticalGraphicName.Route, {
            label: 'MSR1',
            direction: RouteDirection.TWO_WAY,
        });
        return f;
    };

    /** Every stroke width the style function resolves, widest first. */
    const strokeWidths = (result: Style | Style[] | void): number[] => {
        const styles = Array.isArray(result) ? result : result ? [result] : [];
        return styles
            .map(s => s.getStroke()?.getWidth())
            .filter((w): w is number => typeof w === 'number')
            .sort((a, b) => b - a);
    };

    it.each([1, 2, 4, 8])('at lineWidth %i the arrow is never thicker than the route', lineWidth => {
        configureTacticalGraphics({lineWidth});
        const widths = strokeWidths(routeControlMeasureStyle(TacticalGraphicName.Route)(routeFeature(), 10));

        expect(widths.length).toBeGreaterThan(1);
        const route = widths[0];
        const arrow = widths[widths.length - 1];
        expect(route).toBe(lineWidth);
        expect(arrow).toBeLessThanOrEqual(route);
        expect(arrow).toBe(Math.max(1, lineWidth / 2));
    });

    it('pins the concrete widths at the shipped default', () => {
        // Literals on purpose: reading DEFAULT_LINE_WIDTH here would make the
        // assertion tautological, and the point is that changing the shipped
        // default has to be a deliberate act with a visible diff. Was 4/2 until
        // the default came down to 2 on 2026-08-04.
        const widths = strokeWidths(routeControlMeasureStyle(TacticalGraphicName.Route)(routeFeature(), 10));
        expect(widths[0]).toBe(2);
        expect(widths[widths.length - 1]).toBe(1);
    });

    it('never floors the arrow to nothing', () => {
        configureTacticalGraphics({lineWidth: 1});
        const widths = strokeWidths(routeControlMeasureStyle(TacticalGraphicName.Route)(routeFeature(), 10));
        expect(widths[widths.length - 1]).toBeGreaterThanOrEqual(1);
    });
});

/**
 * The obstacle free and restricted areas carry a stacked amplifier block inside their
 * toothed ring: the free area's literal "FREE" over the designation over the two DTGs,
 * joined by a hyphen. Both took a name and nothing else before — the dialog offered no
 * date inputs, so the two DTGs the plate shows could not be entered at all.
 */
describe('obstacle area amplifiers', () => {
    const areaFeature = () => new Feature(new Point([0, 0]));

    const block = (name: TacticalGraphicName, labels: Partial<GraphicLabels>) => {
        const f = areaFeature();
        writeGraphicProperties([f], name, {label: '', ...labels});
        return texts(getAreaLabelStylesFn(name)(f, 10))[0] ?? '';
    };

    it('offers the name and both DTGs on each', () => {
        for (const name of [TacticalGraphicName.ObstacleFreeArea, TacticalGraphicName.ObstacleRestrictedArea]) {
            const fields = getGraphicFields(name);
            expect(fields.identifier1).toBe(true);
            expect(fields.dtg1).toBe(true);
            expect(fields.dtg2).toBe(true);
        }
    });

    it('stacks FREE over the name over the dates, in that order', () => {
        const text = block(TacticalGraphicName.ObstacleFreeArea, {
            label: 'T-1', startDate: '021200ZJUN26', endDate: '021800ZJUN26',
        });
        expect(text.split('\n')).toEqual(['FREE', 'T-1', '021200ZJUN26 - 021800ZJUN26']);
    });

    it('keeps FREE when nothing has been filled in — it is part of the symbol', () => {
        expect(block(TacticalGraphicName.ObstacleFreeArea, {})).toBe('FREE');
    });

    it('gives the restricted area the same block without the literal', () => {
        const text = block(TacticalGraphicName.ObstacleRestrictedArea, {
            label: 'T-2', startDate: '021200ZJUN26', endDate: '021800ZJUN26',
        });
        expect(text.split('\n')).toEqual(['T-2', '021200ZJUN26 - 021800ZJUN26']);
    });

    it('renders nothing for a restricted area with no amplifiers', () => {
        expect(texts(getAreaLabelStylesFn(TacticalGraphicName.ObstacleRestrictedArea)(areaFeature(), 10))).toEqual([]);
    });

    it('drops the hyphen when only one DTG is set', () => {
        expect(block(TacticalGraphicName.ObstacleFreeArea, {label: 'T-1', startDate: '021200ZJUN26'}))
            .toBe('FREE\nT-1\n021200ZJUN26');
        expect(block(TacticalGraphicName.ObstacleFreeArea, {label: 'T-1', endDate: '021800ZJUN26'}))
            .toBe('FREE\nT-1\n021800ZJUN26');
    });

    it('omits the name line rather than leaving a blank one', () => {
        expect(block(TacticalGraphicName.ObstacleFreeArea, {startDate: '021200ZJUN26'}))
            .toBe('FREE\n021200ZJUN26');
    });
});

describe('decision line fields', () => {
    // The paint still joins `T/AS` with a slash when both are set — 110500's Example
    // renders `1X/007` — but the dialog offers only the designation. The second half is
    // not a field this program's operators fill in. (User's call, 2026-08-25.)
    it('offers the designation alone', () => {
        const fields = getGraphicFields(TacticalGraphicName.DecisionLine);
        expect(fields.identifier1).toBe(true);
        expect(fields.identifier2).toBe(false);
        expect(fields.dtg1).toBe(false);
        expect(fields.dtg2).toBe(false);
        expect(fields.status).toBe(false);
    });
});

describe('line, generic fields', () => {
    // APP-06 110400's Template sets **T** above each end of the line and **W - W1** below
    // each. `defaultLinePaint` has always drawn both; the dialog offered only the name, so
    // the dates could be rendered but never entered.
    it('offers the designation and both DTGs, and no status', () => {
        const fields = getGraphicFields(TacticalGraphicName.LineGeneric);
        expect(fields.identifier1).toBe(true);
        expect(fields.dtg1).toBe(true);
        expect(fields.dtg2).toBe(true);
        expect(fields.status).toBe(false);
    });

    it('leaves the other plain lines as they were', () => {
        // The profile it used to share is still in use — this was one graphic's fields,
        // not the family's.
        for (const name of [TacticalGraphicName.ForwardEdgeOfBattleArea, TacticalGraphicName.ReleaseLine]) {
            const fields = getGraphicFields(name);
            expect(fields.dtg1).toBe(false);
            expect(fields.status).toBe(true);
        }
    });
});

describe('obstacle line fields', () => {
    it('offers the identifier but not status', () => {
        // The style function never reads status — there is no planned form of this
        // graphic to dash — so the control would have changed nothing on the map.
        const fields = getGraphicFields(TacticalGraphicName.ObstacleLine);
        expect(fields.identifier1).toBe(true);
        expect(fields.status).toBe(false);
    });

    it('renders identically whether or not a status is stamped', () => {
        const withStatus = new Feature(new LineString([[0, 0], [10000, 0]]));
        const without = new Feature(new LineString([[0, 0], [10000, 0]]));
        writeGraphicProperties([withStatus], TacticalGraphicName.ObstacleLine,
            {label: 'OBS-1', status: TacticalGraphicStatus.planned});
        writeGraphicProperties([without], TacticalGraphicName.ObstacleLine, {label: 'OBS-1'});

        const dashes = (f: Feature) => (obstacleLineStyle(TacticalGraphicName.ObstacleLine)(f, 10) as Style[])
            .map(s => JSON.stringify(s.getStroke()?.getLineDash() ?? null));

        expect(dashes(withStatus)).toEqual(dashes(without));
    });
});

describe('the sector-modifier fields, and where the Remarks column allows them', () => {
    const TERRAIN_PAIR = [
        TacticalGraphicName.RestrictedTerrain,
        TacticalGraphicName.SeverelyRestrictedTerrain,
    ];

    it.each(TERRAIN_PAIR.map(n => [String(n), n] as const))(
        '%s offers both sectors and field H, and nothing else',
        (_label, name) => {
            const fields = getGraphicFields(name);
            expect(fields.mobility).toBe(true);
            expect(fields.terrain).toBe(true);
            expect(fields.additionalInfo).toBe(true);
            // The Template has no box for any of these — and the pair describe ground,
            // so there is no side to be identified with.
            expect(fields.identifier1).toBe(false);
            expect(fields.hostility).toBe(false);
            expect(fields.status).toBe(false);
            expect(fields.dtg1).toBe(false);
            expect(fields.dtg2).toBe(false);
        },
    );

    it('gives the limited access area Sector 1, field H and the FM date-time group', () => {
        const fields = getGraphicFields(TacticalGraphicName.LimitedAccessArea);
        expect(fields.mobility).toBe(true);
        expect(fields.additionalInfo).toBe(true);
        // FM 1-02.2 table 5-5 sets W - W1 where APP-06 sets H; the graphic carries both.
        expect(fields.dtg1).toBe(true);
        expect(fields.dtg2).toBe(true);
        // No Sector 2 box on this Template, and the `LAA` above the icon is the symbol's
        // own literal rather than a designation the user types.
        expect(fields.terrain).toBe(false);
        expect(fields.identifier1).toBe(false);
    });

    it('keeps each category of Table 8-24 off the graphics the other one owns', () => {
        // MOBILITY is remarked "for use with Limited Access Area, Restricted Terrain and
        // Severely Restricted Terrain only"; MINE TYPE "used with minefields & mined
        // areas only". Neither graphic may offer the other's selector.
        for (const name of [...TERRAIN_PAIR, TacticalGraphicName.LimitedAccessArea]) {
            expect(getGraphicFields(name).mineType).toBe(false);
        }
        for (const name of [TacticalGraphicName.MinefieldDynamicDepiction, TacticalGraphicName.MinedAreaFenced]) {
            const fields = getGraphicFields(name);
            expect(fields.mineType).toBe(true);
            expect(fields.mobility).toBe(false);
            expect(fields.terrain).toBe(false);
        }
    });

    it('offers Sector 1 on exactly the three graphics the Remarks column names', () => {
        const offered = (listTacticalGraphicNames() as TacticalGraphicName[])
            .filter(n => String(n) !== 'AxisOfAttack')
            .filter(n => getGraphicFields(n).mobility);
        expect(offered.sort()).toEqual([
            TacticalGraphicName.LimitedAccessArea,
            TacticalGraphicName.RestrictedTerrain,
            TacticalGraphicName.SeverelyRestrictedTerrain,
        ].sort());
    });
});

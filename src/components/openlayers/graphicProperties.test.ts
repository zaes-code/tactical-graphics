import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import Style from 'ol/style/Style';
import {readGraphicLabels, TACTICAL_GRAPHIC_KEY, writeGraphicProperties} from './graphicProperties';
import {TacticalGraphicName, TacticalGraphicStatus} from '@zaes/tactical-graphics';
import {coordinatedFireLineStyle, defaultLineStyle, phaseLineStyleFunc} from './openlayerStyles';

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

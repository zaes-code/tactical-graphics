/**
 * The inlined icons must stay byte-identical to the `.svg` files they were
 * copied from — otherwise editing an arrow updates the file nobody renders and
 * leaves the published package showing the old shape.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

import {ALTERNATING_ARROW, ONE_WAY_ARROW, TWO_WAY_ARROW} from './routeDirectionIcons';

const PREFIX = 'data:image/svg+xml,';
const decode = (uri: string) => decodeURIComponent(uri.slice(PREFIX.length));
const file = (name: string) => readFileSync(join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');

describe('route direction icons', () => {
    it.each([
        ['route_direction_one_way.svg', ONE_WAY_ARROW],
        ['route_direction_alternating.svg', ALTERNATING_ARROW],
        ['route_direction_two_way.svg', TWO_WAY_ARROW],
    ])('%s matches its inlined copy', (name, uri) => {
        expect(uri.startsWith(PREFIX)).toBe(true);
        expect(decode(uri)).toBe(file(name));
    });

    it('encodes characters that would break a data URI', () => {
        // '#' would otherwise terminate the URI at the fill color.
        expect(ONE_WAY_ARROW).not.toContain('#');
        expect(decode(ONE_WAY_ARROW)).toContain('fill="#1f1f1f"');
    });
});

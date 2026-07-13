// Turf v7 and its transitive deps ship ESM. Jest 27 resolves them to the ESM
// build, and CRA excludes node_modules from Babel, so they arrive untransformed
// ("Cannot use import statement outside a module"). Allow-list them.
const ESM_DEPS = [
    'ol',
    'ol-ext',
    'color-space',
    'color-rgba',
    'color-parse',
    'geotiff',
    'quick-lru',
    'lerc',
    'pako',
    'xml-utils',
    'zstddec',
    '@petamoriken',
    'web-worker',
    'parse-headers',
    'quickselect',
    'rbush',
    'pbf',
    'kdbush',
    'geojson-vt',
    '@turf',
    '@placemarkio',
    'polyclip-ts', // turf v7's boolean-op engine — type:module, no CJS build
    'splaytree-ts', // polyclip-ts dep, also ESM-only
    'robust-predicates',
    'skmeans',
    'concaveman',
    'rbush',
    'quickselect',
    'tinyqueue',
    'point-in-polygon-hao',
    'topojson-client',
    'topojson-server',
    'delaunator',
    'earcut',
    'd3-[a-z-]+',
];

const path = require('path');

// The sample app imports the library by its published name so it exercises the
// same entry point a consumer gets. TypeScript resolves this via `paths` in
// tsconfig.json; webpack and Jest need their own mapping. Keep all three in sync.
const LIBRARY_ENTRY = path.resolve(__dirname, 'src/tacticalgraphics/index.ts');
const LIBRARY_NAME = '@zaes-code/tactical-graphics';

module.exports = {
    webpack: {
        alias: {
            [LIBRARY_NAME]: LIBRARY_ENTRY,
        },
    },
    jest: {
        configure: jestConfig => {
            jestConfig.moduleNameMapper = {
                ...jestConfig.moduleNameMapper,
                [`^${LIBRARY_NAME.replace('/', '\\/')}$`]: LIBRARY_ENTRY,
            };
            jestConfig.transformIgnorePatterns = [
                `node_modules[\\\\/](?!(${ESM_DEPS.join('|')})[\\\\/])`,
                '^.+\\.module\\.(css|sass|scss)$',
            ];
            return jestConfig;
        },
    },
};

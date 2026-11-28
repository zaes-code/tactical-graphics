import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {defineConfig, type DefaultTheme} from 'vitepress';

/**
 * The documentation site: hand-written guides, and an API reference TypeDoc generates into
 * `api/` from the source's own doc comments (`npm run docs:api`, which `docs:build` runs first).
 *
 * `DOCS_BASE` is the path the site is served under, `/` by default. Set it to wherever the
 * built folder is uploaded, such as `/docs/tactical-graphics/`.
 */
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
const sidebarFile = fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
const apiSidebar: DefaultTheme.SidebarItem[] = existsSync(sidebarFile) ? JSON.parse(readFileSync(sidebarFile, 'utf8')) : [];

const guide: DefaultTheme.SidebarItem[] = [
    {
        text: 'Guide',
        items: [
            {text: 'Introduction', link: '/guide/introduction'},
            {text: 'Getting started', link: '/guide/getting-started'},
            {text: 'The tacticalGraphic object', link: '/guide/tactical-graphic-object'},
            {text: 'Rendering', link: '/guide/rendering'},
            {text: 'Colors and sizes', link: '/guide/colors-and-sizes'},
            {text: 'Saving and restoring', link: '/guide/saving-and-restoring'},
            {text: 'The center symbol', link: '/guide/center-symbol'},
            {text: 'Advanced', link: '/guide/advanced'},
            {text: 'Errors', link: '/guide/errors'},
            {text: 'Coordinate systems', link: '/guide/coordinate-systems'},
        ],
    },
    {
        text: 'Reference',
        items: [
            {text: 'Graphics', link: '/guide/graphics'},
            {text: 'API', link: '/api/'},
        ],
    },
    {
        text: 'Project',
        items: [
            {text: 'Contributing', link: '/contributing'},
            {text: 'About', link: '/about'},
        ],
    },
];

export default defineConfig({
    title: 'Tactical Graphics',
    description: pkg.description,
    base: process.env.DOCS_BASE ?? '/',
    // A preview build (`DOCS_PREVIEW=1`): plain pages with no client scripts, into a separate
    // folder, for hosts that take a limited number of files. It has no search.
    ...(process.env.DOCS_PREVIEW ? {mpa: true, outDir: '.vitepress/preview'} : {}),
    // Its pages have no app to open the sidebar on a phone, so a few lines do that one job.
    head: [
        ['meta', {name: 'theme-color', content: '#1f7a3a'}],
        ...(process.env.DOCS_PREVIEW
            ? [
                  [
                      'script',
                      {},
                      "document.addEventListener('click',e=>{const b=e.target.closest('.VPLocalNav .menu,.VPNavBarHamburger');const s=document.querySelector('.VPSidebar');if(!s)return;if(b){s.classList.toggle('open');e.preventDefault();}else if(s.classList.contains('open')&&!e.target.closest('.VPSidebar'))s.classList.remove('open');});",
                  ] as [string, Record<string, string>, string],
              ]
            : []),
    ],
    lang: 'en-US',
    // Plain `.html` links: zaes.com is static files on Apache, with no rewrite for clean URLs.
    cleanUrls: false,
    lastUpdated: false,
    themeConfig: {
        nav: [
            {text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/'},
            {text: 'API', link: '/api/', activeMatch: '/api/'},
            {text: 'Live demo', link: 'https://zaes-code.github.io/tactical-graphics/'},
            {
                text: `v${pkg.version}`,
                items: [
                    {text: 'Changelog', link: 'https://github.com/zaes-code/tactical-graphics/blob/develop/CHANGELOG.md'},
                    {text: 'npm', link: 'https://www.npmjs.com/package/@zaes/tactical-graphics'},
                ],
            },
        ],
        sidebar: {
            '/api/': [{text: 'API reference', items: apiSidebar}, ...guide],
            '/': guide,
        },
        outline: {level: [2, 3]},
        search: {provider: 'local'},
        socialLinks: [{icon: 'github', link: 'https://github.com/zaes-code/tactical-graphics'}],
        footer: {message: 'Released under the MIT License.', copyright: 'Copyright © Zaes'},
    },
});

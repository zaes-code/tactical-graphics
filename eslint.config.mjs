import globals from 'globals';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
    {
        // Build output, not source. `eslint .` walked into `dist/` — 1,047 emitted files
        // including the `.d.ts` the library publishes — and crashed the unused-imports rule on
        // a declaration file. Nothing in here is authored, so nothing in here is lintable.
        // `.claude/` holds agent worktrees: eslint 8 skipped dot-folders on its own, flat
        // config does not. The JavaScript globs keep the lint to TypeScript, which is all
        // `--ext .ts,.tsx` ever covered; flat config walks `.js`/`.mjs`/`.cjs` by default.
        ignores: ['dist/', 'build/', 'node_modules/', 'coverage/', '.claude/', '**/*.{js,mjs,cjs,jsx}'],
    },
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.es2021,
                ...globals.browser,
                ...globals.node,
            },
        },
        linterOptions: {
            // eslint 8 left this off; keep it off so the migration changes no output.
            reportUnusedDisableDirectives: 'off',
        },
        plugins: {'unused-imports': unusedImports},
        rules: {
            // Remove unused imports automatically
            'unused-imports/no-unused-imports': 'error',

            // Warn on unused variables, but ignore ones starting with "_"
            'unused-imports/no-unused-vars': [
                'warn',
                {vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_'},
            ],
        },
    },
];

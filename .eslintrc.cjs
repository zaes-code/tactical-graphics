module.exports = {
    root: true,
    // Build output, not source. `eslint .` walked into `dist/` — 1,047 emitted files
    // including the `.d.ts` the library publishes — and crashed the unused-imports rule on
    // a declaration file. Nothing in here is authored, so nothing in here is lintable.
    ignorePatterns: ['dist/', 'build/', 'node_modules/', 'coverage/'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    env: {
        es2022: true,
        browser: true,
        node: true,
    },
    plugins: ['unused-imports'],
    rules: {
        // Remove unused imports automatically
        'unused-imports/no-unused-imports': 'error',

        // Warn on unused variables, but ignore ones starting with "_"
        'unused-imports/no-unused-vars': [
            'warn',
            {vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_'},
        ],
    },
};

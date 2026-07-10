module.exports = {
    root: true,
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

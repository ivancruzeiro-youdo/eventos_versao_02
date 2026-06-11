module.exports = {
  root: true,
  extends: [require.resolve('@youdo/config/eslint-preset')],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  ignorePatterns: ['.next/', 'node_modules/', 'next-env.d.ts'],
};

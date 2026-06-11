module.exports = {
  root: true,
  extends: [require.resolve('@youdo/config/eslint-preset')],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  ignorePatterns: ['dist/', 'node_modules/'],
};

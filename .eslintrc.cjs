/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    requireConfigFile: false,
    babelOptions: { plugins: ['@babel/plugin-syntax-jsx'] },
  },
  settings: { react: { version: '18.3' } },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  plugins: ['react', 'react-hooks'],
  rules: {
    // The borra-and-rewrites de Sheets is intentional; non-controlled props are the project's style.
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off', // Vite + React 17+ JSX runtime
    'react/no-unescaped-entities': 'off', // Project uses Spanish text with quotes in JSX literals
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    // Empty catch blocks (offline fallback, etc.) are intentional in this app.
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.js', 'apps-script/**'],
}

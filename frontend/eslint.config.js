import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // The app loads data with the standard "fetch in an effect, then
      // set state" pattern, which this React Compiler oriented rule
      // flags everywhere. It is a style suggestion, not a bug, so it
      // is a warning until the data loading moves to a query library.
      'react-hooks/set-state-in-effect': 'warn',
      // AuthContext exports the provider and its hook together on
      // purpose; splitting them only affects hot reload in development.
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.jest },
    },
  },
])

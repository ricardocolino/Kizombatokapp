/* eslint-disable @typescript-eslint/no-require-imports */
const globals = require("globals");
const pluginJs = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const pluginReact = require("eslint-plugin-react");
const pluginReactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");

module.exports = [
  {
    ignores: ["android/**", "dist/**", "node_modules/**"]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        ...globals.browser,
        ...globals.es2020
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off"
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  }
];

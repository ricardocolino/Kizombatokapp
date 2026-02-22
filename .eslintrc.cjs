const globals = require("globals");
const pluginJs = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const pluginReactConfig = require("eslint-plugin-react/configs/recommended.js");
const pluginReactHooks = require("eslint-plugin-react-hooks");
const reactRefresh = require("eslint-plugin-react-refresh");

module.exports = [
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
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
      "@typescript-eslint": tseslint.plugin,
      react: pluginReactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...pluginReactConfig.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true }
      ],
      "react/react-in-jsx-scope": "off" // Not needed for React 17+
    },
    settings: {
      react: {
        version: "detect"
      }
    }
  }
];

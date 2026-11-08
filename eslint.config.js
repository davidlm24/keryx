import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  { ignores: [".claude/**", "dist/**", "node_modules/**"] },
  {
    files: ["electron/**/*.cjs"],
    ...pluginJs.configs.recommended,
    languageOptions: { sourceType: "commonjs", ecmaVersion: 2022, globals: globals.node },
  },
  {
    // Runs in the Electron main process and in the pages.
    files: ["shared/**/*.mjs"],
    ...pluginJs.configs.recommended,
    languageOptions: { sourceType: "module", ecmaVersion: 2022, globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["scripts/**/*.mjs"],
    ...pluginJs.configs.recommended,
    languageOptions: { sourceType: "module", ecmaVersion: 2022, globals: globals.node },
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", ecmaVersion: 2022, globals: globals.node },
    rules: { "no-undef": "error" },
  },
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      "src/hooks/**/*.{js,mjs,cjs,jsx}",
      "src/utils/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      // Advisory only. The generated effects often omit deps deliberately and
      // some carry eslint-disable comments for this rule, which only parse when
      // the rule is registered here.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Undefined names are errors in all app code (a leftover setView(null)
    // threw at runtime in 0.2.17 and lint passed): the block above loses
    // @eslint/js's rules when React's config is spread over it, and src/lib,
    // src/api and the entry files had no rules at all.
    files: ["src/**/*.{js,mjs,cjs,jsx}"],
    ignores: ["src/components/ui/**/*"],
    languageOptions: {
      // 2025: import attributes (the JSON both main and pages read,
      // shared/outputNames.json, is imported `with { type: "json" }`).
      ecmaVersion: 2025,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react: pluginReact },
    // no-undef does not see JSX names (<Foo />); jsx-no-undef does.
    rules: { "no-undef": "error", "react/jsx-no-undef": "error" },
  },
  {
    // The tests run in node (npm test).
    files: ["src/**/*.test.{js,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];

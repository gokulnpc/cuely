import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "Qli Brand Kit & Wireframe/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
    },
  },
  {
    files: ["electron/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        URLSearchParams: "readonly",
        globalThis: "readonly",
      },
    },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "src/core must stay platform-agnostic.",
            },
          ],
          patterns: [
            {
              group: [
                "node:*",
                "src/main/**",
                "src/sources/native-source",
                "../main/**",
                "../sources/native-source",
                "../../main/**",
                "../../sources/native-source",
              ],
              message: "src/core must stay platform-agnostic.",
            },
          ],
        },
      ],
    },
  },
];

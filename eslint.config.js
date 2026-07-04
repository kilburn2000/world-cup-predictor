import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Flat config for the whole monorepo. Fast (non-type-checked) typescript-eslint
// rules so CI lint stays quick; the real type safety comes from `tsc --noEmit`.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "web/dist/**",
      "**/*.config.{js,ts}",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Web app (browser globals + React hooks rules)
    files: ["web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Server + shared (Node globals)
    files: ["server/src/**/*.ts", "shared/src/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Project-wide pragmatic rules: DB rows are typed `any`, and a few ESPN/DB
    // fetches intentionally swallow errors in an empty catch.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);

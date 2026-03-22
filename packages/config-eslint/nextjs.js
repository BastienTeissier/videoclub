import base from "./base.js";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        React: "readonly",
      },
    },
  },
];

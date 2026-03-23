import nextjs from "@repo/config-eslint/nextjs";
import boundaries from "@repo/config-eslint/boundaries";

/** @type {import("eslint").Linter.Config[]} */
export default [...nextjs, ...boundaries];

import "@testing-library/jest-dom/vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// vitest v4 moved Assertion into @vitest/expect; augment there so jest-dom
// matchers extend the type returned by expect().
declare module "@vitest/expect" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown> {}
}

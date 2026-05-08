import { describe, it, expect } from "vitest";
import { get, set } from "./json-pointer";

describe("json-pointer get", () => {
  it("returns nested value", () => {
    expect(get({ movies: [1, 2, 3] }, "/movies")).toEqual([1, 2, 3]);
  });

  it("returns root for empty path", () => {
    const root = { a: 1 };
    expect(get(root, "")).toBe(root);
  });

  it("returns undefined for missing path", () => {
    expect(get({}, "/missing/path")).toBeUndefined();
  });

  it("indexes arrays", () => {
    expect(get({ list: ["a", "b"] }, "/list/1")).toBe("b");
  });
});

describe("json-pointer set", () => {
  it("returns a new object; original unchanged", () => {
    const orig = { filters: { genres: ["A"] } };
    const next = set(orig, "/filters/genres", ["B"]) as typeof orig;
    expect(next.filters.genres).toEqual(["B"]);
    expect(orig.filters.genres).toEqual(["A"]);
    expect(next).not.toBe(orig);
    expect(next.filters).not.toBe(orig.filters);
  });

  it("creates missing intermediate keys", () => {
    expect(set({}, "/a/b/c", 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it("empty path replaces root", () => {
    expect(set({ a: 1 }, "", { b: 2 })).toEqual({ b: 2 });
  });

  it("set on undefined state initializes object", () => {
    expect(set(undefined, "/x", 1)).toEqual({ x: 1 });
  });
});

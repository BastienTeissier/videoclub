// JSON Pointer (RFC 6901) get/set, immutable.

function tokens(path: string): string[] {
  if (path === "") return [];
  if (!path.startsWith("/")) return [path];
  return path
    .slice(1)
    .split("/")
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function get(state: unknown, path: string): unknown {
  if (path === "") return state;
  let cur: unknown = state;
  for (const tok of tokens(path)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[tok];
      continue;
    }
    return undefined;
  }
  return cur;
}

export function set(state: unknown, path: string, value: unknown): unknown {
  if (path === "") return value;

  const toks = tokens(path);
  const root: Record<string, unknown> | unknown[] =
    state === null || state === undefined
      ? {}
      : Array.isArray(state)
        ? [...(state as unknown[])]
        : { ...(state as Record<string, unknown>) };

  let cur: Record<string, unknown> | unknown[] = root;

  for (let i = 0; i < toks.length - 1; i++) {
    const tok = toks[i]!;
    const isArrayIdx = Array.isArray(cur);

    let next = isArrayIdx
      ? (cur as unknown[])[Number(tok)]
      : (cur as Record<string, unknown>)[tok];

    const cloned: Record<string, unknown> | unknown[] =
      next === null || next === undefined || typeof next !== "object"
        ? {}
        : Array.isArray(next)
          ? [...(next as unknown[])]
          : { ...(next as Record<string, unknown>) };

    if (isArrayIdx) {
      (cur as unknown[])[Number(tok)] = cloned;
    } else {
      (cur as Record<string, unknown>)[tok] = cloned;
    }
    next = cloned;
    cur = cloned;
  }

  const last = toks[toks.length - 1]!;
  if (Array.isArray(cur)) {
    (cur as unknown[])[Number(last)] = value;
  } else {
    (cur as Record<string, unknown>)[last] = value;
  }

  return root;
}

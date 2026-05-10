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

type Container = Record<string, unknown> | unknown[];

function shallowClone(node: unknown): Container {
  if (node === null || node === undefined || typeof node !== "object") return {};
  if (Array.isArray(node)) return [...node];
  return { ...(node as Record<string, unknown>) };
}

function readChild(parent: Container, tok: string): unknown {
  return Array.isArray(parent)
    ? parent[Number(tok)]
    : parent[tok];
}

function writeChild(parent: Container, tok: string, value: unknown): void {
  if (Array.isArray(parent)) {
    parent[Number(tok)] = value;
  } else {
    parent[tok] = value;
  }
}

export function set(state: unknown, path: string, value: unknown): unknown {
  if (path === "") return value;

  const toks = tokens(path);
  const root = shallowClone(state);
  let cur: Container = root;

  for (let i = 0; i < toks.length - 1; i++) {
    const tok = toks[i]!;
    const cloned = shallowClone(readChild(cur, tok));
    writeChild(cur, tok, cloned);
    cur = cloned;
  }

  writeChild(cur, toks[toks.length - 1]!, value);
  return root;
}

import { createMiddleware } from "hono/factory";

export const devAuth = createMiddleware(async (c, next) => {
  c.set("userId", "dev-user-001");
  await next();
});

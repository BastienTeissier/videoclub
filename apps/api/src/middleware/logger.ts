import { createMiddleware } from "hono/factory";

export const requestLogger = createMiddleware(async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const requestId = c.get("requestId") ?? "-";
  console.log(
    `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms [${requestId}]`
  );
});

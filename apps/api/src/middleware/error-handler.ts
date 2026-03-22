import type { ErrorHandler } from "hono";

export const globalErrorHandler: ErrorHandler = (err, c) => {
  console.error(`Unhandled error: ${err.message}`, err.stack);
  return c.json({ error: "Internal server error" }, 500);
};

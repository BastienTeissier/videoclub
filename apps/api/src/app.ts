import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/logger.js";
import { globalErrorHandler } from "./middleware/error-handler.js";
import { health } from "./features/health/route.js";

type Variables = {
  requestId: string;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", requestId);
app.use("*", requestLogger);
// TODO: check CORS
app.use("*", cors());

app.onError(globalErrorHandler);

app.route("/health", health);

const api = new Hono();
app.route("/api/v1", api);

export { app, api };

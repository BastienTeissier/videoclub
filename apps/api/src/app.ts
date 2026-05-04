import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "./middleware/request-id.js";
import { requestLogger } from "./middleware/logger.js";
import { globalErrorHandler } from "./middleware/error-handler.js";
import { devAuth } from "./middleware/dev-auth.js";
import { health } from "./features/health/route.js";
import { movies } from "./features/movies/route.js";
import { chat } from "./features/chat/route.js";
import { watchlist } from "./features/watchlist/route.js";

type Variables = {
  requestId: string;
  userId: string;
};

const app = new Hono<{ Variables: Variables }>();

app.use("*", requestId);
app.use("*", requestLogger);
// TODO: check CORS
app.use("*", cors());

app.onError(globalErrorHandler);

app.route("/health", health);

const api = new Hono<{ Variables: Variables }>();
api.use("*", devAuth);
api.route("/movies", movies);
api.route("/chat", chat);
api.route("/watchlist", watchlist);

app.route("/api/v1", api);

export { app, api };

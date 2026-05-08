import { describe, it, expect } from "vitest";
import type { MovieDto, ReviewWithMovieDto } from "@repo/contracts";
import {
  discoverySurfaceMessages,
  watchlistGridMessages,
  reviewsGridMessages,
} from "./a2ui-emitter.js";

const sampleMovie: MovieDto = {
  id: "00000000-0000-0000-0000-000000000001",
  tmdbId: 1,
  title: "Sample",
  year: 2020,
  synopsis: null,
  genres: ["Comedy"],
  cast: null,
  directors: null,
  runtime: 100,
  language: null,
  posterUrl: null,
  backdropUrl: null,
  popularity: 1,
  releaseDate: null,
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("discoverySurfaceMessages", () => {
  it("emits createSurface, updateComponents (skeleton), /filters, updateComponents (grid), /movies in order", () => {
    const messages = discoverySurfaceMessages({
      filters: { genres: ["Comedy"], maxRuntime: 120 },
      movies: [sampleMovie],
    });

    expect(messages).toHaveLength(5);
    expect(messages[0]).toHaveProperty("createSurface");
    expect(messages[1]).toHaveProperty("updateComponents");
    const skeleton = (messages[1] as { updateComponents: { components: Array<{ id: string; component: string }> } })
      .updateComponents.components.find((c) => c.id === "grid");
    expect(skeleton?.component).toBe("Skeleton");
    expect(messages[2]).toHaveProperty("updateDataModel");
    expect((messages[2] as { updateDataModel: { path: string } }).updateDataModel.path).toBe("/filters");
    const realGrid = (messages[3] as { updateComponents: { components: Array<{ id: string; component: string }> } })
      .updateComponents.components.find((c) => c.id === "grid");
    expect(realGrid?.component).toBe("MovieGrid");
    expect((messages[4] as { updateDataModel: { path: string } }).updateDataModel.path).toBe("/movies");
  });

  it("drops the /filters update when filters arg is absent", () => {
    const messages = discoverySurfaceMessages({ movies: [sampleMovie] });
    expect(messages).toHaveLength(4);
    const paths = messages
      .filter(
        (m): m is { updateDataModel: { surfaceId: string; path: string; value: unknown } } =>
          "updateDataModel" in m,
      )
      .map((m) => m.updateDataModel.path);
    expect(paths).toEqual(["/movies"]);
  });

  it("emits final /movies update with empty array when no movies", () => {
    const messages = discoverySurfaceMessages({ movies: [] });
    const last = messages[messages.length - 1] as {
      updateDataModel: { path: string; value: unknown };
    };
    expect(last.updateDataModel.path).toBe("/movies");
    expect(last.updateDataModel.value).toEqual([]);
  });

  it("uses provided surfaceId", () => {
    const messages = discoverySurfaceMessages({
      surfaceId: "custom",
      movies: [],
    });
    const surfaceIds = messages.map((m) => {
      const obj = m as Record<string, { surfaceId?: string }>;
      if ("createSurface" in obj) return obj.createSurface!.surfaceId;
      if ("updateComponents" in obj) return obj.updateComponents!.surfaceId;
      if ("updateDataModel" in obj) return obj.updateDataModel!.surfaceId;
      return null;
    });
    expect(surfaceIds.every((id) => id === "custom")).toBe(true);
  });
});

describe("watchlistGridMessages", () => {
  it("emits 3 messages: createSurface, updateComponents, updateDataModel /state", () => {
    const messages = watchlistGridMessages({ items: [sampleMovie] });
    expect(messages).toHaveLength(3);
    expect(messages[0]).toHaveProperty("createSurface");
    expect(messages[1]).toHaveProperty("updateComponents");
    const node = (messages[1] as { updateComponents: { components: Array<{ id: string; component: string }> } })
      .updateComponents.components.find((c) => c.id === "grid");
    expect(node?.component).toBe("WatchlistGrid");
    expect((messages[2] as { updateDataModel: { path: string; value: unknown } }).updateDataModel.path).toBe("/state");
  });

  it("encodes empty state when items is empty", () => {
    const [, , update] = watchlistGridMessages({
      items: [],
      message: "Empty",
    });
    const value = (update as { updateDataModel: { value: { state: string; message?: string } } })
      .updateDataModel.value;
    expect(value.state).toBe("empty");
    expect(value.message).toBe("Empty");
  });

  it("encodes error state when error flag set", () => {
    const [, , update] = watchlistGridMessages({
      items: [],
      error: true,
      message: "Boom",
    });
    const value = (update as { updateDataModel: { value: { state: string; message?: string } } })
      .updateDataModel.value;
    expect(value.state).toBe("error");
    expect(value.message).toBe("Boom");
  });
});

const sampleReview: ReviewWithMovieDto = {
  id: "00000000-0000-0000-0000-000000000010",
  movieId: sampleMovie.id,
  rating: 4.5,
  text: "great",
  createdAt: "2020-01-01T00:00:00.000Z",
  updatedAt: "2020-01-01T00:00:00.000Z",
  movie: sampleMovie,
};

describe("reviewsGridMessages", () => {
  it("emits 3 messages with surfaceId 'reviews' by default", () => {
    const messages = reviewsGridMessages({ items: [sampleReview] });
    expect(messages).toHaveLength(3);
    expect((messages[0] as { createSurface: { surfaceId: string } }).createSurface.surfaceId).toBe("reviews");
    const node = (messages[1] as { updateComponents: { components: Array<{ id: string; component: string }> } })
      .updateComponents.components.find((c) => c.id === "grid");
    expect(node?.component).toBe("ReviewsGrid");
  });
});

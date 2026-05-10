import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../app.js";

const { mockFindLatestPendingApprovalToolCall, mockFindByIds } = vi.hoisted(
  () => ({
    mockFindLatestPendingApprovalToolCall: vi.fn(),
    mockFindByIds: vi.fn(),
  }),
);

vi.mock("@repo/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/db")>();
  return {
    ...actual,
    agentRunsRepository: vi.fn(() => ({
      findLatestPendingApprovalToolCall:
        mockFindLatestPendingApprovalToolCall,
    })),
    moviesRepository: vi.fn(() => ({
      findByIds: mockFindByIds,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByIds.mockResolvedValue([]);
});

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const PICKED_ID = "22222222-2222-4222-8222-222222222222";
const BACKUP_ID = "33333333-3333-4333-8333-333333333333";

function fakeMovie(id: string, title: string) {
  return {
    id,
    tmdbId: 1,
    title,
    year: 2024,
    synopsis: null,
    genres: ["Drama"],
    cast: [],
    directors: [],
    runtime: 120,
    language: "en",
    posterUrl: null,
    backdropUrl: null,
    popularity: 10,
    releaseDate: "2024-01-01",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };
}

describe("GET /api/v1/chat/pending-interrupt", () => {
  it("returns { data: null } when no pending tool call", async () => {
    mockFindLatestPendingApprovalToolCall.mockResolvedValue(null);

    const res = await app.request("/api/v1/chat/pending-interrupt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toBeNull();
  });

  it("returns commit_movie_night interrupt + replayed night-plan messages", async () => {
    mockFindLatestPendingApprovalToolCall.mockResolvedValue({
      id: "row-1",
      aiSdkCallId: "tc-c",
      toolName: "commit_movie_night",
      input: {
        pickedMovieId: PICKED_ID,
        backupMovieIds: [BACKUP_ID],
        reason: "vibe",
      },
      runId: "run-1",
      sessionId: SESSION_ID,
    });
    mockFindByIds.mockResolvedValue([
      fakeMovie(PICKED_ID, "Picked"),
      fakeMovie(BACKUP_ID, "Backup"),
    ]);

    const res = await app.request("/api/v1/chat/pending-interrupt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        interrupt: { id: string; reason: string };
        threadId: string;
        a2uiMessages: unknown[];
      } | null;
    };
    expect(body.data).not.toBeNull();
    expect(body.data!.interrupt.id).toBe("tc-c");
    expect(body.data!.interrupt.reason).toBe("approval");
    expect(body.data!.threadId).toBe(SESSION_ID);
    expect(body.data!.a2uiMessages.length).toBeGreaterThan(0);
    // includes a createSurface and a MovieNightPlan component
    const stringified = JSON.stringify(body.data!.a2uiMessages);
    expect(stringified).toContain("createSurface");
    expect(stringified).toContain("MovieNightPlan");
  });

  it("returns generic interrupt + empty a2uiMessages for search_tmdb", async () => {
    mockFindLatestPendingApprovalToolCall.mockResolvedValue({
      id: "row-2",
      aiSdkCallId: "tc-s",
      toolName: "search_tmdb",
      input: { query: "Stalker" },
      runId: "run-1",
      sessionId: SESSION_ID,
    });

    const res = await app.request("/api/v1/chat/pending-interrupt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        interrupt: {
          id: string;
          reason: string;
          responseSchema: { properties: Record<string, unknown> };
        };
        a2uiMessages: unknown[];
      } | null;
    };
    expect(body.data!.interrupt.id).toBe("tc-s");
    expect(body.data!.interrupt.reason).toBe("approval");
    expect(
      body.data!.interrupt.responseSchema.properties.editedReason,
    ).toBeUndefined();
    expect(body.data!.a2uiMessages).toEqual([]);
  });

  it("returns { data: null } if commit_movie_night input is malformed", async () => {
    mockFindLatestPendingApprovalToolCall.mockResolvedValue({
      id: "row-3",
      aiSdkCallId: "tc-bad",
      toolName: "commit_movie_night",
      input: { pickedMovieId: "not-a-uuid" },
      runId: "run-1",
      sessionId: SESSION_ID,
    });

    const res = await app.request("/api/v1/chat/pending-interrupt");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toBeNull();
  });
});

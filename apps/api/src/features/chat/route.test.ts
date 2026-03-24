import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../../app.js";

vi.mock("../../services/agents/orchestrator.js", () => ({
  runOrchestrator: vi.fn(),
}));

import { runOrchestrator } from "../../services/agents/orchestrator.js";

const mockOrchestrator = vi.mocked(runOrchestrator);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/chat", () => {
  it("returns 200 with response", async () => {
    mockOrchestrator.mockResolvedValue({
      sessionId: "00000000-0000-0000-0000-000000000001",
      response: "Here are some movies",
      toolResults: [],
    });

    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "find Spielberg movies" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; response: string };
    expect(body.sessionId).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.response).toBe("Here are some movies");
  });

  it("returns 400 for empty message", async () => {
    const res = await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });

    expect(res.status).toBe(400);
  });

  it("includes dev-user-001 userId", async () => {
    mockOrchestrator.mockResolvedValue({
      sessionId: "00000000-0000-0000-0000-000000000001",
      response: "test",
      toolResults: [],
    });

    await app.request("/api/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });

    expect(mockOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "dev-user-001" })
    );
  });
});

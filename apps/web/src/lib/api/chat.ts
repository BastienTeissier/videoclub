import type { ChatResponse } from "@repo/contracts";
import { apiFetch } from "./client";

export async function chatSearch(message: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

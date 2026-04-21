import { HttpAgent } from "@ag-ui/client";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function createAgentClient(threadId?: string) {
  return new HttpAgent({
    url: `${API_URL}/api/v1/chat`,
    threadId,
  });
}

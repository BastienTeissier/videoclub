import type { ModelMessage } from "ai";
import type { AgUiMessage } from "../../features/chat/ag-ui-schema.js";

export function agUiToAiSdk(messages: AgUiMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "user": {
        const content =
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
        result.push({ role: "user", content });
        break;
      }
      case "assistant": {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: "assistant",
            content: [
              ...(msg.content ? [{ type: "text" as const, text: msg.content }] : []),
              ...msg.toolCalls.map((tc) => ({
                type: "tool-call" as const,
                toolCallId: tc.id,
                toolName: tc.function.name,
                input: JSON.parse(tc.function.arguments) as unknown,
              })),
            ],
          });
        } else {
          result.push({
            role: "assistant",
            content: msg.content ?? "",
          });
        }
        break;
      }
      case "tool": {
        result.push({
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: msg.toolCallId,
              toolName: "",
              output: { type: "text" as const, value: msg.content },
            },
          ],
        });
        break;
      }
      case "system": {
        result.push({ role: "system", content: msg.content });
        break;
      }
    }
  }

  return result;
}

export interface ToolApprovalInfo {
  toolCallId: string;
  toolName: string;
  approved: boolean;
}

export function extractApprovalResponses(
  messages: AgUiMessage[]
): ToolApprovalInfo[] {
  const approvals: ToolApprovalInfo[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed && typeof parsed === "object" && "approved" in parsed) {
          approvals.push({
            toolCallId: msg.toolCallId,
            toolName: parsed.toolName ?? "",
            approved: parsed.approved === true,
          });
        }
      } catch {
        // Not an approval response, skip
      }
    }
  }

  return approvals;
}

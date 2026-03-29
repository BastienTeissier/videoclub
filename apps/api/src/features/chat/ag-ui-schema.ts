import { z } from "zod";

const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

const messageSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    id: z.string(),
    content: z.union([z.string(), z.array(z.unknown())]),
    name: z.string().optional(),
  }),
  z.object({
    role: z.literal("assistant"),
    id: z.string(),
    content: z.string().optional(),
    toolCalls: z.array(toolCallSchema).optional(),
  }),
  z.object({
    role: z.literal("tool"),
    id: z.string(),
    toolCallId: z.string(),
    content: z.string(),
    error: z.boolean().optional(),
  }),
  z.object({
    role: z.literal("system"),
    id: z.string(),
    content: z.string(),
  }),
]);

export type AgUiMessage = z.infer<typeof messageSchema>;

const toolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
});

const contextSchema = z.object({
  value: z.string(),
  description: z.string().optional(),
});

export const runAgentInputSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  messages: z.array(messageSchema),
  tools: z.array(toolSchema).optional(),
  context: z.array(contextSchema).optional(),
});

export type RunAgentInput = z.infer<typeof runAgentInputSchema>;

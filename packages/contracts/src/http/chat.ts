import { z } from "zod";

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  sessionId: z.string().uuid(),
  response: z.string(),
  toolResults: z
    .array(
      z.object({
        toolName: z.string(),
        input: z.unknown(),
        output: z.unknown(),
      })
    )
    .optional(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

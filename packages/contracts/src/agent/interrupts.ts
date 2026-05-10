import { z } from "zod";
import { movieSchema } from "../domain/movie";

export const jsonSchemaSchema = z.object({}).passthrough();
export type JsonSchema = z.infer<typeof jsonSchemaSchema>;

export const interruptSchema = z.object({
  id: z.string(),
  reason: z.string(),
  message: z.string(),
  proposed: z.unknown(),
  responseSchema: jsonSchemaSchema,
});
export type Interrupt = z.infer<typeof interruptSchema>;

export const interruptRunFinishedResultSchema = z.object({
  type: z.literal("interrupt"),
  interrupts: z.array(interruptSchema).min(1),
});
export type InterruptRunFinishedResult = z.infer<
  typeof interruptRunFinishedResultSchema
>;

export const commitMovieNightProposedSchema = z.object({
  pickedMovieId: z.string().uuid(),
  backupMovieIds: z.array(z.string().uuid()),
  reason: z.string(),
});
export type CommitMovieNightProposed = z.infer<
  typeof commitMovieNightProposedSchema
>;

export const commitMovieNightResponseSchema = z.object({
  approved: z.boolean(),
  editedReason: z.string().max(1000).optional(),
});
export type CommitMovieNightResponse = z.infer<
  typeof commitMovieNightResponseSchema
>;

export const clarificationProposedSchema = z.object({
  candidates: z.array(movieSchema).min(2),
});
export type ClarificationProposed = z.infer<
  typeof clarificationProposedSchema
>;

export const clarificationResponseSchema = z.object({
  pickedMovieId: z.string().uuid(),
});
export type ClarificationResponse = z.infer<
  typeof clarificationResponseSchema
>;

export function commitMovieNightInterrupt(
  toolCallRecordId: string,
  proposed: CommitMovieNightProposed,
): Interrupt {
  return {
    id: toolCallRecordId,
    reason: "approval",
    message: "Confirm tonight's movie pick before I commit.",
    proposed,
    responseSchema: {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        editedReason: {
          type: "string",
          "ui:widget": "textarea",
          "ui:prefillFrom": "/proposed/reason",
          maxLength: 1000,
        },
      },
      required: ["approved"],
    },
  };
}

export function clarificationInterrupt(
  toolCallRecordId: string,
  candidates: z.infer<typeof movieSchema>[],
): Interrupt {
  return {
    id: toolCallRecordId,
    reason: "clarification",
    message: "Which movie did you mean?",
    proposed: { candidates } satisfies ClarificationProposed,
    responseSchema: {
      type: "object",
      properties: {
        pickedMovieId: {
          type: "string",
          enum: candidates.map((c) => c.id),
        },
      },
      required: ["pickedMovieId"],
    },
  };
}
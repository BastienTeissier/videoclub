import { z } from "zod";
import { movieSchema } from "../domain/movie";

export const domainKeySchema = z.enum(["watchlist", "reviews"]);
export type DomainKey = z.infer<typeof domainKeySchema>;

export const mutationErrorCodeSchema = z.enum([
  "not_found",
  "no_review",
  "service_error",
]);
export type MutationErrorCode = z.infer<typeof mutationErrorCodeSchema>;

const successSchema = z.object({
  kind: z.literal("success"),
  affected: z.array(domainKeySchema).min(1),
  message: z.string(),
  movie: movieSchema.optional(),
});

const errorSchema = z.object({
  kind: z.literal("error"),
  code: mutationErrorCodeSchema,
  message: z.string(),
});

const needsClarificationSchema = z.object({
  kind: z.literal("needs-clarification"),
  candidates: z.array(movieSchema).min(2),
});

export const mutationOutcomeSchema = z.discriminatedUnion("kind", [
  successSchema,
  errorSchema,
  needsClarificationSchema,
]);
export type MutationOutcome = z.infer<typeof mutationOutcomeSchema>;

export const wireMutationOutcomeSchema = z.discriminatedUnion("kind", [
  successSchema,
  errorSchema,
]);
export type WireMutationOutcome = z.infer<typeof wireMutationOutcomeSchema>;
import { z } from "zod";

export const movieNightPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  runId: z.string().uuid(),
  pickedMovieId: z.string().uuid(),
  backupMovieIds: z.array(z.string().uuid()),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type MovieNightPlan = z.infer<typeof movieNightPlanSchema>;

export const listMovieNightPlansResponseSchema = z.object({
  items: z.array(movieNightPlanSchema),
});
export type ListMovieNightPlansResponse = z.infer<
  typeof listMovieNightPlansResponseSchema
>;

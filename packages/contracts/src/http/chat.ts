import { z } from "zod";
import { interruptSchema } from "../agent/interrupts";
import { a2uiMessageSchema } from "../a2ui/protocol";

export const pendingInterruptResponseSchema = z
  .object({
    interrupt: interruptSchema,
    threadId: z.string().uuid(),
    a2uiMessages: z.array(a2uiMessageSchema),
  })
  .nullable();
export type PendingInterruptResponse = z.infer<
  typeof pendingInterruptResponseSchema
>;

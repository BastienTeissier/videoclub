import { z } from "zod";

export const componentNodeSchema: z.ZodType<{
  id: string;
  component: string;
  children?: string[];
  data?: { path: string };
  [propKey: string]: unknown;
}> = z
  .object({
    id: z.string(),
    component: z.string(),
    children: z.array(z.string()).optional(),
    data: z.object({ path: z.string() }).optional(),
  })
  .passthrough();

export type ComponentNode = z.infer<typeof componentNodeSchema>;

export const a2uiCreateSurfaceSchema = z.object({
  createSurface: z.object({
    surfaceId: z.string(),
    catalogId: z.string(),
  }),
});

export const a2uiUpdateComponentsSchema = z.object({
  updateComponents: z.object({
    surfaceId: z.string(),
    components: z.array(componentNodeSchema),
  }),
});

export const a2uiUpdateDataModelSchema = z.object({
  updateDataModel: z.object({
    surfaceId: z.string(),
    path: z.string(),
    value: z.unknown(),
  }),
});

export const a2uiDeleteSurfaceSchema = z.object({
  deleteSurface: z.object({
    surfaceId: z.string(),
  }),
});

export const a2uiMessageSchema = z.union([
  a2uiCreateSurfaceSchema,
  a2uiUpdateComponentsSchema,
  a2uiUpdateDataModelSchema,
  a2uiDeleteSurfaceSchema,
]);

export type A2UICreateSurfaceMessage = z.infer<typeof a2uiCreateSurfaceSchema>;
export type A2UIUpdateComponentsMessage = z.infer<
  typeof a2uiUpdateComponentsSchema
>;
export type A2UIUpdateDataModelMessage = z.infer<
  typeof a2uiUpdateDataModelSchema
>;
export type A2UIDeleteSurfaceMessage = z.infer<typeof a2uiDeleteSurfaceSchema>;
export type A2UIMessage = z.infer<typeof a2uiMessageSchema>;

export function createSurface(
  surfaceId: string,
  catalogId: string,
): A2UICreateSurfaceMessage {
  return { createSurface: { surfaceId, catalogId } };
}

export function updateComponents(
  surfaceId: string,
  components: ComponentNode[],
): A2UIUpdateComponentsMessage {
  return { updateComponents: { surfaceId, components } };
}

export function updateDataModel(
  surfaceId: string,
  path: string,
  value: unknown,
): A2UIUpdateDataModelMessage {
  return { updateDataModel: { surfaceId, path, value } };
}

export function deleteSurface(surfaceId: string): A2UIDeleteSurfaceMessage {
  return { deleteSurface: { surfaceId } };
}

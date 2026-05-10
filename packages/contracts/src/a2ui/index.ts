export {
  watchlistGridSurfaceSchema,
  type WatchlistGridSurface,
} from "./watchlist-grid";
export {
  reviewFormSurfaceSchema,
  type ReviewFormSurface,
} from "./review-form";
export {
  reviewsGridSurfaceSchema,
  type ReviewsGridSurface,
} from "./reviews-grid";
export {
  componentNodeSchema,
  a2uiCreateSurfaceSchema,
  a2uiUpdateComponentsSchema,
  a2uiUpdateDataModelSchema,
  a2uiDeleteSurfaceSchema,
  a2uiMessageSchema,
  createSurface,
  updateComponents,
  updateDataModel,
  deleteSurface,
  type ComponentNode,
  type A2UICreateSurfaceMessage,
  type A2UIUpdateComponentsMessage,
  type A2UIUpdateDataModelMessage,
  type A2UIDeleteSurfaceMessage,
  type A2UIMessage,
} from "./protocol";
export {
  VIDEOCLUB_CATALOG_ID,
  SURFACE_IDS,
  videoclubCatalog,
  getCatalogPromptDescription,
  type CatalogComponent,
  type SurfaceId,
} from "./catalog";
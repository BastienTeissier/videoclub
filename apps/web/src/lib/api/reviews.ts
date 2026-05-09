import type {
  UpsertReviewRequest,
  UpsertReviewResponse,
  DeleteReviewResponse,
  GetReviewResponse,
  ListReviewRatingsResponse,
} from "@repo/contracts";
import { apiFetch } from "./client.js";

export function upsertReview(movieId: string, body: UpsertReviewRequest) {
  return apiFetch<UpsertReviewResponse>(`/api/v1/reviews/${movieId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteReview(movieId: string) {
  return apiFetch<DeleteReviewResponse>(`/api/v1/reviews/${movieId}`, {
    method: "DELETE",
  });
}

export function fetchReview(movieId: string) {
  return apiFetch<GetReviewResponse>(`/api/v1/reviews/${movieId}`);
}

export function fetchReviewRatings() {
  return apiFetch<ListReviewRatingsResponse>("/api/v1/reviews");
}
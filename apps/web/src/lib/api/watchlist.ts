import type {
  AddToWatchlistResponse,
  RemoveFromWatchlistResponse,
  WatchlistResponse,
} from "@repo/contracts";
import { apiFetch } from "./client";

export function addToWatchlist(movieId: string) {
  return apiFetch<AddToWatchlistResponse>(`/api/v1/watchlist/${movieId}`, {
    method: "POST",
  });
}

export function removeFromWatchlist(movieId: string) {
  return apiFetch<RemoveFromWatchlistResponse>(`/api/v1/watchlist/${movieId}`, {
    method: "DELETE",
  });
}

export function fetchWatchlist() {
  return apiFetch<WatchlistResponse>("/api/v1/watchlist");
}

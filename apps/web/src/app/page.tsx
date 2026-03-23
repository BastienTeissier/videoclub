import { MovieSearch } from "@/components/movie-search";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-16">
      <h1 className="text-xl font-semibold text-foreground">videoclub</h1>
      <p className="mt-2 text-sm text-muted">
        Movies watchlist and reviews
      </p>
      <div className="mt-8 w-full">
        <MovieSearch />
      </div>
    </main>
  );
}

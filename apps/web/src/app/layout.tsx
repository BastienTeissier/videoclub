import type { Metadata } from "next";
import { Toaster } from "@repo/ui";
import { WatchlistProvider } from "@/contexts/watchlist-context";
import { ReviewProvider } from "@/contexts/review-context";
import { MemoryProvider } from "@/contexts/memory-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "videoclub",
  description: "Movies watchlist and reviews",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <WatchlistProvider>
          <ReviewProvider>
            <MemoryProvider>{children}</MemoryProvider>
          </ReviewProvider>
        </WatchlistProvider>
        <Toaster />
      </body>
    </html>
  );
}

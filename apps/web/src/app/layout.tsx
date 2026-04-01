import type { Metadata } from "next";
import { Toaster } from "@repo/ui";
import { WatchlistProvider } from "@/contexts/watchlist-context";
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
          {children}
        </WatchlistProvider>
        <Toaster />
      </body>
    </html>
  );
}

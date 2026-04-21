import type { Metadata } from "next";
import { Toaster } from "@repo/ui";
import { WatchlistProvider } from "@/contexts/watchlist-context";
import { ChatResultsProvider } from "@/contexts/chat-results-context";
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
          <ChatResultsProvider>
            {children}
          </ChatResultsProvider>
        </WatchlistProvider>
        <Toaster />
      </body>
    </html>
  );
}

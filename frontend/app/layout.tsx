import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GeM Tender Scraper",
  description: "Scrape, store, and search GeM tenders from PostgreSQL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

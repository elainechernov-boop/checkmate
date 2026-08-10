import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Checkmate",
  description: "The family's homeschool assignment tracker.",
};

// Every page here reads live, frequently-changing data straight from the
// database (§1: no caching, a 60s poll is the only "real-time" this app
// promises) — none of it should ever be statically prerendered. Forcing
// dynamic rendering app-wide also means `next build` never touches the
// database at all, so it can't fail against a build-time-unreachable
// production DB (or a local dev.db that doesn't exist in the build image).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

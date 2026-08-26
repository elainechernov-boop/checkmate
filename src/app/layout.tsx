import type { Metadata, Viewport } from "next";
import { Inter, Syncopate } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// The one "fun, wide" headline font — reserved for a student's own name and
// project titles only (see design_handoff_homeroom_redesign/README.md's
// "Typography" section). It has no real lowercase forms, so every call site
// using it also applies uppercase + extra letter-spacing.
const syncopate = Syncopate({
  variable: "--font-syncopate",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "homeroom",
  description: "The family's homeschool assignment tracker.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/homeroom-favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: ["/favicon-32.png"],
    // Safari's "Add to Dock" (§1's install path) reads this specifically —
    // and, unlike the tab favicon above, Safari does not rasterize SVG for
    // it, so this has to be a real PNG or the dock icon silently falls back
    // to a screenshot of the page instead of the mascot mark.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Without this, mobile Safari renders the page at a fixed ~980px virtual
// viewport and shrinks it to fit — every layout below would render but at
// unreadable scale. This makes the phone's own screen width the layout
// width instead, which the responsive breakpoints below assume.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      className={`${inter.variable} ${syncopate.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}

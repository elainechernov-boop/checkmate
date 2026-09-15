"use client";

// A four-point sparkle shape, standing in for the ✨ emoji everywhere a
// celebration needs one of homeroom's own brand colors: emoji glyphs render
// from the platform's built-in color font and ignore CSS `color` entirely,
// so `{SPARKLE}` tinted per-instance was silently always rendering the same
// default gold twinkle no matter what color was requested.
export function Sparkle({ color, sizeRem }: { color: string; sizeRem: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem`, display: "block" }}
      aria-hidden
    >
      <path d="M12 0C12 6.5 13 9 24 12C13 15 12 17.5 12 24C12 17.5 11 15 0 12C11 9 12 6.5 12 0Z" fill={color} />
    </svg>
  );
}

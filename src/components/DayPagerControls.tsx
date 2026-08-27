"use client";

import { COLORS } from "@/lib/theme";

/**
 * The mobile day pager's chrome: prev/next arrows (for anyone not
 * swiping — trackpad, keyboard-adjacent taps, or just discoverability) plus
 * a six-dot position indicator that doubles as a direct jump. Arrows and
 * dots share the same navigation callbacks the swipe gesture uses, so
 * crossing a week edge behaves identically no matter which control did it.
 */
export function DayPagerControls({
  activeIndex,
  labels,
  // The centered heading between the arrows (e.g. "Wed · Sep 10") —
  // Canvas.dc.html's mobile pager, unlike the dot row below, always names
  // the day currently on screen, in the student's own accent color.
  currentLabel,
  accentColor,
  onSelect,
  onPrev,
  onNext,
}: {
  activeIndex: number;
  labels: string[];
  currentLabel: string;
  accentColor: string;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous day"
          className="px-2 py-3 leading-none"
          style={{ color: COLORS.muted, fontSize: 11 }}
        >
          ‹
        </button>
        <span
          className="uppercase"
          style={{ color: accentColor, fontWeight: 700, fontSize: "1rem" }}
        >
          {currentLabel}
        </span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next day"
          className="px-2 py-3 leading-none"
          style={{ color: COLORS.muted, fontSize: 11 }}
        >
          ›
        </button>
      </div>
      <div className="flex items-center gap-[5px]" style={{ padding: "6px 0 12px" }}>
        {labels.map((label, index) => (
          <button
            key={`${label}-${index}`}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Go to ${label}`}
            aria-current={index === activeIndex}
            className="rounded-full transition-colors"
            style={{ width: 5, height: 5, background: index === activeIndex ? accentColor : COLORS.hairline }}
          />
        ))}
      </div>
    </div>
  );
}

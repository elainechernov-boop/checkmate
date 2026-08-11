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
  accentColor,
  onSelect,
  onPrev,
  onNext,
}: {
  activeIndex: number;
  labels: string[];
  accentColor: string;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous day"
        className="px-2 py-1 text-xl leading-none"
        style={{ color: COLORS.muted }}
      >
        ‹
      </button>
      <div className="flex items-center gap-2.5">
        {labels.map((label, index) => (
          <button
            key={`${label}-${index}`}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Go to ${label}`}
            aria-current={index === activeIndex}
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: index === activeIndex ? accentColor : COLORS.hairline }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next day"
        className="px-2 py-1 text-xl leading-none"
        style={{ color: COLORS.muted }}
      >
        ›
      </button>
    </div>
  );
}

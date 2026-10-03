"use client";

import { useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { COLORS } from "@/lib/theme";
import type { AnswerView, AxisView, BucketKey, DayView } from "@/lib/timeDashboardView";
import { TimeRunRow } from "../TimeRunsEditor";

// §15's two charts. Grayscale on purpose (§9 — color stays the student's
// accent), so identity is carried by lightness AND direct labels, a legend,
// tooltips, and a table twin — never by color alone. Marks follow the dataviz
// specs: thin, a 2px surface gap between fills (not a stroke around them),
// recessive solid hairlines, and hit areas bigger than the marks.

// ---- shared tooltip -----------------------------------------------------

interface TipState {
  x: number;
  y: number;
  value: string;
  label: string;
}

/** One tooltip per chart: the value leads, the label follows. Works from the
 * pointer and from keyboard focus alike — tooltips enhance, they never gate
 * (every value is also in the legend, the labels, or the table view). */
function useChartTip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  function show(event: PointerEvent | FocusEvent, value: string, label: string) {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    let x: number;
    let y: number;
    if ("clientX" in event) {
      x = event.clientX - box.left;
      y = event.clientY - box.top;
    } else {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2 - box.left;
      y = rect.top - box.top;
    }
    setTip({ x: Math.min(Math.max(x, 80), Math.max(80, box.width - 80)), y, value, label });
  }

  const hide = () => setTip(null);

  const node = tip ? (
    <div
      role="tooltip"
      style={{
        position: "absolute",
        left: tip.x,
        top: tip.y - 10,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        background: COLORS.white,
        border: `1px solid ${COLORS.hairline}`,
        padding: "5px 9px",
        whiteSpace: "nowrap",
        zIndex: 20,
      }}
    >
      <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{tip.value}</div>
      <div style={{ color: COLORS.muted, fontSize: 11 }}>{tip.label}</div>
    </div>
  ) : null;

  return { containerRef, show, hide, node };
}

const tableCell = { padding: "3px 12px 3px 0", fontVariantNumeric: "tabular-nums" } as const;

// ---- the answer: one stacked bar ----------------------------------------

// Ink / mid-gray / the app's faint gray, and an outlined empty segment for
// waiting. Validated: adjacent segments separate at ΔE ≥ 21 (deutan, tritan,
// normal). The faintest gray is under 3:1 against white, which is why every
// segment also has the legend, an inline value where it fits, a tooltip, and
// the table view.
const SEGMENT_STYLE: Record<BucketKey, { fill: string; ink: string; outlined?: boolean }> = {
  working: { fill: COLORS.text, ink: COLORS.white },
  paused: { fill: COLORS.muted, ink: COLORS.white },
  between: { fill: COLORS.mutedFaint, ink: COLORS.text },
  waiting: { fill: "transparent", ink: COLORS.text, outlined: true },
};

export function AnswerBar({ answer }: { answer: AnswerView }) {
  const { containerRef, show, hide, node } = useChartTip();
  const present = answer.segments.filter((segment) => segment.share > 0);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 2, height: 30 }}>
        {present.map((segment) => {
          const style = SEGMENT_STYLE[segment.key];
          return (
            <div
              key={segment.key}
              tabIndex={0}
              role="img"
              aria-label={`${segment.label}: ${segment.valueLabel}, ${segment.share}%`}
              onPointerMove={(event) => show(event, segment.valueLabel, `${segment.label} · ${segment.share}%`)}
              onPointerLeave={hide}
              onFocus={(event) => show(event, segment.valueLabel, `${segment.label} · ${segment.share}%`)}
              onBlur={hide}
              style={{
                flex: `${segment.share} 1 0`,
                minWidth: 6,
                background: style.fill,
                boxShadow: style.outlined ? `inset 0 0 0 1px ${COLORS.muted}` : undefined,
                color: style.ink,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                paddingLeft: 10,
                outlineOffset: 2,
              }}
            >
              {segment.labelFits ? segment.valueLabel : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap" style={{ gap: "6px 18px", marginTop: 9, fontSize: 11.5 }}>
        {present.map((segment) => {
          const style = SEGMENT_STYLE[segment.key];
          return (
            <span key={segment.key} className="flex items-center gap-1.5" style={{ color: COLORS.text }}>
              <i
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  display: "inline-block",
                  background: style.fill,
                  boxShadow: style.outlined ? `inset 0 0 0 1px ${COLORS.muted}` : undefined,
                }}
              />
              {segment.label} {segment.share}%
              {!segment.labelFits && <span style={{ color: COLORS.muted }}> · {segment.valueLabel}</span>}
            </span>
          );
        })}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="cursor-pointer" style={{ color: COLORS.muted, fontSize: 11 }}>
          View as table
        </summary>
        <table style={{ fontSize: 12, marginTop: 6, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: COLORS.muted, textAlign: "left" }}>
              <th style={{ ...tableCell, fontWeight: 500 }}>Bucket</th>
              <th style={{ ...tableCell, fontWeight: 500 }}>Daily average</th>
              <th style={{ ...tableCell, fontWeight: 500 }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {answer.segments.map((segment) => (
              <tr key={segment.key} style={{ borderTop: `1px solid ${COLORS.hairline}` }}>
                <td style={tableCell}>{segment.label}</td>
                <td style={tableCell}>{segment.valueLabel}</td>
                <td style={tableCell}>{segment.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {node}
    </div>
  );
}

// ---- day by day: one thin strip per day ----------------------------------

const ROW_COLUMNS = "3.4rem minmax(0, 1fr) 11.5rem";

export function DayStrips({ days, axis }: { days: DayView[]; axis: AxisView }) {
  const { containerRef, show, hide, node } = useChartTip();
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const rowToggle = (dateISO: string) => () => setOpenDate((current) => (current === dateISO ? null : dateISO));

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: ROW_COLUMNS, columnGap: 12, fontSize: 11, color: COLORS.muted }}>
        <span />
        <div style={{ position: "relative", height: 13 }} aria-hidden>
          {axis.ticks.map((tick) => (
            <span key={tick.left} style={{ position: "absolute", left: `${tick.left}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
        <span />
      </div>

      <div style={{ borderTop: `1px solid ${COLORS.hairline}`, marginTop: 6 }}>
        {days.map((day) => {
          const isOpen = openDate === day.dateISO;
          return (
            <div key={day.dateISO} style={{ borderBottom: `1px solid ${COLORS.hairline}` }}>
              <div style={{ display: "grid", gridTemplateColumns: ROW_COLUMNS, columnGap: 12, alignItems: "center", padding: "9px 0" }}>
                <button
                  type="button"
                  onClick={rowToggle(day.dateISO)}
                  aria-expanded={isOpen}
                  className="hr-text-action"
                  style={{ lineHeight: 1.2 }}
                >
                  <span style={{ display: "block", fontSize: 12, fontWeight: 500 }}>{day.weekday}</span>
                  <span style={{ display: "block", fontSize: 10, color: COLORS.muted, letterSpacing: "0.04em" }}>{day.dateLabel}</span>
                </button>

                <div style={{ position: "relative", height: 14 }}>
                  {axis.ticks.map((tick) => (
                    <span
                      key={tick.left}
                      aria-hidden
                      style={{ position: "absolute", left: `${tick.left}%`, top: -10, bottom: -10, width: 1, background: COLORS.hairline }}
                    />
                  ))}
                  {day.blocks.map((block, index) => {
                    const key = `${day.dateISO}:${index}`;
                    const lifted = hoverKey === key;
                    return (
                      <span key={key}>
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 0,
                            height: 14,
                            left: `${block.left}%`,
                            width: `${block.width}%`,
                            background: lifted ? COLORS.muted : COLORS.text,
                            // The 2px surface gap that keeps touching runs distinct.
                            boxShadow: `inset -2px 0 0 ${COLORS.white}`,
                          }}
                        />
                        {/* The hit area: taller than the mark and at least 24px wide. */}
                        <span
                          tabIndex={0}
                          role="img"
                          aria-label={`${block.title}, ${block.timeLabel}, ${block.durationLabel}`}
                          onPointerMove={(event) => {
                            setHoverKey(key);
                            show(event, block.durationLabel, `${block.title} · ${block.timeLabel}`);
                          }}
                          onPointerLeave={() => {
                            setHoverKey(null);
                            hide();
                          }}
                          onFocus={(event) => {
                            setHoverKey(key);
                            show(event, block.durationLabel, `${block.title} · ${block.timeLabel}`);
                          }}
                          onBlur={() => {
                            setHoverKey(null);
                            hide();
                          }}
                          style={{
                            position: "absolute",
                            top: -8,
                            bottom: -8,
                            left: `${block.left + block.width / 2}%`,
                            width: `max(${block.width}%, 24px)`,
                            transform: "translateX(-50%)",
                            outlineOffset: -2,
                          }}
                        />
                      </span>
                    );
                  })}
                </div>

                <button type="button" onClick={rowToggle(day.dateISO)} aria-expanded={isOpen} className="hr-text-action" style={{ fontSize: 12 }}>
                  <span style={{ display: "block" }}>
                    Work {day.workLabel} · Day {day.dayLabel}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: COLORS.muted }}>Done {day.doneLabel}</span>
                </button>
              </div>

              {isOpen && (
                <div style={{ padding: "2px 0 14px 0" }}>
                  <div className="flex items-baseline justify-between" style={{ margin: "4px 0 6px" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {day.weekday} {day.dateLabel.charAt(0) + day.dateLabel.slice(1).toLowerCase()}
                    </span>
                    <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{day.ledgerSummary}</span>
                  </div>
                  <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 4 }}>
                    {day.ledger.map((item, index) =>
                      item.kind === "run" ? (
                        <TimeRunRow
                          key={`${item.run.id}:${item.run.startedAtMs}:${item.run.endedAtMs}`}
                          run={item.run}
                          showTitle
                          note={item.note}
                        />
                      ) : (
                        <div
                          key={`gap-${index}`}
                          style={{
                            fontSize: 11,
                            padding: "1px 0 1px 1rem",
                            color: item.strong ? COLORS.text : COLORS.muted,
                            fontWeight: item.strong ? 500 : 400,
                          }}
                        >
                          — {item.label} —
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="cursor-pointer" style={{ color: COLORS.muted, fontSize: 11 }}>
          View as table
        </summary>
        <table style={{ fontSize: 12, marginTop: 6, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: COLORS.muted, textAlign: "left" }}>
              {["Day", "Working", "Paused", "Between tasks", "Waiting", "Day length", "Done"].map((heading) => (
                <th key={heading} style={{ ...tableCell, fontWeight: 500 }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.dateISO} style={{ borderTop: `1px solid ${COLORS.hairline}` }}>
                <td style={tableCell}>
                  {day.weekday} {day.dateLabel}
                </td>
                <td style={tableCell}>{day.workLabel}</td>
                <td style={tableCell}>{day.pausedLabel}</td>
                <td style={tableCell}>{day.betweenLabel}</td>
                <td style={tableCell}>{day.waitingLabel}</td>
                <td style={tableCell}>{day.dayLabel}</td>
                <td style={tableCell}>{day.doneLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {node}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatClockTime, formatElapsed } from "@/lib/clockTime";
import { dayBarFill, type DayBarTask } from "@/lib/dayBar";
import { AWAY_AFTER_MS, PING_INTERVAL_MS } from "@/lib/timeSummary";
import type { TimerState } from "@/lib/timeTracking";
import { COLORS } from "@/lib/theme";
import { getTimerStateAction, pauseTimerAction, pingTimerAction, startTimerAction, trimTimerAction } from "./actions";
import type { StudentInstance } from "./types";

// The control ring is a touch darker than the hairline so a 1px circle still
// reads on white; it isn't a palette color, just a weight for this one shape.
const RING = "#C9CCD1";

/**
 * §15's timer screen: a full-screen white takeover — no modal chrome, nothing
 * else on the page — all type, centered. The task, an enormous elapsed clock,
 * the required time and a hairline progress rule, Pause/Play and Finish, and
 * the same day bar that sits under each weekday, pinned to the top edge so a
 * kid watches the day fill in as they work.
 *
 * The clock itself is the server's: `state` carries the closed total and the
 * open run's start, and the digits are `closed + (now + serverOffset) - start`,
 * so a skewed Mac can't distort the record.
 */
export function TimerScreen({
  instance,
  accentColor,
  state,
  offsetMs,
  otherTasks,
  prefersReducedMotion,
  onState,
  onBack,
  onFinish,
}: {
  instance: StudentInstance;
  accentColor: string;
  // null only for the instant between the tap and the server's first answer.
  state: TimerState | null;
  // The server's clock minus this machine's, taken when `state` arrived.
  offsetMs: number;
  // The rest of today's tasks — feeds the top-edge day bar alongside this one.
  otherTasks: DayBarTask[];
  prefersReducedMotion: boolean;
  onState: (next: TimerState) => void;
  onBack: () => void;
  onFinish: () => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pending, setPending] = useState<{ kind: "pause" | "resume"; atTotalMs: number } | null>(null);
  const [finishing, setFinishing] = useState(false);
  // "Welcome back — keep that time?" Set when the window turns up after a long
  // silence (the timer kept running; the kid may well have been working on
  // paper with this window in the background): the moment it was last heard
  // from. A screen reloaded onto a running timer starts with it already set.
  const [awaySinceMs, setAwaySinceMs] = useState<number | null>(() =>
    state && state.lastPingAtMs !== null && state.openStartedAtMs !== null && state.serverNowMs - state.lastPingAtMs > AWAY_AFTER_MS
      ? state.lastPingAtMs
      : null
  );

  const running = state !== null && state.openStartedAtMs !== null;

  // Keep the latest onState reachable from the heartbeat without restarting
  // its interval every render.
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  });

  // Tick the digits while the clock is running.
  useEffect(() => {
    if (!running && state !== null) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running, state]);

  // §15's heartbeat: every 30s while open, plus the moment the tab comes back
  // to the front. If the server says the run lapsed while nobody was looking,
  // reconcile — the screen then shows it paused, at the last ping.
  useEffect(() => {
    if (!running) return;
    async function ping() {
      try {
        const result = await pingTimerAction(instance.id);
        if (!result.running) {
          onStateRef.current(await getTimerStateAction(instance.id));
        } else if (result.awaySinceMs !== null) {
          // Keep the earliest "away since" if one is already showing.
          setAwaySinceMs((current) => current ?? result.awaySinceMs);
        }
      } catch {
        // A dropped connection just skips a beat; the lapse rule covers a long one.
      }
    }
    const interval = window.setInterval(ping, PING_INTERVAL_MS);
    function handleVisibility() {
      if (document.visibilityState === "visible") void ping();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [running, instance.id]);

  // Back pauses the clock (a running clock never sits behind another screen).
  // `state === null` counts too: the first start may still be in flight, and a
  // pause on a task that isn't running is a harmless no-op server-side.
  function handleBack() {
    if (state === null || running) void pauseTimerAction(instance.id).catch(() => {});
    onBack();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handleBack();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // No dependency array on purpose: handleBack reads the current
    // state/running, so the listener is re-bound each render.
  });

  const serverNowMs = nowMs + offsetMs;
  const liveMs = running ? Math.max(0, serverNowMs - state!.openStartedAtMs!) : 0;
  const totalMs = state ? state.closedMs + liveMs : 0;
  const todayMs = state ? state.closedTodayMs + liveMs : 0;
  const earlierMs = state ? state.closedMs - state.closedTodayMs : 0;

  // Pausing/resuming answers instantly on screen; the server's word replaces it.
  const displayRunning = pending ? pending.kind === "resume" : state === null ? true : running;
  const displayTotalMs = pending?.kind === "pause" ? pending.atTotalMs : totalMs;

  async function handleStopWhereItWentQuiet() {
    if (awaySinceMs === null) return;
    const stopAt = awaySinceMs;
    setAwaySinceMs(null);
    try {
      onState(await trimTimerAction(instance.id, stopAt));
    } catch {
      // The server refused (e.g. already stopped) — the screen will catch up on the next heartbeat.
    }
  }

  async function handleToggle() {
    if (pending || finishing || state === null) return;
    // Pausing or resuming settles the question on its own.
    setAwaySinceMs(null);
    setPending({ kind: running ? "pause" : "resume", atTotalMs: totalMs });
    try {
      onState(running ? await pauseTimerAction(instance.id) : await startTimerAction(instance.id));
    } catch {
      // The server refused (e.g. the item is no longer open) — stay as we were.
    } finally {
      setPending(null);
    }
  }

  function handleFinish() {
    if (finishing) return;
    setAwaySinceMs(null);
    setFinishing(true);
    onFinish();
  }

  const estimatedMinutes = instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null;
  const estimateMs = estimatedMinutes ? estimatedMinutes * 60_000 : null;
  const overMinutes = estimateMs !== null ? Math.floor((displayTotalMs - estimateMs) / 60_000) : 0;
  const taskProgress = estimateMs !== null ? Math.min(1, displayTotalMs / estimateMs) : null;

  const dayFill = dayBarFill([
    ...otherTasks,
    { status: InstanceStatus.open, estimatedMinutes, loggedTodayMs: todayMs, loggedEarlierMs: earlierMs },
  ]);

  const elapsedSeconds = displayTotalMs / 1000;
  const hasHours = elapsedSeconds >= 3600;
  const metaLine = instance.project ? instance.project.name : (instance.subject?.name ?? null);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Timer for ${instance.title}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: COLORS.white,
        color: COLORS.text,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {dayFill !== null && (
        <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: COLORS.hairline }}>
          <div
            style={{
              height: "100%",
              width: `${Math.round(dayFill * 1000) / 10}%`,
              background: accentColor,
              transition: prefersReducedMotion ? "none" : "width 1s linear",
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleBack}
        className="hr-text-action"
        style={{ position: "absolute", top: 18, left: 22, color: COLORS.muted, fontSize: 12 }}
      >
        ← Back
      </button>

      <div
        style={{
          margin: "auto",
          width: "100%",
          maxWidth: 900,
          padding: "72px 24px 40px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(28px, 4.2vw, 44px)",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            overflowWrap: "anywhere",
          }}
        >
          {instance.title}
        </h1>
        {metaLine && (
          <div style={{ color: instance.project ? accentColor : COLORS.muted, fontSize: 12, marginTop: 6 }}>{metaLine}</div>
        )}

        <div style={{ height: 22, marginTop: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {displayRunning ? (
            <span
              aria-hidden
              className="hr-pulse"
              style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor, display: "inline-block" }}
            />
          ) : (
            <span style={{ color: COLORS.muted, fontSize: 11 }}>Paused</span>
          )}
        </div>

        <p
          role="timer"
          aria-live="off"
          style={{
            fontSize: hasHours ? "clamp(56px, 11.5vw, 120px)" : "clamp(80px, 16vw, 168px)",
            fontWeight: 300,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            marginTop: 4,
            color: displayRunning ? COLORS.text : COLORS.mutedFaint,
            transition: prefersReducedMotion ? "none" : "color 0.2s ease-out",
          }}
        >
          {formatElapsed(elapsedSeconds)}
        </p>

        {estimatedMinutes !== null && taskProgress !== null && (
          <>
            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 14 }}>
              of {estimatedMinutes} min{overMinutes >= 1 ? ` · +${overMinutes} min` : ""}
            </div>
            <div aria-hidden style={{ width: "min(260px, 60vw)", height: 2, background: COLORS.hairline, margin: "10px auto 0" }}>
              <div style={{ height: "100%", width: `${taskProgress * 100}%`, background: accentColor }} />
            </div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 34 }}>
          <button
            type="button"
            onClick={handleToggle}
            autoFocus
            aria-label={displayRunning ? "Pause" : "Resume"}
            style={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              border: `1px solid ${RING}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
            }}
          >
            {displayRunning ? (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <rect x="3" y="2" width="4" height="14" fill={COLORS.text} />
                <rect x="11" y="2" width="4" height="14" fill={COLORS.text} />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <polygon points="4,2 16,9 4,16" fill={COLORS.text} />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            style={{
              height: 44,
              padding: "0 30px",
              background: COLORS.text,
              color: COLORS.white,
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 4,
              opacity: finishing ? 0.6 : 1,
            }}
          >
            Finish
          </button>
        </div>

        <div style={{ color: COLORS.muted, fontSize: 11, marginTop: 34, minHeight: 14 }}>
          {state?.firstStartedAtMs ? `Started ${formatClockTime(new Date(state.firstStartedAtMs))}` : ""}
        </div>

        {awaySinceMs !== null && running && (
          <div
            role="status"
            style={{ margin: "22px auto 0", maxWidth: 360, borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14, fontSize: 13 }}
          >
            <div style={{ color: COLORS.text }}>Welcome back. The timer kept running while this window was in the background.</div>
            <div className="flex justify-center gap-5" style={{ marginTop: 10, fontSize: 13 }}>
              <button type="button" onClick={() => setAwaySinceMs(null)} className="hr-text-action" style={{ color: COLORS.text, fontWeight: 600 }}>
                Keep the time
              </button>
              <button type="button" onClick={handleStopWhereItWentQuiet} className="hr-text-action" style={{ color: COLORS.muted }}>
                Stop at {formatClockTime(new Date(awaySinceMs))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

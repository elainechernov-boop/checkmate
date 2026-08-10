// A short, soft completion "tick" (§6 step 3), synthesized with Web Audio
// rather than shipped as a binary asset. Toggleable, remembered per-browser.
const MUTE_KEY = "checkmate:soundMuted";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function playCompletionTick(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.12);
}

// §12: a distinct two-note chime for the time-sensitive reminder takeover —
// deliberately more attention-grabbing than the single completion tick above,
// since this one needs to interrupt whatever the student is doing.
export function playReminderChime(): void {
  if (isSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  [0, 0.16].forEach((offset, i) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = ctx.currentTime + offset;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(i === 0 ? 660 : 880, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.14, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.2);
  });
}

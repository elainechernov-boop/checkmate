"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-[#1A1A1A] px-4 py-2 text-sm text-white hover:bg-[#333] print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}

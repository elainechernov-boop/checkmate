"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-[#161616] px-4 py-2 text-sm text-white hover:bg-[#333] print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}

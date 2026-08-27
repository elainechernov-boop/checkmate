"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { COLORS } from "@/lib/theme";

/**
 * A centered modal dialog, styled like every other popup/menu in the app
 * (white background, 1px hairline border, zero radius, zero shadow — see
 * StudentMenu/ParentNavMenu/ApprovalPasscodePopover) rather than a large
 * boxed/rounded/shadowed dialog. The backdrop matches ComingUpPanel's own
 * (`bg-black/10`). Closes on Escape or a backdrop click, and returns focus
 * to whatever triggered it on close — the same convention every other
 * dropdown/popover in the app already follows.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const invokerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement;
      return;
    }
    if (invokerRef.current instanceof HTMLElement) invokerRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border"
        style={{ background: COLORS.white, borderColor: COLORS.hairline }}
        onClick={(event) => event.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: COLORS.hairline }}>
            <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 700 }}>{title}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ color: COLORS.mutedFaint, fontSize: 18, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </>
  );
}

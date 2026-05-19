"use client";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  zIndex = 50,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  zIndex?: number;
}) {
  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-white/60 backdrop-blur-sm"
        style={{ zIndex: zIndex - 1 }}
        onClick={onClose}
      />
      <div
        className="fixed inset-0 flex items-center justify-center p-5 pointer-events-none"
        style={{ zIndex }}
      >
        <div className="bg-white border border-surface2 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface2 sticky top-0 bg-white z-10">
            {title && (
              <h2 className="font-syne font-bold text-base text-foreground">
                {title}
              </h2>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-muted hover:text-foreground transition-colors ml-auto"
            >
              <X size={15} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </>,
    document.body
  );
}
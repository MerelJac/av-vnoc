"use client";
import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-5xl">⚡</div>

        <div className="space-y-1">
          <h1 className="font-syne font-extrabold text-2xl text-foreground tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted">
            An unexpected error occurred. Try again or contact support if it
            persists.
          </p>
        </div>

        {/* {error.digest && (
          <p className="text-[11px] text-muted font-mono bg-white px-3 py-1.5 rounded-xl inline-block">
            {error.digest}
          </p>
        )} */}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-secondary-color text-black font-syne font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.97] transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 bg-white border border-surface2 hover:border-secondary-color/20 text-muted hover:text-foreground text-sm font-medium rounded-xl transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

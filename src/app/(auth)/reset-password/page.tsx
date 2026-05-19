"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const inputCls =
  "w-full px-4 py-2.5 bg-white border rounded-xl text-foreground text-sm placeholder:text-muted focus:border-secondary-color/50 focus:ring-1 focus:ring-secondary-color/30 transition";
const labelCls =
  "block text-[10px] font-semibold tracking-widest uppercase text-muted mb-1.5";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="bg-white border border-surface2 rounded-2xl p-6 space-y-3 text-center">
        <p className="text-sm text-danger">Invalid or missing reset link.</p>
        <Link
          href="/forgot-password"
          className="text-xs text-muted hover:text-secondary-color transition-colors"
        >
          Request a new one
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-white border border-surface2 rounded-2xl p-6 space-y-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#3dffa0]/10 flex items-center justify-center mx-auto text-xl">
          ✓
        </div>
        <h2 className="font-syne font-bold text-base text-foreground">
          Password updated
        </h2>
        <p className="text-sm text-muted">Redirecting you to sign in…</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-surface2 rounded-2xl p-6 space-y-4"
    >
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      <div>
        <label className={labelCls}>New password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={inputCls}
          required
          minLength={8}
        />
      </div>

      <div>
        <label className={labelCls}>Confirm password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          className={inputCls}
          required
          minLength={8}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2.5 bg-secondary-color text-black font-syne font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition"
      >
        {submitting ? "Updating…" : "Set new password"}
      </button>

      <Link
        href="/login"
        className="block text-center text-xs text-muted hover:text-secondary-color transition-colors"
      >
        Back to sign in
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="font-orbitron font-extrabold text-3xl text-secondary-color tracking-tight">
            Antares
          </h1>
          <p className="text-sm text-muted">Set a new password</p>
        </div>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>

        <p className="text-xs text-center text-muted">
          © {new Date().getFullYear()} Antares
        </p>
      </div>
    </div>
  );
}

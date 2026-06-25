"use client";
import { useState } from "react";
import Link from "next/link";

const inputCls = "w-full px-4 py-2.5 bg-white border  rounded-xl text-foreground text-sm placeholder:text-muted focus:border-secondary-color/50 focus:ring-1 focus:ring-secondary-color/30 transition";
const labelCls = "block text-[10px] font-semibold tracking-widest uppercase text-muted mb-1.5";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="font-syne font-extrabold text-3xl text-secondary-color tracking-tight">
            Call One VNOC
          </h1>
          <div className="bg-white border border-surface2 rounded-2xl p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#3dffa0]/10 flex items-center justify-center mx-auto text-xl">
              ✉️
            </div>
            <h2 className="font-syne font-bold text-base text-foreground">Check your email</h2>
            <p className="text-sm text-muted leading-relaxed">
              If an account with <span className="text-foreground font-medium">{email}</span> exists, we&apos;ve sent a password reset link.
            </p>
            <Link
              href="/login"
              className="block text-center text-xs text-muted hover:text-secondary-color transition-colors pt-1"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="font-syne font-extrabold text-3xl text-secondary-color tracking-tight">
            Call One VNOC
          </h1>
          <p className="text-sm text-muted">Reset your password</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white border border-surface2 rounded-2xl p-6 space-y-4"
        >
          <p className="text-xs text-muted leading-relaxed">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-secondary-color text-black font-syne font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] transition"
          >
            Send reset link
          </button>

          <Link
            href="/login"
            className="block text-center text-xs text-muted hover:text-secondary-color transition-colors"
          >
            Back to sign in
          </Link>
        </form>

        <p className="text-xs text-center text-muted">
          © {new Date().getFullYear()} Call One VNOC
        </p>
      </div>
    </div>
  );
}
"use client";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const inputCls = "w-full px-4 py-2.5 bg-white border rounded-xl text-foreground text-sm placeholder:text-muted focus:border-secondary-color/50 focus:ring-1 focus:ring-secondary-color/30  transition";

const labelCls = "block text-[10px] font-semibold tracking-widest uppercase text-muted mb-1.5";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [signInText, setSignInText] = useState("Sign In");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSignInText("Signing in...");
    const formData = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      passwordConfrim: formData.get("password-confirm"),
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      setSignInText("Sign In");
      return;
    }
    window.location.href = "/landing";
  }

  return (
    <div className="min-h-screen flex items-center justify-center  bg-[#F7F6F3] px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="font-orbitron font-extrabold text-3xl text-secondary-color tracking-tight">
            AV_FLOW
          </h1>
          <p className="text-sm text-muted">Sign in to your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-surface2 rounded-2xl p-6 space-y-5"
        >
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
              <span className="text-sm text-danger">{error}</span>
            </div>
          )}

          {/* Email */}
          <div>
            <label className={labelCls}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className={inputCls}
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className={labelCls}>Password</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              className={inputCls}
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 bg-secondary-color text-black font-syne font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] transition"
          >
            {signInText}
          </button>

          {/* Links */}
          <div className="flex items-center justify-between pt-1">
            {/* <Link
              href="/signup"
              className="text-xs text-muted hover:text-secondary-color transition-colors"
            >
              New here? Get started
            </Link> */}
            <Link
              href="/forgot-password"
              className="text-xs text-muted hover:text-secondary-color transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </form>

        <p className="text-xs text-center text-muted">
          © {new Date().getFullYear()} AV_FLOW
        </p>
      </div>
    </div>
  );
}
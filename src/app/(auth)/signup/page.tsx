"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupAction } from "./actions";
import { signIn } from "next-auth/react";

const inputCls =
  "w-full px-4 py-2.5 bg-white border  rounded-xl text-foreground text-sm placeholder:text-muted focus:border-secondary-color/50 focus:ring-1 focus:ring-secondary-color/30 transition";
const labelCls =
  "block text-[10px] font-semibold tracking-widest uppercase text-muted mb-1.5";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function signup(formData: FormData) {
    setError(null);

    const result = await signupAction(formData);

    if (result.success) {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: true,
        callbackUrl: "/",
      });
    } else {
      setError(result.error);
      return;
    }

    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center  px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="font-orbitron font-extrabold text-3xl text-secondary-color tracking-tight">
            Call One VNOC
          </h1>
          <p className="text-sm text-muted">Create your account</p>
        </div>

        <form
          action={signup}
          className="bg-white border border-surface2 rounded-2xl p-6 space-y-4"
        >
          {/* Error */}
          {error && (
            <div className="space-y-2">
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
                <p className="text-sm text-danger">{error}</p>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Registration is limited to invited users only.{" "}
                <a
                  href="mailto:mjacobs@calloneonline.com?subject=Dialed%20Fitness%20Inquiry"
                  className="underline text-foreground hover:text-blue-700"
                >
                  Contact us{" "}
                </a>{" "}
                for more information.
              </p>
            </div>
          )}

          {/* firstName */}
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input
                name="firstName"
                type="text"
                placeholder="First"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input
                name="lastName"
                type="text"
                placeholder="Last"
                className={inputCls}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Email</label>
            <input
              name="email"
              type="email"
              placeholder="Email from invitation"
              className={inputCls}
              required
            />
          </div>

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

          <div>
            <label className={labelCls}>Confirm Password</label>
            <input
              name="password-confirm"
              type="password"
              placeholder="••••••••"
              className={inputCls}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-secondary-color text-black font-syne font-bold text-sm rounded-xl hover:opacity-90 active:scale-[0.98] transition"
          >
            Create account
          </button>

          <Link href="/login"   className="block text-center text-xs text-muted hover:text-secondary-color transition-colors"
>
            Already have an account?
          </Link>
        </form>
      </div>
    </div>
  );
}

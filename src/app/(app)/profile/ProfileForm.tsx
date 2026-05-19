"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { LogoutButton } from "@/app/components/Logout";

type Profile = {
  firstName: string;
  lastName: string;
  phone?: string | null;
} | null;

type Props = {
  email: string;
  profile: Profile;
};

export default function ProfileForm({ email, profile }: Props) {
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  const [form, setForm] = useState({
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    phone: profile?.phone ?? "",
    email,
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSubmit() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      showToast("error", "First and last name are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || null,
          email: form.email,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      showToast("success", "Profile saved");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border ${
            toast.type === "success"
              ? "bg-white border-green-200 text-green-700"
              : "bg-white border-red-200 text-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 size={15} />
          ) : (
            <AlertCircle size={15} />
          )}
          {toast.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* Personal Info */}
        <div className="bg-white border border-[#E5E3DE] rounded-2xl p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#888]">
            Personal Info
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-[#999]">
                First Name
              </label>
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Jane"
                className="w-full text-sm text-[#111] border border-[#E5E3DE] rounded-xl px-3 py-2.5 placeholder:text-[#ccc] focus:outline-none focus:border-[#111] transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-[#999]">
                Last Name
              </label>
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Doe"
                className="w-full text-sm text-[#111] border border-[#E5E3DE] rounded-xl px-3 py-2.5 placeholder:text-[#ccc] focus:outline-none focus:border-[#111] transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-[#999]">
              Phone{" "}
              <span className="normal-case font-normal text-[#bbb] tracking-normal">
                (optional)
              </span>
            </label>
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 555 000 0000"
              className="w-full text-sm text-[#111] border border-[#E5E3DE] rounded-xl px-3 py-2.5 placeholder:text-[#ccc] focus:outline-none focus:border-[#111] transition-colors"
            />
          </div>
        </div>

        {/* Account */}
        <div className="bg-white border border-[#E5E3DE] rounded-2xl p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#888]">
            Account
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-[#999]">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="w-full text-sm text-[#111] border border-[#E5E3DE] rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#111] transition-colors"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 text-sm font-semibold px-4 py-3 rounded-xl bg-[#111] text-white hover:bg-[#333] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}

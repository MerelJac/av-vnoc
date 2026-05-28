"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex items-center gap-2 px-2.5 py-[6px] rounded-md text-[12.5px] font-medium text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors w-full border-l-2 border-transparent"
    >
      <LogOut size={16} color="red"/>
      Log out
    </button>
  );
}

// app/components/DeleteExerciseButton.tsx
"use client";
import { Trash2 } from "lucide-react";

export function DeleteExerciseButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm("Are you sure you want to delete this exercise?")) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-semibold hover:bg-danger/20 hover:border-danger/30 active:scale-[0.97] transition-all"
    >
      <Trash2 size={14} />
      Delete Exercise
    </button>
  );
}
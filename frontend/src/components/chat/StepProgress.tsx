import { useState } from "react";
import { getAuthClientId } from "@/utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export interface ApplicationProgress {
  userApplicationId: number;
  applicationName: string;
  steps: string[];
  stepsCompleted: boolean[];
}

interface StepProgressProps {
  progress: ApplicationProgress;
}

export default function StepProgress({ progress }: StepProgressProps) {
  const clientId = getAuthClientId();
  const [completed, setCompleted] = useState<boolean[]>(progress.stepsCompleted);
  const [updating, setUpdating] = useState(false);

  const doneCount = completed.filter(Boolean).length;
  const pct = Math.round((doneCount / progress.steps.length) * 100);

  const toggleStep = async (idx: number) => {
    if (!clientId || updating) return;
    const next = [...completed];
    next[idx] = !next[idx];
    setUpdating(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/clients/${clientId}/user-applications/${progress.userApplicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepsCompleted: next }),
        }
      );
      if (res.ok) setCompleted(next);
    } catch {
      /* revert silently */
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-primary/15 bg-[var(--surface-container-low)] p-4 max-w-md">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold font-headline text-on-surface">{progress.applicationName}</h4>
        <span className="text-[11px] font-bold text-primary">{pct}%</span>
      </div>

      <div className="w-full h-1.5 rounded-full bg-[var(--surface-container)] mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="space-y-2">
        {progress.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <button
              onClick={() => toggleStep(i)}
              disabled={!clientId || updating}
              className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                completed[i]
                  ? "bg-primary border-primary text-white"
                  : "border-[var(--outline-variant)]/40 hover:border-primary/50"
              }`}
            >
              {completed[i] && (
                <span className="material-symbols-outlined text-xs">check</span>
              )}
            </button>
            <span className={`text-xs leading-relaxed ${completed[i] ? "text-on-surface-variant line-through" : "text-on-surface"}`}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

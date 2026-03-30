import { useState } from "react";
import { Check } from "lucide-react";
import { getStoredUser, getAuthClientId } from "@/utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export interface ProfilePromptData {
  field: string;
  label: string;
  type: "select" | "number";
  options: string[];
}

interface ProfilePromptProps {
  prompt: ProfilePromptData;
  onAnswered: (message: string) => void;
}

export default function ProfilePrompt({ prompt, onAnswered }: ProfilePromptProps) {
  const clientId = getAuthClientId();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numberValue, setNumberValue] = useState("");

  const saveField = async (value: string | number) => {
    if (!clientId) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/clients/${clientId}/profile-field`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: prompt.field, value }),
      });
      setSaved(true);
      const displayValue = prompt.field === "income"
        ? `$${Number(value).toLocaleString()}`
        : prompt.type === "number"
          ? Number(value).toLocaleString()
          : String(value);
      onAnswered(`My ${prompt.label.toLowerCase()} is ${displayValue}.`);
    } catch {
      /* fail silently — user can still type manually */
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-green-600 font-medium">
        <Check className="w-3.5 h-3.5" />
        {prompt.label} saved to your profile
      </div>
    );
  }

  if (prompt.type === "select") {
    return (
      <div className="mt-2 max-w-lg">
        <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">{prompt.label}</p>
        <div className="flex flex-wrap gap-1.5">
          {prompt.options.map((opt) => (
            <button
              key={opt}
              disabled={saving}
              onClick={() => saveField(opt)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--outline-variant)]/30 bg-[var(--surface-container-lowest)] text-on-surface hover:bg-secondary-container hover:border-primary/20 transition-all disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">{prompt.label}</p>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={numberValue}
          onChange={(e) => setNumberValue(e.target.value)}
          placeholder={prompt.field === "income" ? "e.g. 35000" : "e.g. 3"}
          className="w-32 h-8 rounded-lg border border-[var(--outline-variant)]/30 bg-[var(--surface-container-lowest)] px-3 text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/40"
        />
        <button
          disabled={saving || !numberValue}
          onClick={() => saveField(Number(numberValue))}
          className="px-3 h-8 rounded-lg bg-primary text-[var(--on-primary)] text-xs font-bold hover:bg-primary-dim transition-all disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
    </div>
  );
}

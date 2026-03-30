import { useState } from "react";
import { ExternalLink, Check, Plus, ArrowRight } from "lucide-react";
import { getAuthClientId } from "@/utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export interface ProgramAction {
  type: "program_recommendation";
  programName: string;
  applicationId: number;
  category: string;
  description: string;
  officialUrl: string;
  alreadyApplied: boolean;
}

interface ProgramCardProps {
  action: ProgramAction;
  onLearnMore: (programName: string) => void;
}

export default function ProgramCard({ action, onLearnMore }: ProgramCardProps) {
  const clientId = getAuthClientId();
  const [added, setAdded] = useState(action.alreadyApplied);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (!clientId || added) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}/user-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: action.applicationId }),
      });
      if (res.status === 409) {
        setAdded(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to add application.");
      setAdded(true);
      onLearnMore(`I just added ${action.programName} to my applications. Walk me through the steps.`);
    } catch {
      setError("Could not add application.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-2 rounded-xl border border-primary/15 bg-[var(--surface-container-low)] p-4 max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-bold font-headline text-on-surface truncate">{action.programName}</h4>
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">{action.category}</span>
      </div>

      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">{action.description}</p>

      {error && <p className="text-xs text-error mb-2">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {clientId && (
          <button
            onClick={handleAdd}
            disabled={added || adding}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              added
                ? "bg-green-100 text-green-700 cursor-default"
                : "bg-primary text-[var(--on-primary)] hover:bg-primary-dim active:scale-95"
            }`}
          >
            {added ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {adding ? "Adding…" : added ? "In My Applications" : "Add to Applications"}
          </button>
        )}

        <button
          onClick={() => onLearnMore(`Tell me more about ${action.programName} eligibility and how to apply.`)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--surface-container)] text-on-surface hover:bg-[var(--surface-container-high)] transition-all"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          Learn More
        </button>

        <a
          href={action.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-primary hover:bg-primary/5 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Official Site
        </a>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type OkrMetrics = {
  totalStarted: number;
  completionRate: number;
};
/** Matches cards in Benefits Guide (Medicaid, SNAP, Housing) for home featured section. */
const FEATURED_PROGRAMS = [
  {
    icon: "health_and_safety",
    title: "Medicaid / CHIP",
    desc: "Provides free or low-cost health coverage for eligible adults, children, pregnant people, seniors, and people with disabilities. Eligibility rules vary by state. The same intake may screen for Medicaid, CHIP, and Marketplace options.",
    tag: "Health",
    programName: "Medicaid & CHIP",
    shortName: "Medicaid / CHIP",
  },
  {
    icon: "grocery",
    title: "SNAP",
    desc: "Helps eligible households with low income buy food. Federally funded but administered by each state, so exact forms, interviews, and submission methods vary.",
    tag: "Food",
    programName: "Supplemental Nutrition Assistance Program",
    shortName: "SNAP",
  },
  {
    icon: "home",
    title: "Housing",
    desc: "Includes Housing Choice Vouchers (Section 8), public housing, and subsidized rental housing. Usually managed locally through public housing agencies or participating properties. Waiting lists are common.",
    tag: "Housing",
    programName: "Housing Assistance",
    shortName: "Housing",
  },
] as const;

const Index = () => {
  const [message, setMessage] = useState("");
  const [searchError, setSearchError] = useState("");
  const [okrMetrics, setOkrMetrics] = useState<OkrMetrics | null>(null);
  const navigate = useNavigate();

  const okrFetchSeq = useRef(0);
  const fetchOkrMetrics = useCallback(async () => {
    const seq = ++okrFetchSeq.current;
    try {
      const metricsRes = await fetch(`${API_BASE_URL}/api/metrics/okr`);
      if (!metricsRes.ok) {
        if (seq === okrFetchSeq.current) setOkrMetrics(null);
        return;
      }
      const metricsJson = (await metricsRes.json()) as OkrMetrics;
      if (seq === okrFetchSeq.current) setOkrMetrics(metricsJson);
    } catch {
      if (seq === okrFetchSeq.current) setOkrMetrics(null);
    }
  }, []);

  useEffect(() => {
    void fetchOkrMetrics();
  }, [fetchOkrMetrics]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      setSearchError("Please enter at least 3 characters to search.");
      return;
    }
    setSearchError("");
    navigate("/results", { state: { initialMessage: trimmed } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestedTags = ["Healthcare", "Housing Vouchers", "Small Business Grants", "Emergency Relief"];

  return (
    <div className="relative overflow-hidden bg-surface">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex flex-col items-center justify-center pt-12 pb-64 px-6">
        <div className="max-w-4xl w-full text-center z-10 space-y-12">
          <div className="space-y-6">
            <span className="inline-block px-4 py-1.5 rounded-full bg-secondary-container text-[var(--on-secondary-container)] text-xs font-bold tracking-widest uppercase font-label">
              Empowering Communities
            </span>
            <h1 className="text-5xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter leading-[1.1]">
              Let us help you find the <br />
              <span className="text-primary italic">aid you need.</span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed font-body">
              Search through thousands of verified aid programs across healthcare, education,
              and disaster relief. Simplified for those who matter most.
            </p>
          </div>

          {/* Pill Search Bar */}
          <div className="relative max-w-3xl mx-auto">
            <div className="editorial-shadow p-2 bg-[var(--surface-container-lowest)] rounded-full flex items-center group transition-all duration-300 focus-within:ring-4 focus-within:ring-primary-container/20">
              <div className="pl-6 text-primary flex items-center">
                <span className="material-symbols-outlined text-2xl">search</span>
              </div>
              <input
                value={message}
                onChange={(e) => { setMessage(e.target.value); if (searchError) setSearchError(""); }}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border-none focus:ring-0 px-6 py-4 text-on-surface placeholder:text-[var(--outline-variant)] font-body text-lg focus:outline-none"
                placeholder="Describe the type of support you are looking for..."
                type="text"
              />
              <button
                onClick={handleSubmit}
                disabled={!message.trim()}
                className="bg-primary hover:bg-primary-dim text-[var(--on-primary)] px-8 md:px-10 py-4 rounded-full font-headline font-bold transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Find Aid
              </button>
            </div>

            {searchError && (
              <p className="mt-3 text-sm text-error font-medium text-center">{searchError}</p>
            )}

            {/* Suggested Tags */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <span className="text-sm font-label text-on-surface-variant mr-2 py-2">Suggested:</span>
              {suggestedTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setMessage(tag);
                  }}
                  className="px-4 py-2 rounded-xl bg-white border border-[var(--outline-variant)]/10 text-on-surface-variant hover:bg-secondary-container hover:text-[var(--on-secondary-container)] hover:border-transparent transition-all text-sm font-medium"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Wave backdrop */}
        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0]">
          <svg
            className="relative block w-full"
            preserveAspectRatio="none"
            viewBox="0 0 1440 200"
            xmlns="http://www.w3.org/2000/svg"
            style={{ height: "200px" }}
          >
            <path
              d="M0,60 C240,120 480,20 720,70 C960,120 1200,30 1440,60 L1440,150 C1200,120 960,180 720,150 C480,120 240,170 0,160 Z"
              className="fill-secondary-container/15"
            />
            <path
              d="M0,90 C320,140 640,50 960,100 C1120,120 1280,80 1440,95 L1440,170 C1280,185 1080,150 840,170 C600,190 360,160 0,180 Z"
              className="fill-secondary-container/10"
            />
          </svg>
        </div>
      </section>

      {okrMetrics && (
        <section className="max-w-7xl w-full mx-auto px-6 z-10 relative mb-10" aria-label="Application success metrics">
          <p className="text-xs font-label font-bold tracking-widest uppercase text-on-surface-variant mb-4 text-center">
            Platform impact
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 w-full">
            <div
              className="w-full max-w-[10rem] aspect-square rounded-full border border-[var(--outline-variant)]/15 bg-[var(--surface-container-lowest)] shadow-sm flex flex-col items-center justify-center text-center px-4 py-3"
              aria-label={`Total applications started: ${okrMetrics.totalStarted}`}
            >
              <p className="text-[0.65rem] sm:text-xs uppercase tracking-wide text-on-surface-variant font-semibold mb-1.5 font-label leading-tight max-w-[9rem]">
                Applications started
              </p>
              <p className="text-2xl font-extrabold text-on-surface font-headline tabular-nums">
                {okrMetrics.totalStarted}
              </p>
            </div>
            <div
              className="w-full max-w-[10rem] aspect-square rounded-full border border-[var(--outline-variant)]/15 bg-[var(--surface-container-lowest)] shadow-sm flex flex-col items-center justify-center text-center px-4 py-3"
              aria-label={`Completion rate: ${(okrMetrics.completionRate * 100).toFixed(1)} percent`}
            >
              <p className="text-[0.65rem] sm:text-xs uppercase tracking-wide text-on-surface-variant font-semibold mb-1.5 font-label leading-tight">
                Completion rate
              </p>
              <p className="text-2xl font-extrabold text-on-surface font-headline tabular-nums">
                {(okrMetrics.completionRate * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Smart Match Card */}
      <section className="max-w-7xl w-full mx-auto px-6 -mt-0 z-10 relative mb-24">
        <div className="bg-primary p-8 md:p-12 rounded-xl text-[var(--on-primary)] flex flex-col md:flex-row md:items-center justify-between relative overflow-hidden group">
          <div className="z-10 flex-1">
            <span className="material-symbols-outlined text-4xl mb-6" style={{ fontVariationSettings: "'FILL' 1" }}>
              auto_awesome
            </span>
            <h3 className="text-2xl md:text-3xl font-headline font-bold mb-2">Smart Match</h3>
            <p className="text-white/80 font-body max-w-xl">
              AI-powered filtering based on your unique needs and eligibility criteria.
              Describe your situation and let our system match you with the most relevant programs.
            </p>
          </div>
          <button
            onClick={() => navigate("/results", { state: { initialMessage: "What government aid programs am I eligible for?" } })}
            className="mt-8 md:mt-0 text-white font-bold flex items-center gap-2 group-hover:gap-4 transition-all z-10 bg-white/15 hover:bg-white/25 px-8 py-4 rounded-full shrink-0"
          >
            Try it now <span className="material-symbols-outlined">arrow_forward</span>
          </button>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <span className="material-symbols-outlined text-[8rem]">security</span>
          </div>
        </div>
      </section>

      {/* Featured Assistance Section */}
      <section className="bg-[var(--surface-container-low)] py-24 md:py-32 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-headline font-extrabold text-on-surface mb-4">
                Featured Assistance
              </h2>
              <p className="text-on-surface-variant max-w-xl font-body">
                Curated programs with high success rates and streamlined application processes.
              </p>
            </div>
            <button
              onClick={() => navigate("/benefits")}
              className="text-primary font-bold flex items-center gap-2 hover:underline"
            >
              View all categories <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURED_PROGRAMS.map((card) => (
              <div
                key={card.title}
                className="bg-[var(--surface-container-lowest)] rounded-xl p-8 border border-[var(--outline-variant)]/10 hover:shadow-editorial-hover transition-shadow group"
              >
                <div className="h-12 w-12 rounded-xl bg-secondary-container flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {card.icon}
                  </span>
                </div>
                <h4 className="text-xl font-headline font-bold mb-3">{card.title}</h4>
                <p className="text-on-surface-variant text-sm mb-6 leading-relaxed font-body">
                  {card.desc}
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-6 border-t border-[var(--outline-variant)]/5">
                  <span className="text-xs font-bold text-[var(--outline)] uppercase tracking-wider shrink-0">
                    {card.tag}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/results", {
                        state: {
                          initialMessage: `Tell me more about ${card.programName} and whether I might qualify.`,
                        },
                      })
                    }
                    className="text-primary text-sm font-bold text-left sm:text-right hover:underline"
                  >
                    Ask our AI about {card.shortName}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;

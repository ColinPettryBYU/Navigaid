import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ChevronUp, ExternalLink, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// ─── Data ──────────────────────────────────────────────────────────────────

type Link = { label: string; url: string };

type Program = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  icon: string; // material symbol name
  color: string; // Tailwind bg class for icon container
  tagColor: string; // Tailwind classes for badge
  description: string;
  applicationStart: string;
  eligibility: string[];
  steps: string[];
  links: Link[];
  tip: string;
};

const PROGRAMS: Program[] = [
  {
    id: "snap",
    name: "Supplemental Nutrition Assistance Program",
    shortName: "SNAP",
    category: "Food",
    icon: "grocery",
    color: "bg-green-100 text-green-700",
    tagColor: "bg-green-100 text-green-700 border-green-200",
    description:
      "Helps eligible households with low income buy food. Federally funded but administered by each state, so exact forms, interviews, and submission methods vary.",
    applicationStart: "State SNAP office or portal",
    eligibility: [
      "Households with low income meeting state and federal income or expense rules",
      "Eligibility depends on household size, income, certain expenses, and immigration or citizenship status",
      "Households with older adults or people with disabilities may have different budgeting rules",
    ],
    steps: [
      "Identify the correct state SNAP office or portal based on where you live.",
      "Create a checklist: legal names, dates of birth, Social Security numbers, address, household members, income sources, housing costs, and utility costs.",
      "Gather proof documents: photo ID, proof of address, pay stubs, benefit letters, and rent or utility statements.",
      "Complete the state application online, by mail, in person, or by fax if your state offers those options.",
      "Prepare for a state interview if required.",
      "After submission, respond quickly to requests for documents and watch for approval notices or recertification deadlines.",
    ],
    links: [
      { label: "How to apply for SNAP (USAGov)", url: "https://www.usa.gov/food-stamps" },
      { label: "Food assistance hub (USAGov)", url: "https://www.usa.gov/food-help" },
    ],
    tip: "Many states require an interview before approval. Ask about your state's specific interview process when you apply.",
  },
  {
    id: "wic",
    name: "Women, Infants, and Children",
    shortName: "WIC",
    category: "Nutrition",
    icon: "child_care",
    color: "bg-pink-100 text-pink-700",
    tagColor: "bg-pink-100 text-pink-700 border-pink-200",
    description:
      "Provides nutrition support, food benefits, breastfeeding support, health screenings, and referrals for eligible pregnant people, postpartum people, infants, and young children.",
    applicationStart: "Local or state WIC agency",
    eligibility: [
      "Pregnant, postpartum, or breastfeeding individuals who meet income and residency requirements",
      "Infants and children under age 5 who meet eligibility rules",
      "Applicants are certified through the local WIC agency, which also determines nutritional risk",
    ],
    steps: [
      "Confirm you fall into a WIC category: pregnant, postpartum, breastfeeding, infant, or child under 5.",
      "Identify your correct local or state WIC agency.",
      "Gather documents: proof of identity, address, pregnancy or child information, and household income.",
      "Schedule or start the intake process with the WIC clinic or agency.",
      "Prepare for the certification appointment.",
      "After approval, learn how benefits are issued and how follow-up appointments or recertification work.",
    ],
    links: [
      { label: "WIC overview (USDA)", url: "https://www.fns.usda.gov/wic" },
      { label: "WIC eligibility (USDA)", url: "https://www.fns.usda.gov/wic/wic-eligibility-requirements" },
      { label: "How to apply for WIC (USDA)", url: "https://www.fns.usda.gov/wic/how-apply" },
    ],
    tip: "WIC eligibility is determined by category first. Confirming that detail quickly shows whether WIC is the right fit.",
  },
  {
    id: "medicaid",
    name: "Medicaid & CHIP",
    shortName: "Medicaid / CHIP",
    category: "Health",
    icon: "health_and_safety",
    color: "bg-blue-100 text-blue-700",
    tagColor: "bg-blue-100 text-blue-700 border-blue-200",
    description:
      "Provides free or low-cost health coverage for eligible adults, children, pregnant people, seniors, and people with disabilities. Eligibility rules vary by state. The same intake may screen for Medicaid, CHIP, and Marketplace options.",
    applicationStart: "HealthCare.gov or state Medicaid agency",
    eligibility: [
      "People with low income who meet their state's Medicaid rules",
      "Children who qualify based on family income and state rules",
      "Pregnant people, seniors, and people with disabilities may qualify under separate pathways",
    ],
    steps: [
      "Gather intake details: state, household size, income, age, pregnancy status, disability status, and children in the household.",
      "Apply either through HealthCare.gov or directly through your state Medicaid agency.",
      "Gather identity details, Social Security numbers if available, immigration information if applicable, and household income.",
      "Complete the official application and review household details carefully before submitting.",
      "If you're not eligible for Medicaid or CHIP, you may be routed to Marketplace coverage instead.",
      "After submission, respond quickly to verification requests from the Marketplace or state agency.",
    ],
    links: [
      { label: "Medicaid and CHIP coverage (HealthCare.gov)", url: "https://www.healthcare.gov/medicaid-chip/" },
      { label: "CHIP information (HealthCare.gov)", url: "https://www.healthcare.gov/medicaid-chip/childrens-health-insurance-program/" },
      { label: "Health insurance hub (USAGov)", url: "https://www.usa.gov/health-insurance" },
    ],
    tip: "If you're unsure of the difference between Medicaid, CHIP, and Marketplace plans, HealthCare.gov's intake screen will help route you automatically.",
  },
  {
    id: "unemployment",
    name: "Unemployment Insurance",
    shortName: "Unemployment",
    category: "Income",
    icon: "work_off",
    color: "bg-orange-100 text-orange-700",
    tagColor: "bg-orange-100 text-orange-700 border-orange-200",
    description:
      "Provides temporary wage replacement for workers who lose employment through a qualifying circumstance and meet state work and wage requirements.",
    applicationStart: "State unemployment portal",
    eligibility: [
      "Workers who meet their state's rules about past wages, recent work history, and reason for unemployment",
      "Must be able to work, available for work, and comply with continuing claim requirements",
      "Disqualification rules, work-search requirements, and appeal procedures vary by state",
    ],
    steps: [
      "Determine the correct state to file in — typically the state where you worked.",
      "Gather employment details: recent employers, dates worked, wages, reason for separation, and personal identifying information.",
      "Find and access the official state unemployment portal via CareerOneStop.",
      "Understand the initial claim questions so you can answer them consistently and accurately.",
      "Many states require weekly or biweekly certifications and job-search reporting after filing.",
      "Monitor the state portal or mail for identity verification requests, employer responses, or appeal rights.",
    ],
    links: [
      { label: "Unemployment Benefits Finder (CareerOneStop)", url: "https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/find-unemployment-benefits.aspx" },
      { label: "Unemployment benefits overview (CareerOneStop)", url: "https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/unemployment-benefits.aspx" },
    ],
    tip: "Since unemployment is state-run, the official state portal is the only place to actually file — no national form exists.",
  },
  {
    id: "tanf",
    name: "Temporary Assistance for Needy Families",
    shortName: "TANF",
    category: "Income",
    icon: "family_restroom",
    color: "bg-purple-100 text-purple-700",
    tagColor: "bg-purple-100 text-purple-700 border-purple-200",
    description:
      "A federally funded but state- or tribe-administered cash assistance program that helps qualifying families with children and may connect them with work-related supports.",
    applicationStart: "State or tribal TANF office",
    eligibility: [
      "Families with children who meet income and state or tribal program rules",
      "In some programs, pregnancy or caregiving status may also matter",
      "States and tribes may use different program names and add work participation requirements or time limits",
    ],
    steps: [
      "Identify the correct state or tribal TANF office based on where you live.",
      "Collect household composition details: dependent children, pregnancy status, income, housing costs, and work status.",
      "Gather supporting documents: ID, proof of income, proof of residence, and documents related to dependent children.",
      "Complete the official state or tribal intake process.",
      "Prepare for follow-up steps: interviews, work program orientation, or additional documentation requests.",
      "After approval, stay current with renewal deadlines, report changes, and comply with program rules.",
    ],
    links: [
      { label: "TANF / welfare benefits (USAGov)", url: "https://www.usa.gov/welfare" },
      { label: "Welfare and financial assistance hub (USAGov)", url: "https://www.usa.gov/financial-hardship" },
    ],
    tip: "TANF rules differ more sharply by state than many other programs — confirm your state's specific requirements before applying.",
  },
  {
    id: "housing",
    name: "Housing Assistance",
    shortName: "Housing",
    category: "Housing",
    icon: "home",
    color: "bg-teal-100 text-teal-700",
    tagColor: "bg-teal-100 text-teal-700 border-teal-200",
    description:
      "Includes Housing Choice Vouchers (Section 8), public housing, and subsidized rental housing. Usually managed locally through public housing agencies or participating properties. Waiting lists are common.",
    applicationStart: "Local public housing agency or HUD property search",
    eligibility: [
      "Individuals or families with low income who meet HUD and local agency program rules",
      "Local preferences may apply: disability status, age, family composition, homelessness risk, or local residency",
      "Approved applicants may still wait months or longer due to local supply and waitlists",
    ],
    steps: [
      "Decide which housing path fits best: voucher, public housing, subsidized apartment, or emergency housing support.",
      "Use HUD or USAGov resources to locate the correct local public housing agency or property search page.",
      "Gather documents: ID, proof of income, household members, current housing info, disability documentation if relevant.",
      "Complete the official application with the local public housing agency or participating property.",
      "Prepare for waitlists, status updates, and any local preferences or screening requirements.",
      "Understand that approved applicants may still wait for an opening or voucher issuance before moving forward.",
    ],
    links: [
      { label: "Rental assistance hub (USAGov)", url: "https://www.usa.gov/rental-assistance" },
      { label: "Section 8 housing choice vouchers (USAGov)", url: "https://www.usa.gov/section-8-housing" },
      { label: "Subsidized housing (USAGov)", url: "https://www.usa.gov/housing-help" },
    ],
    tip: "Immediate housing crisis help and longer-term affordable housing programs have very different application paths — identify which you need first.",
  },
  {
    id: "ssi-ssdi",
    name: "SSI / SSDI Disability Benefits",
    shortName: "SSI / SSDI",
    category: "Disability",
    icon: "accessibility_new",
    color: "bg-indigo-100 text-indigo-700",
    tagColor: "bg-indigo-100 text-indigo-700 border-indigo-200",
    description:
      "SSDI provides monthly benefits to eligible workers with sufficient work history who have a qualifying disability. SSI provides needs-based payments to eligible people with limited income and resources who are disabled, blind, or older.",
    applicationStart: "Social Security Administration",
    eligibility: [
      "SSDI: people with a qualifying disability who have enough work credits or qualifying work history",
      "SSI: people who are disabled, blind, or age 65+ and who meet strict income and resource limits",
      "Some applicants may be screened for both programs simultaneously",
    ],
    steps: [
      "Determine whether you likely belong in the SSDI path, the SSI path, or both.",
      "Gather information: identity details, medical conditions, treatment providers, medications, work history, education, income, and resources.",
      "For SSDI: start the official online disability application through the SSA.",
      "For SSI: begin through the official SSI application path and follow the correct adult or child track.",
      "Prepare for detailed questions about daily functioning, work limits, and medical evidence.",
      "After submission, Social Security may request more records, schedule evaluations, or issue a decision that can be appealed.",
    ],
    links: [
      { label: "Apply online for disability benefits (SSA)", url: "https://www.ssa.gov/applyfordisability/" },
      { label: "Apply for SSI (SSA)", url: "https://www.ssa.gov/ssi/apply.html" },
      { label: "Disability overview (SSA)", url: "https://www.ssa.gov/disability/" },
    ],
    tip: "Organize your medical and work-history information before starting — these applications ask for substantial detail about daily functioning and past employment.",
  },
  {
    id: "liheap",
    name: "LIHEAP & Weatherization Assistance",
    shortName: "LIHEAP / WAP",
    category: "Utilities",
    icon: "bolt",
    color: "bg-yellow-100 text-yellow-700",
    tagColor: "bg-yellow-100 text-yellow-700 border-yellow-200",
    description:
      "LIHEAP helps qualifying households with heating or cooling costs. Weatherization assistance helps improve home energy efficiency and lower utility burdens. Both are administered locally or by state, territorial, or tribal programs.",
    applicationStart: "Local/state LIHEAP office",
    eligibility: [
      "Households with low income that meet state, territorial, or tribal eligibility rules",
      "Priority may be given to households with older adults, young children, or people with disabilities",
    ],
    steps: [
      "Identify what kind of help you need: overdue utility bills, disconnection risk, heating/cooling assistance, or home energy improvements.",
      "Find the correct local or state LIHEAP or weatherization office using official government resources.",
      "Gather utility bills, proof of address, household information, income documents, and any shutoff notices.",
      "Complete the local or state application process.",
      "Prepare to respond to follow-up questions about your household, utility account, and emergency circumstances.",
      "Check whether you need to reapply periodically or provide updated documents for future assistance.",
    ],
    links: [
      { label: "Help with energy bills (USAGov)", url: "https://www.usa.gov/energy-bills" },
      { label: "Home weatherization assistance (USAGov)", url: "https://www.usa.gov/weatherization" },
    ],
    tip: "Utility payment assistance and home weatherization are two separate benefits — confirm which one you need before applying.",
  },
  {
    id: "fafsa",
    name: "Free Application for Federal Student Aid",
    shortName: "FAFSA",
    category: "Education",
    icon: "school",
    color: "bg-cyan-100 text-cyan-700",
    tagColor: "bg-cyan-100 text-cyan-700 border-cyan-200",
    description:
      "The main federal student aid application. Schools use it to determine eligibility for federal grants, loans, and work-study. Many states and schools also use it for their own aid decisions.",
    applicationStart: "StudentAid.gov",
    eligibility: [
      "Students seeking federal student aid for college or career school",
      "Depending on the student's situation, a parent, spouse, or other contributor may need to provide information or consent",
      "Check each school's financial aid office for deadlines and school-specific rules",
    ],
    steps: [
      "Determine whether you are the student, a parent, or another contributor to the FAFSA.",
      "Identify who must be invited as contributors and ensure each required person can access the process.",
      "Gather personal, school, and financial information before starting the form.",
      "Complete the official FAFSA form — including contributor invitation, consent, financial questions, and signatures.",
      "Review school lists, personal details, and contributor entries carefully before submitting.",
      "After submission, watch StudentAid.gov and school portals for corrections, verification requests, and aid offers.",
    ],
    links: [
      { label: "FAFSA application (StudentAid.gov)", url: "https://studentaid.gov/h/apply-for-aid/fafsa" },
      { label: "Steps for parents/contributors (StudentAid.gov)", url: "https://studentaid.gov/apply-for-aid/fafsa/filling-out/parent" },
    ],
    tip: "The contributor invitation step is where most applicants get stuck — understand who needs to participate before you start the form.",
  },
  {
    id: "medicare",
    name: "Medicare",
    shortName: "Medicare",
    category: "Health",
    icon: "medical_services",
    color: "bg-rose-100 text-rose-700",
    tagColor: "bg-rose-100 text-rose-700 border-rose-200",
    description:
      "Federal health coverage primarily for people age 65 and older and for some younger people with qualifying disabilities or conditions. Some people are enrolled automatically, while others must sign up.",
    applicationStart: "SSA / Medicare enrollment system",
    eligibility: [
      "People age 65 and older who meet Medicare eligibility rules",
      "Certain younger people with disabilities or specific qualifying conditions",
      "Some people are automatically enrolled through Social Security, while others need to apply",
    ],
    steps: [
      "Check whether you're already receiving Social Security benefits and whether you're approaching age 65 or qualifying through disability.",
      "Understand the difference between automatic enrollment and active enrollment.",
      "Identify the correct official path for enrollment through Social Security or Medicare resources.",
      "Gather personal identity information and details relevant to timing of enrollment.",
      "Complete the official enrollment steps and pay close attention to timing windows.",
      "After enrollment, review your coverage choices and future plan decisions.",
    ],
    links: [
      { label: "How and when to apply for Medicare (USAGov)", url: "https://www.usa.gov/apply-medicare" },
      { label: "Health insurance hub (USAGov)", url: "https://www.usa.gov/health-insurance" },
    ],
    tip: "Missing enrollment windows can result in permanent late-enrollment penalties — verify whether you're auto-enrolled before assuming coverage has started.",
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(PROGRAMS.map((p) => p.category)))];

// ─── Sub-components ─────────────────────────────────────────────────────────

function ProgramCard({ program }: { program: Program }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden border border-[var(--outline-variant)]/20 hover:shadow-editorial-hover transition-shadow bg-[var(--surface-container-lowest)]">
      <CardContent className="p-0">
        {/* Card header */}
        <div className="p-6 pb-4">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                program.color
              )}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {program.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={cn("text-xs font-semibold px-2 py-0.5", program.tagColor)}
                >
                  {program.category}
                </Badge>
              </div>
              <h3 className="font-headline font-bold text-on-surface text-base leading-snug">
                {program.shortName}
                <span className="hidden sm:inline font-normal text-on-surface-variant text-sm ml-2">
                  — {program.name}
                </span>
              </h3>
            </div>
          </div>

          <p className="mt-3 text-sm text-on-surface-variant leading-relaxed font-body">
            {program.description}
          </p>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-sm text-primary">
              location_on
            </span>
            <span>
              <span className="font-semibold text-on-surface">Apply at:</span>{" "}
              {program.applicationStart}
            </span>
          </div>
        </div>

        {/* Expandable details */}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-6 py-3 border-t border-[var(--outline-variant)]/15 text-sm font-semibold font-headline text-primary hover:bg-secondary-container/30 transition-colors">
              <span>{open ? "Hide details" : "View eligibility & steps"}</span>
              {open ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="px-6 py-5 space-y-5 border-t border-[var(--outline-variant)]/15 bg-[var(--surface-container-low)]/50">
              {/* Eligibility */}
              <div>
                <h4 className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant mb-3">
                  Who generally qualifies
                </h4>
                <ul className="space-y-2">
                  {program.eligibility.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface font-body">
                      <span className="material-symbols-outlined text-base text-green-600 mt-0.5 shrink-0"
                        style={{ fontVariationSettings: "'FILL' 1" }}>
                        check_circle
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Steps */}
              <div>
                <h4 className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant mb-3">
                  Application steps
                </h4>
                <ol className="space-y-2.5">
                  {program.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-on-surface font-body">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Tip */}
              <div className="rounded-xl bg-secondary-container/40 border border-secondary-container p-4 flex gap-3">
                <span className="material-symbols-outlined text-base text-[var(--on-secondary-container)] shrink-0 mt-0.5"
                  style={{ fontVariationSettings: "'FILL' 1" }}>
                  lightbulb
                </span>
                <p className="text-sm text-[var(--on-secondary-container)] font-body leading-relaxed">
                  <span className="font-semibold">Tip: </span>
                  {program.tip}
                </p>
              </div>

              {/* Official links */}
              <div>
                <h4 className="text-xs font-bold font-headline uppercase tracking-widest text-on-surface-variant mb-2.5">
                  Official resources
                </h4>
                <div className="flex flex-col gap-2">
                  {program.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary font-semibold font-body hover:underline underline-offset-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <Button
                className="w-full mt-1 bg-primary hover:bg-primary-dim text-[var(--on-primary)] font-headline font-bold"
                onClick={() =>
                  navigate("/results", {
                    state: { initialMessage: `Tell me more about ${program.name} and whether I might qualify.` },
                  })
                }
              >
                Ask our AI about {program.shortName}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

const BenefitsGuidePage = () => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return PROGRAMS.filter((p) => {
      const matchesCategory =
        activeCategory === "All" || p.category === activeCategory;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const leftColumnPrograms = useMemo(
    () => filtered.filter((_, i) => i % 2 === 0),
    [filtered]
  );

  const rightColumnPrograms = useMemo(
    () => filtered.filter((_, i) => i % 2 === 1),
    [filtered]
  );

  return (
    <div className="bg-surface min-h-screen">
      {/* ── Hero ── */}
      <section className="relative bg-primary overflow-hidden">
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-48 h-48 rounded-full bg-white/5 translate-y-1/2 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-20">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-bold tracking-widest uppercase font-label mb-5">
            Benefits Guide
          </span>
          <h1 className="text-4xl md:text-5xl font-headline font-extrabold text-white tracking-tighter leading-tight mb-4">
            U.S. Government Benefits,
            <br />
            <span className="text-primary-container italic">Explained Clearly.</span>
          </h1>
          <p className="text-white/75 text-lg max-w-2xl mb-8 font-body leading-relaxed">
            A plain-language guide to 10 major federal aid programs — who qualifies,
            how to apply, and where to go next.
          </p>

          {/* Disclaimer */}
          <div className="inline-flex items-start gap-2.5 bg-white/10 border border-white/20 rounded-xl px-5 py-3.5 max-w-xl">
            <span className="material-symbols-outlined text-white/70 text-base mt-0.5 shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              info
            </span>
            <p className="text-sm text-white/70 font-body leading-snug">
              <span className="font-semibold text-white/90">Important:</span> This guide is for
              navigation and preparation. The official application must still be completed
              through the relevant government portal or state office.
            </p>
          </div>
        </div>
      </section>

      {/* ── Search + Filters ── */}
      <div className="sticky top-20 z-30 bg-white/90 backdrop-blur-xl border-b border-[var(--outline-variant)]/20 shadow-editorial">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search input */}
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search programs…"
              className="w-full pl-10 pr-4 py-2.5 rounded-full border border-[var(--outline-variant)]/40 bg-[var(--surface-container-low)] text-sm font-body text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition"
            />
          </div>

          {/* Category pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-bold font-headline transition-all",
                  activeCategory === cat
                    ? "bg-primary text-[var(--on-primary)] shadow-sm"
                    : "bg-[var(--surface-container)] text-on-surface-variant hover:bg-secondary-container hover:text-[var(--on-secondary-container)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <span className="text-xs text-on-surface-variant font-body sm:ml-auto shrink-0">
            {filtered.length} program{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Program Grid ── */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-4 block">
              search_off
            </span>
            <p className="font-headline font-bold text-on-surface text-lg">No programs found</p>
            <p className="text-on-surface-variant text-sm mt-1 font-body">
              Try a different search term or category.
            </p>
            <button
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
              className="mt-4 text-sm text-primary font-semibold hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-5">
              {filtered.map((program) => (
                <ProgramCard key={program.id} program={program} />
              ))}
            </div>

            <div className="hidden md:grid md:grid-cols-2 gap-5 items-start">
              <div className="space-y-5">
                {leftColumnPrograms.map((program) => (
                  <ProgramCard key={program.id} program={program} />
                ))}
              </div>

              <div className="space-y-5">
                {rightColumnPrograms.map((program) => (
                  <ProgramCard key={program.id} program={program} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── AI CTA Banner ── */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="bg-primary p-8 md:p-10 rounded-xl text-[var(--on-primary)] flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group">
          <div className="z-10">
            <span className="material-symbols-outlined text-3xl mb-4 block"
              style={{ fontVariationSettings: "'FILL' 1" }}>
              auto_awesome
            </span>
            <h3 className="text-2xl font-headline font-bold mb-1">Not sure where to start?</h3>
            <p className="text-white/75 font-body text-sm max-w-md">
              Describe your situation and our AI will match you with the programs most likely to help — and walk you through the next steps.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => navigate("/results", { state: { initialMessage: "What government aid programs might I be eligible for? I'd like help figuring out where to start." } })}
            className="shrink-0 bg-white/15 hover:bg-white/25 text-white font-headline font-bold rounded-full px-8 border border-white/20 z-10"
          >
            Chat with our AI
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[8rem]">policy</span>
          </div>
        </div>
      </section>

      {/* ── Footer note ── */}
      <div className="border-t border-[var(--outline-variant)]/20 bg-[var(--surface-container-low)]">
        <div className="max-w-5xl mx-auto px-6 py-5 text-center text-xs text-on-surface-variant font-body">
          This guide is a practical overview based on official government sources available as of March 18, 2026.
          Program rules, income thresholds, and state procedures can change. Always verify details at the official portal.
        </div>
      </div>
    </div>
  );
};

export default BenefitsGuidePage;

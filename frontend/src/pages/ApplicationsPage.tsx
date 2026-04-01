import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getStoredUser } from "@/utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type CatalogApplication = {
  applicationId: number;
  applicationName: string;
  category: string;
  description: string;
  qualificationSummary: string | null;
  officialUrl: string;
  steps: string[];
};

type UserApplicationDetail = {
  userApplicationId: number;
  status: string;
  dateStarted: string;
  lastUpdated: string;
  applicationId: number;
  applicationName: string;
  category: string;
  description: string;
  qualificationSummary: string | null;
  officialUrl: string;
  steps: string[];
  stepsCompleted: boolean[];
};

function progressValue(stepsCompleted: boolean[]): number {
  if (stepsCompleted.length === 0) return 0;
  const done = stepsCompleted.filter(Boolean).length;
  return Math.round((done / stepsCompleted.length) * 100);
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Track + fill colors: neutral track with green fill until 100%, then the entire bar is green. */
function applicationProgressClasses(pct: number) {
  const isDone = pct >= 100;
  return {
    root: isDone ? "bg-emerald-600" : "bg-slate-200/90 dark:bg-slate-700/50",
    indicator: isDone ? "bg-emerald-600" : "bg-emerald-500",
  };
}

const ApplicationsPage = () => {
  const user = getStoredUser();
  const clientId = user?.clientId;

  const [catalog, setCatalog] = useState<CatalogApplication[]>([]);
  const [userApps, setUserApps] = useState<UserApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [openCards, setOpenCards] = useState<Record<number, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<UserApplicationDetail | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const catRes = await fetch(`${API_BASE_URL}/api/applications`);
      if (!catRes.ok) throw new Error("Could not load application types.");
      const catJson = (await catRes.json()) as CatalogApplication[];
      setCatalog(catJson);

      if (clientId) {
        const listRes = await fetch(`${API_BASE_URL}/api/clients/${clientId}/user-applications`);
        if (!listRes.ok) throw new Error("Could not load your applications.");
        const listJson = (await listRes.json()) as UserApplicationDetail[];
        setUserApps(listJson);
        setOpenCards((prev) => {
          const next = { ...prev };
          for (const row of listJson) {
            if (next[row.userApplicationId] === undefined) {
              next[row.userApplicationId] = true;
            }
          }
          return next;
        });
      } else {
        setUserApps([]);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const takenApplicationIds = useMemo(
    () => new Set(userApps.map((u) => u.applicationId)),
    [userApps],
  );

  const availableCatalog = useMemo(
    () => catalog.filter((c) => !takenApplicationIds.has(c.applicationId)),
    [catalog, takenApplicationIds],
  );

  async function handleAddApplication(applicationId: number) {
    if (!clientId) {
      toast.info("Sign in to add applications to your list.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}/user-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Could not add application.");
        return;
      }
      const created = data as UserApplicationDetail;
      setUserApps((prev) => [created, ...prev.filter((p) => p.userApplicationId !== created.userApplicationId)]);
      setOpenCards((prev) => ({ ...prev, [created.userApplicationId]: true }));
      toast.success(`${created.applicationName} added to your list.`);
    } catch {
      toast.error("Network error. Is the backend running?");
    }
  }

  async function patchSteps(row: UserApplicationDetail, nextCompleted: boolean[]) {
    if (!clientId) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/clients/${clientId}/user-applications/${row.userApplicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepsCompleted: nextCompleted }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Could not save progress.");
        return;
      }
      const updated = data as UserApplicationDetail;
      setUserApps((prev) => prev.map((p) => (p.userApplicationId === updated.userApplicationId ? updated : p)));
    } catch {
      toast.error("Network error while saving.");
    }
  }

  function onToggleStep(row: UserApplicationDetail, index: number, checked: boolean) {
    if (row.status === "completed") return;
    const next = [...row.stepsCompleted];
    if (index >= next.length) return;
    next[index] = checked;
    void patchSteps(row, next);
  }

  async function handleMarkComplete(row: UserApplicationDetail) {
    if (!clientId) return;
    setCompletingId(row.userApplicationId);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/clients/${clientId}/user-applications/${row.userApplicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Could not complete application.");
        return;
      }
      const updated = data as UserApplicationDetail;
      setUserApps((prev) => prev.map((p) => (p.userApplicationId === updated.userApplicationId ? updated : p)));
      toast.success("Application marked complete.");
    } catch {
      toast.error("Network error.");
    } finally {
      setCompletingId(null);
    }
  }

  async function confirmDelete() {
    if (!clientId || !deleteTarget) return;
    const id = deleteTarget.userApplicationId;
    try {
      const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}/user-applications/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data?.error === "string" ? data.error : "Could not remove application.");
        return;
      }
      setUserApps((prev) => prev.filter((p) => p.userApplicationId !== id));
      setDeleteTarget(null);
      toast.success("Application removed from your list.");
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="flex-1 flex flex-col gap-8 max-w-3xl mx-auto w-full px-5 py-6">
      {!clientId && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-700 font-body">
          You’re viewing this page without an account.{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>{" "}
          to add applications and save your progress.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 font-headline tracking-tight">Applications</h1>
          <p className="text-slate-600 font-body mt-2 text-sm md:text-base">
            Track official benefit applications step by step. Use the government links when you are ready to apply.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="rounded-full font-headline font-bold shrink-0"
              disabled={loading || availableCatalog.length === 0 || !clientId}
              title={!clientId ? "Sign in to add applications" : undefined}
            >
              New Application
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto w-[min(100vw-2rem,20rem)]">
            {availableCatalog.map((c) => (
              <DropdownMenuItem key={c.applicationId} onSelect={() => void handleAddApplication(c.applicationId)}>
                <span className="font-medium">{c.applicationName}</span>
                <span className="text-slate-500 text-xs ml-2">({c.category})</span>
              </DropdownMenuItem>
            ))}
            {availableCatalog.length === 0 && !loading && (
              <div className="px-2 py-3 text-sm text-muted-foreground">All application types are already on your list.</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loadError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && userApps.length === 0 && !loadError && (
        <Card className="border-border shadow-sm">
          <CardContent className="p-8 text-center text-slate-600 font-body">
            {!clientId ? (
              <>
                <strong className="text-foreground">Sign in</strong> to add applications from the menu above and track your
                progress here.
              </>
            ) : (
              <>
                You have no active applications yet. Choose <strong className="text-foreground">New Application</strong> to get
                started.
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {userApps.map((row) => {
          const pct = progressValue(row.stepsCompleted);
          const allDone = row.stepsCompleted.length > 0 && row.stepsCompleted.every(Boolean);
          const canMarkComplete = allDone && row.status !== "completed";
          const progressColors = applicationProgressClasses(pct);
          const isOpen = openCards[row.userApplicationId] ?? true;

          return (
            <Collapsible
              key={row.userApplicationId}
              open={isOpen}
              onOpenChange={(open) => setOpenCards((prev) => ({ ...prev, [row.userApplicationId]: open }))}
            >
              <Card className="border-border shadow-sm overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/40 bg-[var(--surface-container-low)]/50">
                  <div className="flex gap-3 items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full min-w-0 gap-3 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-container/40"
                          aria-expanded={isOpen}
                        >
                          <ChevronDown
                            className={cn("h-5 w-5 shrink-0 mt-0.5 text-slate-500 transition-transform", isOpen && "rotate-180")}
                          />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg md:text-xl font-bold text-blue-900 font-headline tracking-tight">
                                {row.applicationName}
                              </h2>
                              {row.status === "completed" && (
                                <Badge className="bg-success text-success-foreground font-headline">Completed</Badge>
                              )}
                              {row.status === "active" && (
                                <Badge variant="secondary" className="font-headline">
                                  Active
                                </Badge>
                              )}
                              {row.status !== "completed" && row.status !== "active" && (
                                <Badge variant="outline" className="font-headline">
                                  {formatStatusLabel(row.status)}
                                </Badge>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-500 font-body">
                                <span>Progress</span>
                                <span>
                                  {row.stepsCompleted.filter(Boolean).length} / {row.stepsCompleted.length} steps
                                </span>
                              </div>
                              <Progress
                                value={pct}
                                className={cn("h-2.5", progressColors.root)}
                                indicatorClassName={progressColors.indicator}
                              />
                            </div>
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      {canMarkComplete && (
                        <Button
                          type="button"
                          className="ml-8 w-full rounded-full font-headline font-bold sm:w-auto"
                          disabled={completingId === row.userApplicationId}
                          onClick={() => void handleMarkComplete(row)}
                        >
                          {completingId === row.userApplicationId ? "Saving…" : "Mark Application as Complete"}
                        </Button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-slate-500 hover:text-destructive"
                      aria-label={`Remove ${row.applicationName}`}
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                <CollapsibleContent>
                  <CardContent className="p-4 md:p-5 space-y-5 font-body">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Category</p>
                      <p className="text-slate-800">{row.category}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Description</p>
                      <p className="text-slate-700 leading-relaxed">{row.description}</p>
                    </div>
                    {row.qualificationSummary ? (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Qualification summary</p>
                        <p className="text-slate-700 leading-relaxed">{row.qualificationSummary}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">Official application</p>
                      <a
                        href={row.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline"
                      >
                        Open government site
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Steps</p>
                      <ul className="space-y-3">
                        {row.steps.map((step, index) => (
                          <li key={`${row.userApplicationId}-step-${index}`} className="flex gap-3 items-start">
                            <Checkbox
                              id={`step-${row.userApplicationId}-${index}`}
                              checked={Boolean(row.stepsCompleted[index])}
                              disabled={row.status === "completed"}
                              onCheckedChange={(v) => onToggleStep(row, index, v === true)}
                              className="mt-1"
                            />
                            <Label
                              htmlFor={`step-${row.userApplicationId}-${index}`}
                              className={cn(
                                "text-sm leading-snug cursor-pointer font-normal",
                                row.stepsCompleted[index] ? "text-slate-600 line-through" : "text-slate-800",
                              )}
                            >
                              {step}
                            </Label>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-headline">Remove this application?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.applicationName}” will disappear from this page. You can add it again later from New Application.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ApplicationsPage;

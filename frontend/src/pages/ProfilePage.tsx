import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { User, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearStoredUser, getStoredUser } from "@/utils/auth";
import { getStoredUser, setStoredUser } from "@/utils/auth";
import type { AuthUser } from "@/utils/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

const EMPLOYMENT_OPTIONS = [
  "Employed full-time",
  "Part-time",
  "Self-employed",
  "Unemployed",
  "Student",
  "Retired",
  "Unable to work",
];

const HOUSING_OPTIONS = [
  "Homeowner",
  "Renter",
  "Homeless / Unhoused",
  "Temporary shelter",
  "Living with family or friends",
];

const DISABILITY_OPTIONS = [
  "No disability reported",
  "Physical disability",
  "Mental health disability",
  "Multiple disabilities",
];

const VETERAN_OPTIONS = [
  "Not a veteran",
  "Active duty",
  "Veteran",
  "Disabled veteran",
];

type Application = {
  app_id: number;
  date_submitted: string | null;
  status: string;
  last_updated: string | null;
  program_name: string;
  description_plain_language: string | null;
};

type ClientProfile = {
  client_id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  householdSize: number | null;
  income: number | null;
  employmentStatus: string | null;
  housingStatus: string | null;
  disabilityStatus: string | null;
  veteranStatus: string | null;
};

type PersonalFormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  city: string;
  state: string;
  zipCode: string;
};

const EMPTY_PERSONAL_FORM: PersonalFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  dateOfBirth: "",
  city: "",
  state: "",
  zipCode: "",
};

function dateOfBirthToInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function personalFromClient(profile: ClientProfile): PersonalFormValues {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    phone: profile.phone ?? "",
    dateOfBirth: dateOfBirthToInputValue(profile.dateOfBirth ?? undefined),
    city: profile.city ?? "",
    state: profile.state ?? "",
    zipCode: profile.zipCode ?? "",
  };
}

function getPersonalForSave(clientProfile: ClientProfile | null, user: AuthUser | null): PersonalFormValues {
  if (clientProfile) return personalFromClient(clientProfile);
  return {
    ...EMPTY_PERSONAL_FORM,
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
  };
}

function getAccountEmail(clientProfile: ClientProfile | null, user: AuthUser | null): string {
  return (clientProfile?.email ?? user?.email ?? "").trim();
}

/** Eligibility as last loaded from the server. Personal-only saves avoid overwriting DB with draft `form`. */
function eligibilityFormFromStoredProfile(profile: ClientProfile | null, fallback: FormValues): FormValues {
  if (!profile) return fallback;
  return {
    householdSize: profile.householdSize != null ? String(profile.householdSize) : "",
    income: profile.income != null ? String(profile.income) : "",
    employmentStatus: profile.employmentStatus ?? "",
    housingStatus: profile.housingStatus ?? "",
    disabilityStatus: profile.disabilityStatus ?? "",
    veteranStatus: profile.veteranStatus ?? "",
  };
}

function eligibilitySnapshotToProfileFields(e: FormValues) {
  return {
    householdSize: e.householdSize ? Number(e.householdSize) : null,
    income: e.income ? Number(e.income) : null,
    employmentStatus: e.employmentStatus || null,
    housingStatus: e.housingStatus || null,
    disabilityStatus: e.disabilityStatus || null,
    veteranStatus: e.veteranStatus || null,
  };
}

function buildProfilePostBody(personal: PersonalFormValues, eligibility: FormValues, accountEmail: string) {
  const email = accountEmail.trim().toLowerCase();
  return {
    first_name: personal.firstName.trim(),
    last_name: personal.lastName.trim(),
    email,
    phone: personal.phone.trim() || null,
    date_of_birth: personal.dateOfBirth.trim() || null,
    city: personal.city.trim() || null,
    state: personal.state.trim() || null,
    zip_code: personal.zipCode.trim() || null,
    household_size: eligibility.householdSize ? Number(eligibility.householdSize) : null,
    income: eligibility.income ? Number(eligibility.income) : null,
    employment_status: eligibility.employmentStatus || null,
    housing_status: eligibility.housingStatus || null,
    disability_status: eligibility.disabilityStatus || null,
    veteran_status: eligibility.veteranStatus || null,
  };
}

type ProfileResponse = {
  client: ClientProfile;
  applications: Application[];
};

const statusStyles: Record<string, string> = {
  approved: "bg-success text-success-foreground",
  pending: "bg-warning text-warning-foreground",
  waitlist: "bg-neutral text-neutral-foreground",
  denied: "bg-destructive text-destructive-foreground",
};

const formatStatus = (status: string) =>
  status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

const formatDate = (dateString: string | null) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString();
};

const inputClass =
  "w-full h-11 rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] px-4 text-on-surface text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary-container/40 transition-all";

const inputReadOnlyClass =
  "w-full h-11 rounded-xl border border-[var(--outline-variant)]/30 bg-muted/40 px-4 text-on-surface text-sm font-body cursor-not-allowed text-muted-foreground";

type FormValues = {
  householdSize: string;
  income: string;
  employmentStatus: string;
  housingStatus: string;
  disabilityStatus: string;
  veteranStatus: string;
};

const EMPTY_FORM: FormValues = {
  householdSize: "",
  income: "",
  employmentStatus: "",
  housingStatus: "",
  disabilityStatus: "",
  veteranStatus: "",
};

const ProfilePage = () => {
  const user = getStoredUser();
  const clientId = user?.clientId;
  const navigate = useNavigate();

  useEffect(() => {
    if (!clientId) {
      navigate("/login", { replace: true });
    }
  }, [clientId, navigate]);

  const [applications, setApplications] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState("");

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);

  const [personalEditOpen, setPersonalEditOpen] = useState(false);
  const [personalForm, setPersonalForm] = useState<PersonalFormValues>(EMPTY_PERSONAL_FORM);
  const [personalSaveError, setPersonalSaveError] = useState("");
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalSaved, setPersonalSaved] = useState(false);

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const initialValues = useRef<FormValues>(EMPTY_FORM);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isDirty =
    form.householdSize !== initialValues.current.householdSize ||
    form.income !== initialValues.current.income ||
    form.employmentStatus !== initialValues.current.employmentStatus ||
    form.housingStatus !== initialValues.current.housingStatus ||
    form.disabilityStatus !== initialValues.current.disabilityStatus ||
    form.veteranStatus !== initialValues.current.veteranStatus;

  useEffect(() => {
    if (!clientId) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}/profile`);
        if (!res.ok) throw new Error("Failed to load profile data.");
        const data = (await res.json()) as ProfileResponse;
        setApplications(data.applications ?? []);
        const profile = data.client;
        if (profile) {
          setClientProfile(profile);
          const loaded: FormValues = {
            householdSize: profile.householdSize != null ? String(profile.householdSize) : "",
            income: profile.income != null ? String(profile.income) : "",
            employmentStatus: profile.employmentStatus ?? "",
            housingStatus: profile.housingStatus ?? "",
            disabilityStatus: profile.disabilityStatus ?? "",
            veteranStatus: profile.veteranStatus ?? "",
          };
          setForm(loaded);
          initialValues.current = loaded;
        }
      } catch (err) {
        setAppsError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setAppsLoading(false);
      }
    };
    fetchProfile();
  }, [clientId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);
    setSaved(false);

    try {
      const accountEmail = getAccountEmail(clientProfile, user);
      if (!accountEmail) {
        setSaveError("Please log in before saving your eligibility profile.");
        return;
      }

      const personal = getPersonalForSave(clientProfile, user);
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProfilePostBody(personal, form, accountEmail)),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data?.error || "Failed to save. Please try again.");
        return;
      }
      initialValues.current = { ...form };
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Network error. Is the backend running?");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteAccount() {
    if (!clientId) return;

    setDeleteError("");
    setDeleting(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        let errorMessage = "Failed to delete account. Please try again.";
        try {
          const data = await res.json();
          if (data?.error) errorMessage = data.error;
        } catch {
          // Ignore JSON parse failures and keep fallback error message.
        }
        setDeleteDialogOpen(false);
        setDeleteError(errorMessage);
        return;
      }

      clearStoredUser();
      window.location.replace("/");
    } catch {
      setDeleteDialogOpen(false);
      setDeleteError("Network error. Is the backend running?");
    } finally {
      setDeleting(false);
    }
  }

  function openPersonalEdit() {
    setPersonalForm(clientProfile ? personalFromClient(clientProfile) : getPersonalForSave(null, user));
    setPersonalSaveError("");
    setPersonalEditOpen(true);
  }

  function closePersonalEdit() {
    setPersonalEditOpen(false);
    setPersonalSaveError("");
  }

  async function handlePersonalSave(e: React.FormEvent) {
    e.preventDefault();
    setPersonalSaveError("");
    setPersonalSaved(false);

    const accountEmail = getAccountEmail(clientProfile, user);
    if (!accountEmail) {
      setPersonalSaveError("Could not determine your account email.");
      return;
    }
    if (!personalForm.firstName.trim() || !personalForm.lastName.trim()) {
      setPersonalSaveError("First and last name are required.");
      return;
    }
    if (!clientId) return;

    setPersonalSaving(true);
    try {
      const eligibilityForPost = eligibilityFormFromStoredProfile(clientProfile, form);
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildProfilePostBody(personalForm, eligibilityForPost, accountEmail)),
      });

      const data = (await res.json()) as { error?: string; user?: { user_id: number; first_name: string; last_name: string; email: string } };
      if (!res.ok) {
        setPersonalSaveError(data?.error || "Failed to save. Please try again.");
        return;
      }

      const row = data.user;
      if (row && clientId) {
        setStoredUser({
          clientId,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
        });
      }

      const phoneVal = personalForm.phone.trim() || null;
      const dobVal = personalForm.dateOfBirth.trim() || null;
      const cityVal = personalForm.city.trim() || null;
      const stateVal = personalForm.state.trim() || null;
      const zipVal = personalForm.zipCode.trim() || null;

      setClientProfile((prev) => {
        const eligibilityPersisted = eligibilitySnapshotToProfileFields(eligibilityForPost);
        if (prev) {
          return {
            ...prev,
            ...eligibilityPersisted,
            firstName: row?.first_name ?? personalForm.firstName.trim(),
            lastName: row?.last_name ?? personalForm.lastName.trim(),
            email: row?.email ?? accountEmail,
            phone: phoneVal,
            dateOfBirth: dobVal,
            city: cityVal,
            state: stateVal,
            zipCode: zipVal,
          };
        }
        return {
          client_id: clientId,
          firstName: row?.first_name ?? personalForm.firstName.trim(),
          lastName: row?.last_name ?? personalForm.lastName.trim(),
          email: row?.email ?? accountEmail,
          phone: phoneVal,
          dateOfBirth: dobVal,
          city: cityVal,
          state: stateVal,
          zipCode: zipVal,
          ...eligibilityPersisted,
        };
      });

      setPersonalSaved(true);
      setTimeout(() => setPersonalSaved(false), 3000);
    } catch {
      setPersonalSaveError("Network error. Is the backend running?");
    } finally {
      setPersonalSaving(false);
    }
  }

  const displayName =
    (clientProfile
      ? `${clientProfile.firstName ?? ""} ${clientProfile.lastName ?? ""}`.trim()
      : user
        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
        : "") || "Your Profile";
  const displayEmail = clientProfile?.email ?? user?.email ?? "";
  const personalPanelEmail = displayEmail;

  return (
    <div className="flex-1 flex flex-col px-5 py-6 gap-6 max-w-3xl mx-auto w-full">

      {/* User Info */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <div className="flex gap-4 items-start">
            <Avatar className="w-16 h-16 bg-primary/10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary">
                <User className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                    {displayName}
                  </h1>
                  {displayEmail && (
                    <div className="flex items-center gap-2 mt-2 text-sm sm:text-base text-muted-foreground">
                      <Mail className="w-4 h-4 shrink-0" />
                      <span className="truncate">{displayEmail}</span>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => (personalEditOpen ? closePersonalEdit() : openPersonalEdit())}
                >
                  {personalEditOpen ? "Close" : "Edit"}
                </Button>
              </div>

              {personalEditOpen && (
                <Card className="border-border shadow-sm">
                  <CardContent className="p-6">
                    <h2 className="font-display text-base font-semibold text-foreground mb-4">Personal information</h2>
                    <form onSubmit={handlePersonalSave} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-first-name">
                            First name
                          </label>
                          <input
                            id="profile-first-name"
                            value={personalForm.firstName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, firstName: e.target.value }))}
                            className={inputClass}
                            autoComplete="given-name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-last-name">
                            Last name
                          </label>
                          <input
                            id="profile-last-name"
                            value={personalForm.lastName}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, lastName: e.target.value }))}
                            className={inputClass}
                            autoComplete="family-name"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-email-readonly">
                            Email
                          </label>
                          <input
                            id="profile-email-readonly"
                            type="email"
                            readOnly
                            aria-readonly="true"
                            title="Email cannot be changed here. Contact support if you need to update your sign-in email."
                            value={personalPanelEmail}
                            className={inputReadOnlyClass}
                          />
                          <p className="text-xs text-muted-foreground">
                            This is the email for your account. It cannot be edited on this page.
                          </p>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-phone">
                            Phone
                          </label>
                          <input
                            id="profile-phone"
                            type="tel"
                            value={personalForm.phone}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, phone: e.target.value }))}
                            className={inputClass}
                            autoComplete="tel"
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-dob">
                            Date of birth
                          </label>
                          <input
                            id="profile-dob"
                            type="date"
                            value={personalForm.dateOfBirth}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-city">
                            City
                          </label>
                          <input
                            id="profile-city"
                            value={personalForm.city}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, city: e.target.value }))}
                            className={inputClass}
                            autoComplete="address-level2"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-state">
                            State
                          </label>
                          <input
                            id="profile-state"
                            value={personalForm.state}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, state: e.target.value }))}
                            className={inputClass}
                            autoComplete="address-level1"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-semibold text-foreground" htmlFor="profile-zip">
                            ZIP code
                          </label>
                          <input
                            id="profile-zip"
                            value={personalForm.zipCode}
                            onChange={(e) => setPersonalForm((f) => ({ ...f, zipCode: e.target.value }))}
                            className={inputClass}
                            autoComplete="postal-code"
                          />
                        </div>
                      </div>

                      {personalSaveError && (
                        <p className="text-sm text-destructive font-medium" role="alert">
                          {personalSaveError}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="submit"
                          disabled={personalSaving}
                          className="px-6 py-2.5 rounded-full bg-primary text-[var(--on-primary)] font-headline font-bold text-sm hover:bg-primary-dim transition-all disabled:opacity-50"
                        >
                          {personalSaving ? "Saving..." : "Save"}
                        </button>
                        {personalSaved && (
                          <span className="text-sm text-green-600 font-medium">Saved!</span>
                        )}
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Eligibility Profile */}
      <Card className="border-border shadow-sm">
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-1">
            Eligibility Profile
          </h2>
          <p className="text-xs text-muted-foreground mb-5">
            Used to match you with programs you qualify for.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Household Size</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.householdSize}
                  onChange={(e) => setForm((f) => ({ ...f, householdSize: e.target.value }))}
                  placeholder="e.g. 3"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Annual Income ($)</label>
                <input
                  type="number"
                  min={0}
                  value={form.income}
                  onChange={(e) => setForm((f) => ({ ...f, income: e.target.value }))}
                  placeholder="e.g. 35000"
                  className={inputClass}
                />
              </div>
            </div>

            {[
              { label: "Employment Status", key: "employmentStatus" as const, options: EMPLOYMENT_OPTIONS },
              { label: "Housing Status", key: "housingStatus" as const, options: HOUSING_OPTIONS },
              { label: "Disability Status", key: "disabilityStatus" as const, options: DISABILITY_OPTIONS },
              { label: "Veteran Status", key: "veteranStatus" as const, options: VETERAN_OPTIONS },
            ].map(({ label, key, options }) => (
              <div key={label} className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">{label}</label>
                <select
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}

            {saveError && (
              <p className="text-sm text-destructive font-medium" role="alert">{saveError}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              {isDirty && (
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-full bg-primary text-[var(--on-primary)] font-headline font-bold text-sm hover:bg-primary-dim transition-all disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save profile"}
                </button>
              )}
              {saved && (
                <span className="text-sm text-green-600 font-medium">Saved!</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Applications */}
      <section>
        <h2 className="font-display text-lg font-semibold text-foreground mb-3">
          Your Applications
        </h2>

        {appsLoading && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Loading applications...
            </CardContent>
          </Card>
        )}

        {!appsLoading && appsError && (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">{appsError}</CardContent>
          </Card>
        )}

        {!appsLoading && !appsError && applications.length === 0 && (
          <Card>
            <CardContent className="p-8 flex flex-col items-center text-center">
              <span className="material-symbols-outlined text-4xl text-muted-foreground/40 mb-3">assignment</span>
              <p className="font-medium text-foreground mb-1">No applications yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Once you apply to aid programs, your applications and their status will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {!appsLoading && !appsError && applications.length > 0 && (
          <div className="flex flex-col gap-3">
            {applications.map((app) => {
              const normalizedStatus = app.status.toLowerCase();
              return (
                <Card key={app.app_id} className="border-border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="font-medium text-foreground text-sm sm:text-base">
                        {app.program_name}
                      </p>
                      <Badge
                        className={cn(
                          "text-[11px] capitalize",
                          statusStyles[normalizedStatus] || "bg-muted text-muted-foreground"
                        )}
                      >
                        {formatStatus(app.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {app.description_plain_language || "No description available."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Submitted: {formatDate(app.date_submitted)}</span>
                      <span>Updated: {formatDate(app.last_updated)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card className="border-destructive/40 shadow-sm">
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Delete Account</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Permanently removes all data connected to your account.
          </p>
          {deleteError && (
            <p className="text-sm text-destructive font-medium mt-3" role="alert">
              {deleteError}
            </p>
          )}
          <div className="pt-4">
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setDeleteDialogOpen(true);
              }}
              disabled={deleting}
              className="px-6 py-2.5 rounded-full bg-destructive text-destructive-foreground font-headline font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              Delete account
            </button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes your profile, applications, and chat history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteAccount();
              }}
            >
              {deleting ? "Deleting..." : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProfilePage;

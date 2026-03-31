import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { setStoredUser } from "@/utils/auth";
import { getGuestConversations, clearGuestConversations } from "@/utils/guestChat";

type LoginResponse =
  | {
      ok: true;
      user: {
        clientId: number;
        firstName: string | null;
        lastName: string | null;
        email: string;
      };
    }
  | { error: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSignupMode = useMemo(() => location.pathname === "/signup", [location.pathname]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignupMode ? "/api/auth/signup" : "/api/auth/login";
      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      let data: LoginResponse | undefined = undefined;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        const message =
          (data as any)?.error ||
          (res.status === 401
            ? "Invalid email or password."
            : isSignupMode
              ? "Sign up failed. Please try again."
              : "Login failed. Please try again.");
        setError(message);
        return;
      }

      const newUser = (data as any)?.user;
      if (newUser) {
        setStoredUser(newUser);
      }

      // On signup, migrate any guest conversations to the new account
      if (isSignupMode && newUser?.clientId) {
        const guestConvs = getGuestConversations();
        if (guestConvs.length > 0) {
          for (const conv of guestConvs) {
            if (conv.messages.length === 0) continue;
            try {
              const sessionRes = await fetch(`${API_BASE_URL}/api/clients/${newUser.clientId}/sessions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
              });
              if (!sessionRes.ok) continue;
              const session = await sessionRes.json();
              await fetch(`${API_BASE_URL}/api/sessions/${session.session_id}/import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: conv.messages.map((m) => ({
                    sender_type: m.role,
                    message_text: m.content,
                  })),
                }),
              });
            } catch {
              // Migration errors are non-fatal — continue
            }
          }
          clearGuestConversations();
        }
      }

      navigate("/results");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold font-headline tracking-tight text-on-surface mb-2">
            {isSignupMode ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-on-surface-variant font-body">
            {isSignupMode
              ? "Sign up to save your chat history and continue conversations anytime."
              : "Login to access your NavigAid dashboard."}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-full bg-[var(--surface-container-low)] p-1">
          <Link
            to="/login"
            className={`text-center rounded-full py-2 text-sm font-semibold transition-colors ${
              !isSignupMode
                ? "bg-[var(--surface-container-lowest)] text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Login
          </Link>
          <Link
            to="/signup"
            className={`text-center rounded-full py-2 text-sm font-semibold transition-colors ${
              isSignupMode
                ? "bg-[var(--surface-container-lowest)] text-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Sign Up
          </Link>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-[var(--surface-container-lowest)] rounded-xl p-8 editorial-shadow space-y-5"
        >
          {isSignupMode && (
            <>
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-semibold text-on-surface font-label">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="w-full h-12 rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] px-4 text-on-surface text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary-container/40 transition-all"
                  placeholder="Jane"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-semibold text-on-surface font-label">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="w-full h-12 rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] px-4 text-on-surface text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary-container/40 transition-all"
                  placeholder="Doe"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-semibold text-on-surface font-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full h-12 rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] px-4 text-on-surface text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary-container/40 transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-semibold text-on-surface font-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={isSignupMode ? "new-password" : "current-password"}
              className="w-full h-12 rounded-xl border border-[var(--outline-variant)]/30 bg-[var(--surface-container-low)] px-4 text-on-surface text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary-container/40 transition-all"
              placeholder={isSignupMode ? "Create a password (8+ characters)" : "Enter your password"}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full bg-primary text-[var(--on-primary)] font-headline font-bold shadow-lg shadow-primary/20 hover:bg-primary-dim transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (isSignupMode ? "Creating account..." : "Logging in...") : (isSignupMode ? "Create Account" : "Login")}
          </button>

          {error && (
            <p className="text-sm text-error font-medium text-center" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <p className="text-sm text-on-surface-variant text-center">
            {isSignupMode ? "Already have an account? " : "Need an account? "}
            <Link
              to={isSignupMode ? "/login" : "/signup"}
              className="text-primary font-semibold hover:underline"
            >
              {isSignupMode ? "Login" : "Create one"}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

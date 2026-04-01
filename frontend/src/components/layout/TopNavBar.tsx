import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/Logo.png";
import LogoutButton from "@/components/layout/LogoutButton";
import { getStoredUser } from "@/utils/auth";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/benefits", label: "Benefits Guide" },
  { to: "/results", label: "Chat" },
  { to: "/applications", label: "Applications" },
  { to: "/profile", label: "Profile" },
] as const;

const TopNavBar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = getStoredUser(); // ✅ added

  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 md:px-12 h-20 bg-white/80 backdrop-blur-xl shadow-editorial">
      <Link to="/" className="flex items-center gap-2.5 text-xl font-extrabold font-headline tracking-tight">
        <img src={logo} alt="NavigAid" className="w-8 h-8 rounded-lg object-contain" />
        <span>
          <span className="text-primary-container">Navig</span>
          <span className="text-primary">Aid</span>
        </span>
      </Link>

      <div className="hidden md:flex items-center space-x-8">
        {navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`font-headline font-bold tracking-tight transition-colors ${
              location.pathname === link.to
                ? "text-primary"
                : "text-slate-500 hover:text-blue-600"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* ✅ UPDATED SECTION */}
      <div className="flex items-center space-x-4">
        {user ? (
          <LogoutButton />
        ) : (
          <>
            <Link
              to="/signup"
              className="hidden md:inline-flex items-center px-5 py-2 rounded-full border border-primary/20 text-primary font-headline font-bold text-sm hover:bg-primary/5 transition-all"
            >
              Sign Up
            </Link>
            <Link
              to="/login"
              className="hidden md:inline-flex items-center px-5 py-2 rounded-full bg-primary text-[var(--on-primary)] font-headline font-bold text-sm hover:bg-primary-dim transition-all"
            >
              Login
            </Link>
          </>
        )}

        <button
          className="md:hidden p-2 text-slate-500 hover:text-blue-600 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute top-20 left-0 right-0 bg-white border-b border-slate-200 shadow-lg md:hidden z-50">
          <div className="flex flex-col p-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className={`px-4 py-3 rounded-xl font-headline font-bold transition-colors ${
                  location.pathname === link.to
                    ? "bg-blue-50 text-primary"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {user ? (
  <div className="px-4 py-3">
    <LogoutButton />
  </div>
) : (
<>
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="px-4 py-3 rounded-xl font-headline font-bold text-primary hover:bg-blue-50 transition-colors"
            >
              Login
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="px-4 py-3 rounded-xl font-headline font-bold text-primary hover:bg-blue-50 transition-colors"
            >
              Sign Up
            </Link>
          </>
        )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default TopNavBar;
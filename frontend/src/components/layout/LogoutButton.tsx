import { useNavigate } from "react-router-dom";
import { clearStoredUser } from "@/utils/auth";

export default function LogoutButton() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearStoredUser();
    navigate("/login");
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-lg border border-red-500 text-red-500 bg-transparent hover:bg-red-50 transition"
    >
      Logout
    </button>
  );
}
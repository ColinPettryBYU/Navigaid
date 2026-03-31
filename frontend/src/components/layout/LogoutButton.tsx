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
      className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition"
    >
      Logout
    </button>
  );
}
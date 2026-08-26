// Top-level routes: public auth pages, plus a protected home
// route. Owners see the dashboard; clients get a placeholder
// for now until we build the client-facing portal.
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";
import ClientPortal from "./pages/ClientPortal.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center
        justify-center text-gray-500"
      >
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route
        path="/clients/:clientId"
        element={user ? <ClientDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.role === "owner" ? (
            <OwnerDashboard />
          ) : (
            <ClientPortal />
          )
        }
      />
    </Routes>
  );
}

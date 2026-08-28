// Top-level routes: public landing page, auth pages, plus
// protected routes. Owners see the dashboard; clients see the
// client portal.
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";
import ClientPortal from "./pages/ClientPortal.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Landing from "./pages/Landing.jsx";

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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          !user ? (
            <Landing />
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

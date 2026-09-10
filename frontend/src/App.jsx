// Top-level routes: public landing page, auth pages, plus
// protected routes. Owners and staff see the dashboard; clients
// see the client portal.
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "./lib/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";
import ClientPortal from "./pages/ClientPortal.jsx";
import AcceptInvite from "./pages/AcceptInvite.jsx";
import AcceptTeamInvite from "./pages/AcceptTeamInvite.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Landing from "./pages/Landing.jsx";
import Booking from "./pages/Booking.jsx";
import Account from "./pages/Account.jsx";

export default function App() {
  const { user, loading } = useAuth();
  const { i18n } = useTranslation();

  // The <html lang> attribute never followed the user's chosen UI
  // language before (always hardcoded "en" in index.html) - screen
  // readers use it to pick pronunciation rules, so a French user
  // reading French content with lang="en" would be mispronounced.
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

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

  const isOwnerOrStaff =
    user && (user.role === "owner" || user.role === "staff");

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/accept-invite/:token" element={<AcceptInvite />} />
      <Route path="/accept-team-invite/:token" element={<AcceptTeamInvite />} />
      <Route
        path="/clients/:clientId"
        element={user ? <ClientDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/booking"
        element={
          isOwnerOrStaff ? <Booking /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/account"
        element={user ? <Account /> : <Navigate to="/login" replace />}
      />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
      <Route
        path="/"
        element={
          !user ? (
            <Landing />
          ) : isOwnerOrStaff ? (
            <OwnerDashboard />
          ) : (
            <ClientPortal />
          )
        }
      />
    </Routes>
  );
}

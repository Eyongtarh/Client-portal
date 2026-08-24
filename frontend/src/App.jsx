// Top-level routes: public auth pages, plus a protected home
// route. Owners see the dashboard; clients get a placeholder
// for now until we build the client-facing portal.
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import OwnerDashboard from "./pages/OwnerDashboard.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";

function ClientPlaceholder() {
  const { user, logout } = useAuth();

  return (
    <div
      className="min-h-screen flex flex-col items-center
      justify-center bg-blue-50 gap-4"
    >
      <h1 className="text-2xl font-bold text-blue-700">
        Welcome, {user.first_name}
      </h1>
      <p className="text-gray-600">Client portal coming soon</p>
      <button onClick={logout} className="text-sm text-blue-600 underline">
        Sign out
      </button>
    </div>
  );
}

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
            <ClientPlaceholder />
          )
        }
      />
    </Routes>
  );
}

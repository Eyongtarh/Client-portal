// Top-level routes: public auth pages, plus a protected home
// route that redirects to /login if nobody's signed in.
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

function Home() {
  const { user, logout } = useAuth();

  return (
    <div
      className="min-h-screen flex flex-col items-center
      justify-center bg-blue-50 gap-4"
    >
      <h1 className="text-2xl font-bold text-blue-700">
        Welcome, {user.first_name}
      </h1>
      <p className="text-gray-600">Role: {user.role}</p>
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
        path="/"
        element={user ? <Home /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

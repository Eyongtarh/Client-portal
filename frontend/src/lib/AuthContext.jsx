// Provides the logged-in user (or null) to the whole app via
// React context, and exposes login/logout actions that components
// can call directly. Also applies the workspace's brand color to
// the whole app as soon as a user is known, so every screen
// re-tints without each page having to do it individually.
import { createContext, useContext, useEffect, useState } from "react";
import api, { setTokens, clearTokens, getTokens } from "./api";
import applyBrandColor from "./applyBrandColor";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { access } = getTokens();
    if (!access) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me/")
      .then((res) => setUser(res.data))
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .get("/workspace/")
      .then((res) => applyBrandColor(res.data.brand_color))
      .catch(() => {});
  }, [user]);

  async function login(email, password) {
    const { data } = await api.post("/auth/login/", {
      email,
      password,
    });
    setTokens({ access: data.access, refresh: data.refresh });
    const me = await api.get("/auth/me/");
    setUser(me.data);
    return me.data;
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  const value = { user, setUser, login, logout, loading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

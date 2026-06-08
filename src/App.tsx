import { useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";

export function App() {
  const { token, ready } = useAuth();

  if (!ready) {
    return (
      <div className="auth-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {token ? <DashboardPage /> : <AuthPage />}
    </div>
  );
}

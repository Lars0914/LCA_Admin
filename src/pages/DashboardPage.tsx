import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { FileExplorer } from "../components/FileExplorer";
import { UserManagement } from "../components/UserManagement";
import { APP_NAME } from "../config";

type Tab = "archive" | "users";

export function DashboardPage() {
  const { user, token, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("archive");

  if (!token) return null;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p>Signed in as {user?.mail}</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <nav className="dashboard-tabs" aria-label="Admin sections">
        <button
          type="button"
          className={`dashboard-tab${tab === "archive" ? " dashboard-tab--active" : ""}`}
          onClick={() => setTab("archive")}
        >
          Archive
        </button>
        <button
          type="button"
          className={`dashboard-tab${tab === "users" ? " dashboard-tab--active" : ""}`}
          onClick={() => setTab("users")}
        >
          Users
        </button>
      </nav>

      {tab === "archive" ? (
        <FileExplorer token={token} />
      ) : (
        <UserManagement token={token} />
      )}
    </div>
  );
}

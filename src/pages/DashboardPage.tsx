import { useAuth } from "../auth/AuthContext";
import { FileExplorer } from "../components/FileExplorer";
import { APP_NAME } from "../config";

export function DashboardPage() {
  const { user, token, signOut } = useAuth();

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

      <FileExplorer token={token} />
    </div>
  );
}

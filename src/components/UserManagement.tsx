import { useCallback, useEffect, useState } from "react";
import {
  approveUser,
  denyUser,
  listUsers,
  type MobileAppUser,
  type ApprovalStatus,
} from "../api/client";

interface Props {
  token: string;
}

type Filter = ApprovalStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "all", label: "All" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function statusLabel(status: ApprovalStatus): string {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Denied";
}

export function UserManagement({ token }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [users, setUsers] = useState<MobileAppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listUsers(token, filter);
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleApprove = async (user: MobileAppUser) => {
    setBusyId(user.id);
    setError(null);
    try {
      await approveUser(token, user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve user");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (user: MobileAppUser) => {
    const ok = window.confirm(`Deny access for ${user.mail}?`);
    if (!ok) return;

    setBusyId(user.id);
    setError(null);
    try {
      await denyUser(token, user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deny user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel user-panel">
      <div className="explorer-toolbar">
        <div className="explorer-toolbar-group">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`btn btn-sm ${filter === item.value ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void loadUsers()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="explorer-table-wrap">
        <table className="explorer-table">
          <thead>
            <tr>
              <th className="col-name">Email</th>
              <th className="col-type">Status</th>
              <th className="col-date">Signed up</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="explorer-empty">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="explorer-empty">
                  No users in this list.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="explorer-row">
                  <td className="col-name">
                    <span className="entry-name">{user.mail}</span>
                  </td>
                  <td className="col-type">
                    <span className={`status-badge status-badge--${user.approvalStatus}`}>
                      {statusLabel(user.approvalStatus)}
                    </span>
                  </td>
                  <td className="col-date">{formatDate(user.createdAt)}</td>
                  <td className="col-actions">
                    <div className="entry-actions">
                      {user.approvalStatus !== "approved" ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === user.id}
                          onClick={() => void handleApprove(user)}
                        >
                          Approve
                        </button>
                      ) : null}
                      {user.approvalStatus !== "denied" ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === user.id}
                          onClick={() => void handleDeny(user)}
                        >
                          Deny
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

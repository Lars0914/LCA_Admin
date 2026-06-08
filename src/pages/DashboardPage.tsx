import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  browseArchive,
  createFolder,
  deleteEntry,
  getUploadUrl,
  notifyUploadComplete,
  renameEntry,
  uploadFileWithProgress,
  type AdminArchiveEntry,
  type BrowseResponse,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { APP_NAME } from "../config";

interface UploadProgress {
  name: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

export function DashboardPage() {
  const { user, token, signOut } = useAuth();
  const [currentPath, setCurrentPath] = useState("");
  const [browse, setBrowse] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<AdminArchiveEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const loadBrowse = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await browseArchive(token, currentPath);
      setBrowse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load archive");
    } finally {
      setLoading(false);
    }
  }, [token, currentPath]);

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  const pathSegments = currentPath ? currentPath.split("/") : [];

  const openFolder = (folder: AdminArchiveEntry) => {
    setCurrentPath(folder.path);
  };

  const goToCrumb = (index: number) => {
    if (index < 0) {
      setCurrentPath("");
      return;
    }
    setCurrentPath(pathSegments.slice(0, index + 1).join("/"));
  };

  const handleCreateFolder = async () => {
    if (!token) return;
    const name = window.prompt("New folder name");
    if (!name?.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await createFolder(token, joinPath(currentPath, name.trim()));
      await loadBrowse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!token || !renameTarget || !renameValue.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await renameEntry(token, renameTarget.path, renameValue.trim());
      setRenameTarget(null);
      setRenameValue("");
      await loadBrowse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (entry: AdminArchiveEntry, isFolder: boolean) => {
    if (!token) return;
    const label = isFolder ? "folder" : "file";
    const ok = window.confirm(`Delete this ${label}?\n\n${entry.name}`);
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await deleteEntry(token, entry.path);
      await loadBrowse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (!token || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploads(
      fileArray.map((file) => ({
        name: file.webkitRelativePath || file.name,
        percent: 0,
        status: "uploading",
      })),
    );

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const relativePath = file.webkitRelativePath || file.name;
      const storagePath = currentPath
        ? joinPath(currentPath, relativePath)
        : relativePath;

      try {
        const { uploadUrl } = await getUploadUrl(
          token,
          storagePath,
          file.type || undefined,
        );

        await uploadFileWithProgress(uploadUrl, file, (percent) => {
          setUploads((prev) =>
            prev.map((item, index) =>
              index === i ? { ...item, percent, status: "uploading" } : item,
            ),
          );
        });

        setUploads((prev) =>
          prev.map((item, index) =>
            index === i ? { ...item, percent: 100, status: "done" } : item,
          ),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((item, index) =>
            index === i
              ? {
                  ...item,
                  status: "error",
                  error: err instanceof Error ? err.message : "Upload failed",
                }
              : item,
          ),
        );
      }
    }

    await notifyUploadComplete(token);
    await loadBrowse();
  };

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      void uploadFiles(files);
    }
    event.target.value = "";
  };

  const onFolderSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) {
      void uploadFiles(files);
    }
    event.target.value = "";
  };

  const folders = browse?.folders ?? [];
  const fileEntries = browse?.files ?? [];

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{APP_NAME}</h1>
          <p>
            Archive bucket · signed in as {user?.mail}
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>

      <section className="panel">
        <div className="toolbar">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Upload files
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={busy}
          >
            Upload folder
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={handleCreateFolder}
            disabled={busy}
          >
            New folder
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void loadBrowse()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          multiple
          onChange={onFilesSelected}
        />
        <input
          ref={folderInputRef}
          className="hidden-input"
          type="file"
          multiple
          // @ts-expect-error webkitdirectory is supported in Chromium browsers
          webkitdirectory=""
          onChange={onFolderSelected}
        />

        <nav className="breadcrumbs" aria-label="Archive path">
          <button type="button" onClick={() => goToCrumb(-1)}>
            Archive
          </button>
          {pathSegments.map((segment, index) => (
            <span key={`${segment}-${index}`}>
              <span>/</span>
              <button type="button" onClick={() => goToCrumb(index)}>
                {segment}
              </button>
            </span>
          ))}
        </nav>

        {error ? <div className="error-banner">{error}</div> : null}

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : folders.length === 0 && fileEntries.length === 0 ? (
          <div className="empty-state">
            This folder is empty. Upload files or create a subfolder.
          </div>
        ) : (
          <div className="entry-list">
            {folders.map((folder) => (
              <div
                key={folder.path}
                className="entry-row folder"
                onClick={() => openFolder(folder)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openFolder(folder);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="entry-main">
                  <span className="entry-icon" aria-hidden>
                    📁
                  </span>
                  <div>
                    <div className="entry-name">{folder.name}</div>
                    <div className="entry-meta">Folder</div>
                  </div>
                </div>
                <div className="entry-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => {
                      setRenameTarget(folder);
                      setRenameValue(folder.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => void handleDelete(folder, true)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {fileEntries.map((file) => (
              <div key={file.path} className="entry-row">
                <div className="entry-main">
                  <span className="entry-icon" aria-hidden>
                    📄
                  </span>
                  <div>
                    <div className="entry-name">{file.name}</div>
                    <div className="entry-meta">
                      {formatSize(file.size)}
                      {file.updatedAt
                        ? ` · ${new Date(file.updatedAt).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                </div>
                <div className="entry-actions">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => {
                      setRenameTarget(file);
                      setRenameValue(file.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => void handleDelete(file, false)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {uploads.length > 0 ? (
          <div className="upload-panel">
            <h3>Upload progress</h3>
            <div className="progress-list">
              {uploads.map((item) => (
                <div key={item.name} className="progress-item">
                  <div className="progress-label">
                    <span>{item.name}</span>
                    <span>
                      {item.status === "error"
                        ? item.error ?? "Failed"
                        : `${item.percent}%`}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${item.status === "error" ? 0 : item.percent}%`,
                        background:
                          item.status === "error" ? "var(--danger)" : undefined,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {renameTarget ? (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rename {renameTarget.name}</h2>
            <div className="field">
              <label htmlFor="rename-input">New name</label>
              <input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void handleRename()}
                disabled={busy || !renameValue.trim()}
              >
                Save
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

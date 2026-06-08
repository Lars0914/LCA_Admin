import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  browseArchive,
  createEmptyFile,
  createFolder,
  deleteEntries,
  getUploadUrl,
  notifyUploadComplete,
  renameEntry,
  uploadFileWithProgress,
  type AdminArchiveEntry,
  type BrowseResponse,
} from "../api/client";
import {
  filesFromInput,
  formatDate,
  formatSize,
  joinPath,
  readDataTransferItems,
  type UploadableItem,
} from "../lib/explorer";

interface UploadProgress {
  id: string;
  name: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

type EntryKind = "folder" | "file";

interface ExplorerEntry extends AdminArchiveEntry {
  kind: EntryKind;
}

interface FileExplorerProps {
  token: string;
}

function toExplorerEntries(browse: BrowseResponse | null): ExplorerEntry[] {
  if (!browse) return [];
  const folders: ExplorerEntry[] = browse.folders.map((entry) => ({
    ...entry,
    kind: "folder" as const,
  }));
  const files: ExplorerEntry[] = browse.files.map((entry) => ({
    ...entry,
    kind: "file" as const,
  }));
  return [...folders, ...files];
}

export function FileExplorer({ token }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [browse, setBrowse] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const foldersInputRef = useRef<HTMLInputElement>(null);

  const entries = toExplorerEntries(browse);
  const pathSegments = currentPath ? currentPath.split("/") : [];
  const selectedEntries = entries.filter((entry) => selected.has(entry.path));
  const allSelected = entries.length > 0 && selected.size === entries.length;

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await browseArchive(token, currentPath);
      setBrowse(result);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folder");
    } finally {
      setLoading(false);
    }
  }, [token, currentPath]);

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  const goToPath = (path: string) => {
    setCurrentPath(path);
  };

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/"));
  };

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(entries.map((entry) => entry.path)));
  };

  const openEntry = (entry: ExplorerEntry) => {
    if (entry.kind === "folder") {
      setCurrentPath(entry.path);
    }
  };

  const uploadItems = async (items: UploadableItem[]) => {
    if (!items.length) return;

    const progressItems: UploadProgress[] = items.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      name: item.relativePath,
      percent: 0,
      status: "uploading",
    }));
    setUploads(progressItems);
    setBusy(true);
    setError(null);

    for (let i = 0; i < items.length; i++) {
      const { file, relativePath } = items[i];
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
    setBusy(false);
    await loadBrowse();
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("Folder name");
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

  const handleCreateFile = async () => {
    const name = window.prompt("File name");
    if (!name?.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await createEmptyFile(token, joinPath(currentPath, name.trim()));
      await loadBrowse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create file");
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;

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

  const handleDeleteSelected = async () => {
    if (!selectedEntries.length) return;

    const label =
      selectedEntries.length === 1
        ? selectedEntries[0].name
        : `${selectedEntries.length} items`;
    const ok = window.confirm(`Delete ${label}?`);
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await deleteEntries(
        token,
        selectedEntries.map((entry) => entry.path),
      );
      await loadBrowse();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const startRenameSelected = () => {
    if (selectedEntries.length !== 1) return;
    const entry = selectedEntries[0];
    setRenameTarget(entry);
    setRenameValue(entry.name);
  };

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) void uploadItems(filesFromInput(files));
    event.target.value = "";
  };

  const onFolderSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) void uploadItems(filesFromInput(files));
    event.target.value = "";
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const items = await readDataTransferItems(event.dataTransfer.items);
    if (items.length) void uploadItems(items);
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onRowKeyDown = (event: KeyboardEvent, entry: ExplorerEntry) => {
    if (event.key === "Enter") {
      if (entry.kind === "folder") openEntry(entry);
    }
  };

  return (
    <section
      className={`explorer${dragOver ? " explorer--drag-over" : ""}`}
      onDrop={(e) => void onDrop(e)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div className="explorer-toolbar">
        <div className="explorer-toolbar-group">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={handleCreateFolder}
            disabled={busy}
            title="New folder"
          >
            New folder
          </button>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => void handleCreateFile()}
            disabled={busy}
            title="New file"
          >
            New file
          </button>
          <span className="toolbar-divider" aria-hidden />
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Upload files
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={busy}
          >
            Upload folder
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => foldersInputRef.current?.click()}
            disabled={busy}
            title="Select multiple folders (Chrome/Edge)"
          >
            Upload folders
          </button>
        </div>

        <div className="explorer-toolbar-group">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={startRenameSelected}
            disabled={busy || selectedEntries.length !== 1}
          >
            Rename
          </button>
          <button
            className="btn btn-danger btn-sm"
            type="button"
            onClick={() => void handleDeleteSelected()}
            disabled={busy || selectedEntries.length === 0}
          >
            Delete{selectedEntries.length > 1 ? ` (${selectedEntries.length})` : ""}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => void loadBrowse()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
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
      <input
        ref={foldersInputRef}
        className="hidden-input"
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium browsers
        webkitdirectory=""
        onChange={onFolderSelected}
      />

      <div className="explorer-address">
        <button
          className="address-up"
          type="button"
          onClick={goUp}
          disabled={!currentPath}
          title="Up one level"
          aria-label="Up one level"
        >
          ↑
        </button>
        <div className="address-path" aria-label="Current path">
          {pathSegments.length === 0 ? (
            <span className="address-segment address-segment--current">/</span>
          ) : (
            pathSegments.map((segment, index) => {
              const path = pathSegments.slice(0, index + 1).join("/");
              const isLast = index === pathSegments.length - 1;
              return (
                <span key={path} className="address-part">
                  {index > 0 ? <span className="address-separator">/</span> : null}
                  {isLast ? (
                    <span className="address-segment address-segment--current">
                      {segment}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="address-segment"
                      onClick={() => goToPath(path)}
                    >
                      {segment}
                    </button>
                  )}
                </span>
              );
            })
          )}
        </div>
        {selected.size > 0 ? (
          <span className="selection-count">{selected.size} selected</span>
        ) : null}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <div className="explorer-table-wrap">
        <table className="explorer-table">
          <thead>
            <tr>
              <th className="col-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                  disabled={entries.length === 0}
                />
              </th>
              <th className="col-name">Name</th>
              <th className="col-type">Type</th>
              <th className="col-size">Size</th>
              <th className="col-date">Modified</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="explorer-empty">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="explorer-empty">
                  This folder is empty. Create items, upload files/folders, or
                  drag and drop here.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isSelected = selected.has(entry.path);
                return (
                  <tr
                    key={entry.path}
                    className={`explorer-row${isSelected ? " explorer-row--selected" : ""}${entry.kind === "folder" ? " explorer-row--folder" : ""}`}
                    onDoubleClick={() => openEntry(entry)}
                    onKeyDown={(e) => onRowKeyDown(e, entry)}
                    tabIndex={0}
                  >
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(entry.path)}
                        aria-label={`Select ${entry.name}`}
                      />
                    </td>
                    <td className="col-name">
                      <button
                        type="button"
                        className="entry-link"
                        onClick={() =>
                          entry.kind === "folder"
                            ? openEntry(entry)
                            : toggleSelect(entry.path)
                        }
                      >
                        <span className="entry-icon" aria-hidden>
                          {entry.kind === "folder" ? "📁" : "📄"}
                        </span>
                        <span className="entry-name">{entry.name}</span>
                      </button>
                    </td>
                    <td className="col-type">
                      {entry.kind === "folder" ? "Folder" : "File"}
                    </td>
                    <td className="col-size">{formatSize(entry.size)}</td>
                    <td className="col-date">{formatDate(entry.updatedAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {dragOver ? (
        <div className="explorer-drop-hint">Drop files or folders to upload</div>
      ) : null}

      {uploads.length > 0 ? (
        <div className="upload-panel">
          <div className="upload-panel-header">
            <h3>Upload progress</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setUploads([])}
            >
              Clear
            </button>
          </div>
          <div className="progress-list">
            {uploads.map((item) => (
              <div key={item.id} className="progress-item">
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

      {renameTarget ? (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Rename</h2>
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
    </section>
  );
}

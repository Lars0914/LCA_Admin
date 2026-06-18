import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  browseArchive,
  createFolder,
  deleteEntries,
  notifyUploadComplete,
  renameEntry,
  uploadArchiveFileWithRetry,
  type AdminArchiveEntry,
  type BrowseResponse,
} from "../api/client";
import {
  isMobileUploadDevice,
  MOBILE_FILE_ACCEPT,
  supportsFolderUploadOnDevice,
} from "../lib/device";
import {
  filesFromInput,
  formatDate,
  formatSize,
  joinPath,
  pickFolderWithDirectoryPicker,
  readDataTransferItems,
  supportsDirectoryPickerApi,
  supportsMultiFolderPicker,
  topLevelFolder,
  type UploadableItem,
} from "../lib/explorer";
import { getUploadConcurrency, runWithConcurrency, summarizeUploadQueue } from "../lib/upload";

interface UploadProgress {
  id: string;
  name: string;
  percent: number;
  status: "uploading" | "done" | "error";
  error?: string;
  folder: string;
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

function displayFileName(relativePath: string, folder: string): string {
  if (folder === "(files)") return relativePath;
  const prefix = `${folder}/`;
  return relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : relativePath;
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
  const [uploadQueue, setUploadQueue] = useState<UploadableItem[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(isMobileUploadDevice);
  const folderUploadSupported = supportsFolderUploadOnDevice();

  const entries = toExplorerEntries(browse);
  const pathSegments = currentPath ? currentPath.split("/") : [];
  const selectedEntries = entries.filter((entry) => selected.has(entry.path));
  const allSelected = entries.length > 0 && selected.size === entries.length;
  const multiFolderPicker = supportsMultiFolderPicker();
  const directoryPickerApi = supportsDirectoryPickerApi();

  useEffect(() => {
    const update = () => setIsMobile(isMobileUploadDevice());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const queueSummary = useMemo(
    () => summarizeUploadQueue(uploadQueue),
    [uploadQueue],
  );

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

  const enqueueItems = useCallback((items: UploadableItem[]) => {
    if (!items.length) return;
    setUploadQueue((prev) => [...prev, ...items]);
    setError(null);
  }, []);

  const clearQueue = () => setUploadQueue([]);

  const uploadItems = async (items: UploadableItem[]) => {
    if (!items.length) return;

    const progressItems: UploadProgress[] = items.map((item, index) => ({
      id: `${Date.now()}-${index}`,
      name: item.relativePath,
      percent: 0,
      status: "uploading",
      folder: topLevelFolder(item.relativePath),
    }));
    setUploads(progressItems);
    setCollapsedFolders(new Set());
    setBusy(true);
    setError(null);

    let successCount = 0;

    await runWithConcurrency(
      items.length,
      getUploadConcurrency(isMobile),
      async (i) => {
      const { file, relativePath } = items[i];
      const storagePath = currentPath
        ? joinPath(currentPath, relativePath)
        : relativePath;

      try {
        await uploadArchiveFileWithRetry(
          token,
          storagePath,
          file,
          (percent) => {
            setUploads((prev) =>
              prev.map((item, index) =>
                index === i
                  ? { ...item, percent, status: "uploading", error: undefined }
                  : item,
              ),
            );
          },
          (nextAttempt, maxAttempts) => {
            setUploads((prev) =>
              prev.map((item, index) =>
                index === i
                  ? {
                      ...item,
                      percent: 0,
                      status: "uploading",
                      error: `Retrying (${nextAttempt}/${maxAttempts})…`,
                    }
                  : item,
              ),
            );
          },
        );

        successCount += 1;
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
    });

    if (successCount > 0) {
      await notifyUploadComplete(token);
      await loadBrowse();
    }

    setBusy(false);
  };

  const flushQueue = () => {
    if (!uploadQueue.length) return;
    const batch = uploadQueue;
    setUploadQueue([]);
    void uploadItems(batch);
  };

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

  const toggleFolderCollapsed = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
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
    if (!files?.length) return;

    const items = filesFromInput(files);
    if (isMobile) {
      enqueueItems(items);
    } else {
      void uploadItems(items);
    }
    event.target.value = "";
  };

  const onCameraSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) enqueueItems(filesFromInput(files));
    event.target.value = "";
  };

  const onFoldersSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files?.length) enqueueItems(filesFromInput(files));
    event.target.value = "";
  };

  const onAddFolderWithPicker = async () => {
    if (directoryPickerApi) {
      try {
        const items = await pickFolderWithDirectoryPicker();
        if (items.length) enqueueItems(items);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Could not read selected folder",
        );
        return;
      }
    }

    folderInputRef.current?.click();
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const items = await readDataTransferItems(event.dataTransfer.items);
    if (items.length) enqueueItems(items);
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

  const groupedUploadProgress = useMemo(() => {
    const groups = new Map<string, UploadProgress[]>();
    for (const item of uploads) {
      const list = groups.get(item.folder) ?? [];
      list.push(item);
      groups.set(item.folder, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [uploads]);

  const doneCount = uploads.filter((item) => item.status === "done").length;
  const errorCount = uploads.filter((item) => item.status === "error").length;

  return (
    <section
      className={`explorer${dragOver ? " explorer--drag-over" : ""}${isMobile ? " explorer--mobile" : ""}`}
      onDrop={isMobile ? undefined : (e) => void onDrop(e)}
      onDragOver={isMobile ? undefined : onDragOver}
      onDragLeave={isMobile ? undefined : onDragLeave}
    >
      {isMobile ? (
        <div className="mobile-upload-hint">
          <strong>Mobile upload</strong>
          <span>
            Tap <em>Add photos/files</em> and select multiple images from your
            gallery. Add more batches, then tap <em>Upload all</em>. Folder
            upload requires a desktop browser.
          </span>
        </div>
      ) : null}

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
          <span className="toolbar-divider" aria-hidden />
          {isMobile ? (
            <>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => mobileFileInputRef.current?.click()}
                disabled={busy}
              >
                Add photos/files
              </button>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={busy}
              >
                Camera
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                Upload files
              </button>
              {folderUploadSupported ? (
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => void onAddFolderWithPicker()}
                  disabled={busy}
                  title={
                    multiFolderPicker
                      ? "Add one or more folders to the upload queue"
                      : "Add a folder to the upload queue"
                  }
                >
                  Add folders
                </button>
              ) : null}
            </>
          )}
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={flushQueue}
            disabled={busy || uploadQueue.length === 0}
          >
            Upload all
            {uploadQueue.length > 0
              ? ` (${queueSummary.fileCount})`
              : ""}
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
        ref={mobileFileInputRef}
        className="hidden-input"
        type="file"
        multiple
        accept={MOBILE_FILE_ACCEPT}
        onChange={onFilesSelected}
      />
      <input
        ref={cameraInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraSelected}
      />
      <input
        ref={folderInputRef}
        className="hidden-input"
        type="file"
        multiple
        // @ts-expect-error directory picker attributes for Chromium / Firefox
        webkitdirectory=""
        directory=""
        mozdirectory=""
        onChange={onFoldersSelected}
      />

      {uploadQueue.length > 0 ? (
        <div className="upload-queue-banner">
          <div className="upload-queue-copy">
            <strong>Upload queue</strong>
            <span>
              {isMobile
                ? `${queueSummary.fileCount} file${queueSummary.fileCount === 1 ? "" : "s"} selected`
                : `${queueSummary.folderCount} folder${queueSummary.folderCount === 1 ? "" : "s"}, ${queueSummary.fileCount} file${queueSummary.fileCount === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="upload-queue-actions">
            {isMobile ? (
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => mobileFileInputRef.current?.click()}
                disabled={busy}
              >
                Add more photos/files
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => void onAddFolderWithPicker()}
                disabled={busy}
              >
                Add more folders
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={flushQueue}
              disabled={busy}
            >
              Upload all
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={clearQueue}
              disabled={busy}
            >
              Clear queue
            </button>
          </div>
        </div>
      ) : null}

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
                  {isMobile
                    ? "This folder is empty. Tap Add photos/files to select images from your gallery, then Upload all."
                    : "This folder is empty. Add folders to the queue, upload files, or drag and drop multiple folders here."}
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

      {dragOver && !isMobile ? (
        <div className="explorer-drop-hint">
          Drop folders or files to add them to the upload queue
        </div>
      ) : null}

      {isMobile && uploadQueue.length > 0 ? (
        <div className="mobile-upload-bar">
          <span>
            {queueSummary.fileCount} file
            {queueSummary.fileCount === 1 ? "" : "s"} ready
          </span>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={flushQueue}
            disabled={busy}
          >
            Upload all
          </button>
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <div className="upload-panel">
          <div className="upload-panel-header">
            <h3>
              Upload progress
              {uploads.length > 0 ? (
                <span className="upload-panel-summary">
                  {doneCount}/{uploads.length} done
                  {errorCount > 0 ? ` · ${errorCount} failed` : ""}
                </span>
              ) : null}
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setUploads([])}
              disabled={busy}
            >
              Clear
            </button>
          </div>
          <div className="progress-list">
            {groupedUploadProgress.map(([folder, items]) => {
              const folderDone = items.filter((item) => item.status === "done").length;
              const folderErrors = items.filter((item) => item.status === "error").length;
              const collapsed = collapsedFolders.has(folder);
              return (
                <div key={folder} className="progress-folder-group">
                  <button
                    type="button"
                    className="progress-folder-header"
                    onClick={() => toggleFolderCollapsed(folder)}
                  >
                    <span className="progress-folder-title">
                      {collapsed ? "▶" : "▼"} {folder}
                    </span>
                    <span className="progress-folder-meta">
                      {folderDone}/{items.length}
                      {folderErrors > 0 ? ` · ${folderErrors} failed` : ""}
                    </span>
                  </button>
                  {!collapsed ? (
                    <div className="progress-folder-files">
                      {items.map((item) => (
                        <div key={item.id} className="progress-item">
                          <div className="progress-label">
                            <span>{displayFileName(item.name, folder)}</span>
                            <span>
                              {item.status === "error"
                                ? item.error ?? "Failed"
                                : item.error ?? `${item.percent}%`}
                            </span>
                          </div>
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${item.status === "error" ? 0 : item.percent}%`,
                                background:
                                  item.status === "error"
                                    ? "var(--danger)"
                                    : undefined,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
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

export function joinPath(base: string, name: string): string {
  return base ? `${base}/${name}` : name;
}

export function formatSize(bytes?: number): string {
  if (bytes == null || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export interface UploadableItem {
  file: File;
  relativePath: string;
}

export interface FolderUploadGroup {
  name: string;
  files: UploadableItem[];
}

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** First path segment — used to group multi-folder uploads in the progress UI. */
export function topLevelFolder(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath);
  const slash = normalized.indexOf("/");
  return slash === -1 ? "(files)" : normalized.slice(0, slash);
}

export function groupItemsByTopLevelFolder(
  items: UploadableItem[],
): FolderUploadGroup[] {
  const map = new Map<string, UploadableItem[]>();

  for (const item of items) {
    const folder = topLevelFolder(item.relativePath);
    const list = map.get(folder) ?? [];
    list.push(item);
    map.set(folder, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, files]) => ({ name, files }));
}

export function supportsMultiFolderPicker(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  return "webkitdirectory" in input;
}

export function supportsDirectoryPickerApi(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function readDirectoryEntries(
  directory: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];

  return new Promise((resolve, reject) => {
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        reject,
      );
    };
    readBatch();
  });
}

async function readEntry(
  entry: FileSystemEntry,
  prefix: string,
): Promise<UploadableItem[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    const relativePath = normalizeRelativePath(
      prefix ? `${prefix}/${file.name}` : file.name,
    );
    return [{ file, relativePath }];
  }

  if (entry.isDirectory) {
    const dirPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const children = await readDirectoryEntries(entry as FileSystemDirectoryEntry);
    const nested: UploadableItem[] = [];
    for (const child of children) {
      nested.push(...(await readEntry(child, dirPath)));
    }
    return nested;
  }

  return [];
}

async function readDirectoryHandle(
  handle: FileSystemDirectoryHandle,
  prefix: string,
): Promise<UploadableItem[]> {
  const items: UploadableItem[] = [];

  for await (const entry of handle.values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile();
      const relativePath = normalizeRelativePath(
        prefix ? `${prefix}/${file.name}` : file.name,
      );
      items.push({ file, relativePath });
      continue;
    }

    const nestedPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    items.push(
      ...(await readDirectoryHandle(
        entry as FileSystemDirectoryHandle,
        nestedPrefix,
      )),
    );
  }

  return items;
}

export async function readDataTransferItems(
  items: DataTransferItemList,
): Promise<UploadableItem[]> {
  const entries: FileSystemEntry[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  const uploadables: UploadableItem[] = [];
  for (const entry of entries) {
    uploadables.push(...(await readEntry(entry, "")));
  }
  return uploadables;
}

export function filesFromInput(fileList: FileList): UploadableItem[] {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: normalizeRelativePath(file.webkitRelativePath || file.name),
  }));
}

/** Pick one folder via the File System Access API (Safari / modern Chromium). */
export async function pickFolderWithDirectoryPicker(): Promise<UploadableItem[]> {
  if (!supportsDirectoryPickerApi()) {
    return [];
  }

  const handle = await window.showDirectoryPicker({ mode: "read" });
  return readDirectoryHandle(handle, handle.name);
}

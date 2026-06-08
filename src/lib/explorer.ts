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
    const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
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
    relativePath: file.webkitRelativePath || file.name,
  }));
}

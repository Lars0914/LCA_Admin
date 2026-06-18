/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface FileSystemDirectoryHandle {
  readonly name: string;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
  getFile(): Promise<File>;
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}

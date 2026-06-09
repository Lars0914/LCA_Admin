import { API_BASE_URL } from "../config";

export interface AuthUser {
  id: number;
  mail: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export type ApprovalStatus = "pending" | "approved" | "denied";

export interface SignUpResponse {
  user: AuthUser;
  token?: string;
  approvalStatus: ApprovalStatus;
  message: string;
}

export interface AdminUser {
  id: number;
  mail: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

export interface AdminArchiveEntry {
  name: string;
  path: string;
  size?: number;
  updatedAt?: string;
}

export interface BrowseResponse {
  bucket: string;
  path: string;
  folders: AdminArchiveEntry[];
  files: AdminArchiveEntry[];
}

export interface UploadUrlResponse {
  uploadUrl: string;
  token: string;
  path: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!res.ok) {
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  }

  return data;
}

export async function signUp(mail: string, password: string): Promise<SignUpResponse> {
  return request<SignUpResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ mail, password }),
  });
}

export async function signIn(mail: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/signin", {
    method: "POST",
    body: JSON.stringify({ mail, password }),
  });
}

export async function getAdminMe(token: string): Promise<{ user: { mail: string } }> {
  return request("/admin/me", { token });
}

export async function browseArchive(
  token: string,
  path = "",
): Promise<BrowseResponse> {
  const query = path ? `?folder=${encodeURIComponent(path)}` : "";
  return request(`/admin/archive/browse${query}`, { token });
}

export async function createFolder(
  token: string,
  path: string,
): Promise<{ path: string; message: string }> {
  return request("/admin/archive/mkdir", {
    method: "POST",
    token,
    body: JSON.stringify({ path }),
  });
}

export async function renameEntry(
  token: string,
  path: string,
  name: string,
): Promise<{ path: string }> {
  return request("/admin/archive/rename", {
    method: "POST",
    token,
    body: JSON.stringify({ path, name }),
  });
}

export async function deleteEntry(
  token: string,
  path: string,
): Promise<{ message: string; path: string }> {
  return request("/admin/archive/delete", {
    method: "POST",
    token,
    body: JSON.stringify({ path }),
  });
}

export async function deleteEntries(
  token: string,
  paths: string[],
): Promise<void> {
  for (const path of paths) {
    await deleteEntry(token, path);
  }
}

export async function getUploadUrl(
  token: string,
  path: string,
  contentType?: string,
): Promise<UploadUrlResponse> {
  return request("/admin/archive/upload-url", {
    method: "POST",
    token,
    body: JSON.stringify({ path, contentType }),
  });
}

export async function notifyUploadComplete(token: string): Promise<void> {
  await request("/admin/archive/upload-complete", {
    method: "POST",
    token,
    body: JSON.stringify({}),
  });
}

export async function listUsers(
  token: string,
  status: ApprovalStatus | "all" = "pending",
): Promise<{ users: AdminUser[]; count: number }> {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  return request(`/admin/users${query}`, { token });
}

export async function approveUser(
  token: string,
  userId: number,
): Promise<{ user: AdminUser; message: string }> {
  return request("/admin/users/approve", {
    method: "POST",
    token,
    body: JSON.stringify({ userId }),
  });
}

export async function denyUser(
  token: string,
  userId: number,
): Promise<{ user: AdminUser; message: string }> {
  return request("/admin/users/deny", {
    method: "POST",
    token,
    body: JSON.stringify({ userId }),
  });
}

export function uploadFileWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status));
    };

    xhr.onerror = () => reject(new ApiError("Upload failed", 0));
    xhr.send(file);
  });
}

export { ApiError };

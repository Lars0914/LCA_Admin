import { topLevelFolder, type UploadableItem } from "./explorer";

export const UPLOAD_CONCURRENCY = 4;
export const MOBILE_UPLOAD_CONCURRENCY = 2;
export const UPLOAD_MAX_ATTEMPTS = 3;
export const UPLOAD_RETRY_BASE_MS = 1000;

export function getUploadConcurrency(isMobile: boolean): number {
  return isMobile ? MOBILE_UPLOAD_CONCURRENCY : UPLOAD_CONCURRENCY;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry async work with exponential backoff (1s, 2s, 4s by default). */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options?: { maxAttempts?: number; baseMs?: number },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? UPLOAD_MAX_ATTEMPTS;
  const baseMs = options?.baseMs ?? UPLOAD_RETRY_BASE_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseMs * 2 ** (attempt - 1));
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} (after ${maxAttempts} attempts)`);
  }
  throw new Error(`Operation failed after ${maxAttempts} attempts`);
}

/** Run async work for indices 0..count-1 with a bounded worker pool. */
export async function runWithConcurrency(
  count: number,
  limit: number,
  fn: (index: number) => Promise<void>,
): Promise<void> {
  if (count === 0) return;

  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), count);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= count) break;
      await fn(index);
    }
  });

  await Promise.all(workers);
}

export function summarizeUploadQueue(items: UploadableItem[]): {
  fileCount: number;
  folderCount: number;
} {
  const folders = new Set<string>();
  for (const item of items) {
    folders.add(topLevelFolder(item.relativePath));
  }
  return { fileCount: items.length, folderCount: folders.size };
}

import { topLevelFolder, type UploadableItem } from "./explorer";

export const UPLOAD_CONCURRENCY = 4;

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

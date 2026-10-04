/**
 * Storage quota / persistence helpers for the storage UX.
 *
 * - Surface approximate local-storage usage via navigator.storage.estimate().
 * - Request persistent storage (best-effort, never throws).
 * - Save history entries defensively: on QuotaExceededError, evict the
 *   oldest entries one by one and retry before giving up with a typed
 *   HistoryQuotaError. A failed history save must NEVER lose the generated
 *   PDF — the caller still offers the download.
 */

import { TARGET_HISTORY_STORAGE_BYTES } from "./historyRepository";
import {
  addHistoryEntry,
  deleteHistoryEntry,
  listHistoryOldestFirst,
  type PdfHistoryEntry,
} from "./historyRepository";

export interface StorageEstimate {
  usedBytes: number;
  /** Approximate total quota, or 0 when the browser does not report one. */
  quotaBytes: number;
  /** 0..100, or 0 when the quota is unknown. */
  usagePercent: number;
}

/** Approximate local storage usage. Null when the API is unavailable. */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  try {
    const storage = globalThis.navigator?.storage;
    if (!storage || typeof storage.estimate !== "function") return null;
    const estimate = await storage.estimate();
    const usedBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 0;
    const usagePercent =
      quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0;
    return { usedBytes, quotaBytes, usagePercent };
  } catch {
    return null;
  }
}

/**
 * Best-effort request for persistent storage. Never throws: returns false
 * when persistence is unavailable, denied, or the call fails.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    const storage = globalThis.navigator?.storage;
    if (!storage || typeof storage.persist !== "function") return false;
    return await storage.persist();
  } catch {
    return false;
  }
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** "2.8 MB"-style formatting for byte counts. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${UNITS[unitIndex]}`;
}

/**
 * Estimate-based sanity check: can `bytes` plausibly fit inside the history
 * storage budget? True when no estimate is available (the write is then
 * attempted anyway and QuotaExceededError is handled on save).
 */
export async function canFitHistory(bytes: number): Promise<boolean> {
  const estimate = await getStorageEstimate();
  if (!estimate) return true;
  return estimate.usedBytes + bytes <= TARGET_HISTORY_STORAGE_BYTES;
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "QuotaExceededError"
  );
}

/**
 * History could not be saved even after evicting everything: the generated
 * PDF must still be offered as a download instead.
 */
export class HistoryQuotaError extends Error {
  constructor(message = "Not enough local storage to save this PDF to history.") {
    super(message);
    this.name = "HistoryQuotaError";
    // Keep instanceof working across transpilation targets.
    Object.setPrototypeOf(this, HistoryQuotaError.prototype);
  }
}

/**
 * Save a history entry, evicting the oldest entries one by one on
 * QuotaExceededError and retrying (up to the full store). Throws
 * {@link HistoryQuotaError} when it still fails.
 */
export async function saveHistoryEntryWithQuota(
  entry: PdfHistoryEntry,
): Promise<void> {
  try {
    await addHistoryEntry(entry);
    return;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  // Evict oldest entries one at a time, retrying after each eviction.
  // Loop bound: we can evict at most the whole store once.
  for (;;) {
    const oldest = await listHistoryOldestFirst();
    if (oldest.length === 0) break;
    await deleteHistoryEntry(oldest[0].id);
    try {
      await addHistoryEntry(entry);
      return;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
  }

  throw new HistoryQuotaError();
}

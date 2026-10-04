/**
 * Recent-PDFs history repository.
 *
 * Keeps at most {@link MAX_HISTORY_ITEMS} exported PDFs in IndexedDB
 * (metadata + Blob + optional thumbnail). Inserting beyond the cap evicts
 * the oldest entries, including their Blobs and thumbnails.
 */

import { openPdfWriterDb } from "./database";
import type { HistoryRecord } from "./database";

export interface PdfHistoryEntry extends HistoryRecord {}

/** Hard cap on the number of history entries (eviction is oldest-first). */
export const MAX_HISTORY_ITEMS = 10;

/**
 * Soft storage budget for the history. 10 entries is a *maximum*, not a
 * guarantee: when browser storage is tight, older entries are evicted early.
 */
export const TARGET_HISTORY_STORAGE_BYTES = 500 * 1024 * 1024;

/**
 * Insert a history entry. If the store exceeds {@link MAX_HISTORY_ITEMS},
 * the oldest entries are deleted (oldest first). Returns the ids that were
 * evicted so callers can release related resources (e.g. object URLs).
 */
export async function addHistoryEntry(entry: PdfHistoryEntry): Promise<string[]> {
  const db = await openPdfWriterDb();
  const tx = db.transaction("history", "readwrite");
  await tx.store.put(entry);

  // Ascending by createdAt → oldest first.
  const keys = await tx.store.index("by-created").getAllKeys();
  const evicted: string[] = [];
  const excess = keys.length - MAX_HISTORY_ITEMS;
  if (excess > 0) {
    const toDelete = keys.slice(0, excess);
    await Promise.all(toDelete.map((key) => tx.store.delete(key)));
    evicted.push(...toDelete);
  }
  await tx.done;
  return evicted;
}

/** List all history entries, newest first. */
export async function listHistory(): Promise<PdfHistoryEntry[]> {
  const db = await openPdfWriterDb();
  const entries = await db.getAllFromIndex("history", "by-created");
  entries.reverse(); // newest first
  return entries;
}

/** Oldest entry first — used by quota-eviction loops. */
export async function listHistoryOldestFirst(): Promise<PdfHistoryEntry[]> {
  const db = await openPdfWriterDb();
  return db.getAllFromIndex("history", "by-created");
}

export async function getHistoryEntry(id: string): Promise<PdfHistoryEntry | undefined> {
  const db = await openPdfWriterDb();
  return db.get("history", id);
}

/** Delete one entry. Returns true when an entry existed. */
export async function deleteHistoryEntry(id: string): Promise<boolean> {
  const db = await openPdfWriterDb();
  const existing = await db.getKey("history", id);
  if (existing === undefined) return false;
  await db.delete("history", id);
  return true;
}

/** Delete every history entry. Returns the number deleted. */
export async function clearHistory(): Promise<number> {
  const db = await openPdfWriterDb();
  const tx = db.transaction("history", "readwrite");
  const count = await tx.store.count();
  await tx.store.clear();
  await tx.done;
  return count;
}

/** Total number of history entries. */
export async function countHistory(): Promise<number> {
  const db = await openPdfWriterDb();
  return db.count("history");
}

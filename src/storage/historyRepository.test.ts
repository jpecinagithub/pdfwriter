import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteDB } from "idb";
import {
  addHistoryEntry,
  clearHistory,
  countHistory,
  deleteHistoryEntry,
  getHistoryEntry,
  listHistory,
  MAX_HISTORY_ITEMS,
  TARGET_HISTORY_STORAGE_BYTES,
  type PdfHistoryEntry,
} from "./historyRepository";
import { closePdfWriterDb, DB_NAME } from "./database";

let counter = 0;

function makeEntry(createdAt: number): PdfHistoryEntry {
  counter += 1;
  return {
    id: `entry-${createdAt}-${counter}`,
    fileName: `document-${createdAt}-edited.pdf`,
    originalFileName: `document-${createdAt}.pdf`,
    pdfBlob: new Blob([`pdf-bytes-${createdAt}`], { type: "application/pdf" }),
    createdAt,
    fileSize: 1024 * createdAt,
    pageCount: createdAt,
  };
}

beforeEach(async () => {
  closePdfWriterDb();
  await deleteDB(DB_NAME);
  counter = 0;
});

describe("historyRepository", () => {
  it("enforces the 10-item rule: 11th insert evicts the oldest", async () => {
    const base = Date.now();
    for (let i = 0; i < MAX_HISTORY_ITEMS; i += 1) {
      await addHistoryEntry(makeEntry(base + i));
    }
    expect(await countHistory()).toBe(10);

    const oldestId = (await listHistory()).at(-1)!.id;
    const evicted = await addHistoryEntry(makeEntry(base + 100));

    expect(await countHistory()).toBe(10);
    expect(evicted).toEqual([oldestId]);
    expect(await getHistoryEntry(oldestId)).toBeUndefined();
  });

  it("lists newest first", async () => {
    const base = Date.now();
    for (let i = 0; i < 3; i += 1) {
      await addHistoryEntry(makeEntry(base + i));
    }
    const listed = await listHistory();
    expect(listed.map((e) => e.createdAt)).toEqual([
      base + 2,
      base + 1,
      base,
    ]);
  });

  it("clearHistory removes everything and returns the count", async () => {
    const base = Date.now();
    await addHistoryEntry(makeEntry(base));
    await addHistoryEntry(makeEntry(base + 1));
    expect(await clearHistory()).toBe(2);
    expect(await countHistory()).toBe(0);
    expect(await listHistory()).toEqual([]);
  });

  it("deletes a single entry", async () => {
    const base = Date.now();
    const a = makeEntry(base);
    const b = makeEntry(base + 1);
    await addHistoryEntry(a);
    await addHistoryEntry(b);

    expect(await deleteHistoryEntry(a.id)).toBe(true);
    expect(await getHistoryEntry(a.id)).toBeUndefined();
    expect(await countHistory()).toBe(1);
    // Deleting a missing id reports false.
    expect(await deleteHistoryEntry(a.id)).toBe(false);
  });

  it("stores and retrieves blob payloads intact", async () => {
    const entry = makeEntry(Date.now());
    await addHistoryEntry(entry);
    const loaded = await getHistoryEntry(entry.id);
    expect(loaded?.fileName).toBe(entry.fileName);
    expect(await loaded?.pdfBlob.text()).toBe(`pdf-bytes-${entry.createdAt}`);
  });

  it("exposes the storage budget constants", () => {
    expect(MAX_HISTORY_ITEMS).toBe(10);
    expect(TARGET_HISTORY_STORAGE_BYTES).toBe(500 * 1024 * 1024);
  });
});

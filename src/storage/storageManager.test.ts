import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { closePdfWriterDb, DB_NAME } from "./database";
import {
  canFitHistory,
  formatBytes,
  getStorageEstimate,
  HistoryQuotaError,
  requestPersistence,
  saveHistoryEntryWithQuota,
} from "./storageManager";
import {
  addHistoryEntry,
  countHistory,
  listHistory,
  type PdfHistoryEntry,
} from "./historyRepository";

beforeEach(async () => {
  closePdfWriterDb();
  await deleteDB(DB_NAME);
});

function makeEntry(n: number): PdfHistoryEntry {
  return {
    id: `entry-${n}`,
    fileName: `doc-${n}-edited.pdf`,
    originalFileName: `doc-${n}.pdf`,
    pdfBlob: new Blob([`bytes-${n}`], { type: "application/pdf" }),
    createdAt: Date.now() + n,
    fileSize: 1024,
    pageCount: 1,
  };
}

describe("formatBytes", () => {
  it("formats byte counts human-readably", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.8 * 1024 * 1024)).toBe("2.8 MB");
    expect(formatBytes(58 * 1024 * 1024)).toBe("58 MB");
    expect(formatBytes(3.2 * 1024 * 1024 * 1024)).toBe("3.2 GB");
  });

  it("handles invalid input defensively", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });
});

describe("HistoryQuotaError", () => {
  it("is an Error subclass with a stable name", () => {
    const err = new HistoryQuotaError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HistoryQuotaError);
    expect(err.name).toBe("HistoryQuotaError");
    expect(typeof err.message).toBe("string");
  });
});

describe("navigator.storage helpers", () => {
  it("requestPersistence returns false without throwing when unavailable", async () => {
    const original = globalThis.navigator;
    vi.stubGlobal("navigator", undefined);
    try {
      await expect(requestPersistence()).resolves.toBe(false);
    } finally {
      vi.stubGlobal("navigator", original);
    }
  });

  it("getStorageEstimate returns null when the API is unavailable", async () => {
    const original = globalThis.navigator;
    vi.stubGlobal("navigator", undefined);
    try {
      await expect(getStorageEstimate()).resolves.toBeNull();
    } finally {
      vi.stubGlobal("navigator", original);
    }
  });

  it("canFitHistory is optimistic without an estimate", async () => {
    const original = globalThis.navigator;
    vi.stubGlobal("navigator", undefined);
    try {
      await expect(canFitHistory(10 ** 9)).resolves.toBe(true);
    } finally {
      vi.stubGlobal("navigator", original);
    }
  });
});

describe("saveHistoryEntryWithQuota", () => {
  it("saves normally when there is no quota pressure", async () => {
    await saveHistoryEntryWithQuota(makeEntry(1));
    expect(await countHistory()).toBe(1);
  });

  it("evicts oldest entries and retries when the store is full", async () => {
    // Fill the store past capacity so every insert triggers the max-10 rule.
    for (let i = 0; i < 10; i += 1) {
      await addHistoryEntry(makeEntry(i));
    }
    // Simulate a QuotaExceededError on the first attempt only: evicting one
    // oldest entry frees the room, then the retry succeeds.
    const quotaError = new DOMException("quota", "QuotaExceededError");
    const original = addHistoryEntry;
    let calls = 0;
    vi.spyOn(await import("./historyRepository"), "addHistoryEntry").mockImplementation(
      async (entry: PdfHistoryEntry) => {
        calls += 1;
        if (calls === 1) throw quotaError;
        return original(entry);
      },
    );
    try {
      await saveHistoryEntryWithQuota(makeEntry(100));
    } finally {
      vi.restoreAllMocks();
    }

    expect(await countHistory()).toBe(10);
    const listed = await listHistory();
    expect(listed[0].id).toBe("entry-100"); // newest first
    expect(listed.some((e) => e.id === "entry-0")).toBe(false); // oldest evicted
  });

  it("throws HistoryQuotaError when even a fully evicted store cannot save", async () => {
    const quotaError = new DOMException("quota", "QuotaExceededError");
    vi.spyOn(await import("./historyRepository"), "addHistoryEntry").mockRejectedValue(quotaError);
    try {
      await expect(saveHistoryEntryWithQuota(makeEntry(1))).rejects.toBeInstanceOf(
        HistoryQuotaError,
      );
    } finally {
      vi.restoreAllMocks();
    }
  });
});

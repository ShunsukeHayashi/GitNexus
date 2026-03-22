/**
 * FileHashCache — Zero-cost Re-indexing via File Content Hashes
 *
 * Tracks which source files have changed since the last analysis run so the
 * pipeline can skip unchanged files entirely. Two-tier detection strategy:
 *
 *   1. Fast path: mtime + size check (no I/O beyond stat)
 *   2. Slow path: SHA-256 content hash (detects same-mtime edits, e.g. `touch`)
 *
 * Stored at .gitnexus/file-hash-cache.json inside the repository root.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface FileHashEntry {
  /** Absolute file path */
  path: string;
  /** SHA-256 hex digest of file content */
  hash: string;
  /** Last-modified time in milliseconds (from stat.mtimeMs) */
  mtime: number;
  /** File size in bytes (from stat.size) */
  size: number;
}

interface FileHashCacheFile {
  version: number;
  entries: Record<string, FileHashEntry>;
  lastUpdated: string;
}

/**
 * Persistent cache that maps absolute file paths to their last-seen SHA-256
 * hashes plus stat metadata for fast mtime/size pre-screening.
 */
export class FileHashCache {
  private cachePath: string;
  private data: FileHashCacheFile | null = null;
  private dirty = false;

  constructor(repoPath: string) {
    this.cachePath = path.join(repoPath, '.gitnexus', 'file-hash-cache.json');
  }

  // ─── Persistence ──────────────────────────────────────────────────

  /** Load the cache from disk, or initialise an empty store if missing. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.cachePath, 'utf-8');
      this.data = JSON.parse(raw) as FileHashCacheFile;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.data = { version: 1, entries: {}, lastUpdated: new Date().toISOString() };
      } else {
        throw err;
      }
    }
  }

  /** Write the in-memory cache to disk (only if dirty). */
  async flush(): Promise<void> {
    if (!this.dirty || !this.data) return;
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    this.data.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.cachePath, JSON.stringify(this.data, null, 2), 'utf-8');
    this.dirty = false;
  }

  // ─── Core API ─────────────────────────────────────────────────────

  /**
   * Check whether `filePath` has changed compared to the cached entry.
   *
   * Strategy:
   *   • If no cached entry exists → changed (new file).
   *   • If mtime AND size match the cached entry → unchanged (fast path, no read).
   *   • Otherwise read file and compare SHA-256 → changed only if hash differs.
   *
   * @param filePath  Absolute file path.
   * @param statSize  File size from a prior `stat()` call (avoids duplicate stat).
   * @param statMtime File mtime (ms) from a prior `stat()` call.
   * @returns `true` if the file content has changed (or is new), `false` if identical.
   */
  async hasChanged(filePath: string, statSize: number, statMtime: number): Promise<boolean> {
    if (!this.data) await this.load();

    const cached = this.data!.entries[filePath];

    if (!cached) {
      // New file — compute and store hash
      const hash = await this.computeHash(filePath);
      this.data!.entries[filePath] = { path: filePath, hash, mtime: statMtime, size: statSize };
      this.dirty = true;
      return true;
    }

    // Fast path: both mtime and size match — assume unchanged
    if (cached.mtime === statMtime && cached.size === statSize) {
      return false;
    }

    // Slow path: mtime or size differs — verify by content hash
    const hash = await this.computeHash(filePath);
    if (hash === cached.hash) {
      // Content identical despite stat change (e.g. `touch`) — update stat metadata only
      cached.mtime = statMtime;
      cached.size = statSize;
      this.dirty = true;
      return false;
    }

    // Content changed — update entry
    this.data!.entries[filePath] = { path: filePath, hash, mtime: statMtime, size: statSize };
    this.dirty = true;
    return true;
  }

  /**
   * Bulk filter: return only the file paths from `files` that have changed.
   * Stats are obtained concurrently for all files, then hashes are computed
   * only for files whose stat metadata differs from the cache.
   *
   * @param repoPath  Repository root (used to build absolute paths).
   * @param files     Relative file paths from the scanner output.
   * @param sizeMap   Optional pre-computed `path → size` map from the walk phase.
   */
  async filterChanged(
    repoPath: string,
    files: ReadonlyArray<{ path: string; size: number }>,
  ): Promise<string[]> {
    if (!this.data) await this.load();

    // Stat all files concurrently to get mtime
    const stats = await Promise.all(
      files.map(async (f) => {
        const abs = path.resolve(repoPath, f.path);
        try {
          const s = await fs.stat(abs);
          return { path: f.path, absPath: abs, size: s.size, mtime: s.mtimeMs };
        } catch {
          // File disappeared between scan and now — treat as changed
          return { path: f.path, absPath: abs, size: f.size, mtime: 0 };
        }
      }),
    );

    // Determine changed files (hash-computed lazily via hasChanged)
    const changed: string[] = [];
    for (const { path: relPath, absPath, size, mtime } of stats) {
      const didChange = await this.hasChanged(absPath, size, mtime);
      if (didChange) {
        changed.push(relPath);
      }
    }

    return changed;
  }

  /**
   * Update (or insert) the cache entry for a file after it has been successfully
   * parsed. This is a no-op if the entry is already current (set by `hasChanged`).
   */
  async markProcessed(filePath: string, statSize: number, statMtime: number): Promise<void> {
    if (!this.data) await this.load();

    const existing = this.data!.entries[filePath];
    if (existing && existing.mtime === statMtime && existing.size === statSize) {
      return; // Already up to date
    }

    const hash = await this.computeHash(filePath);
    this.data!.entries[filePath] = { path: filePath, hash, mtime: statMtime, size: statSize };
    this.dirty = true;
  }

  /** Remove a stale entry (e.g. deleted file). */
  remove(filePath: string): void {
    if (!this.data) return;
    if (filePath in this.data.entries) {
      delete this.data.entries[filePath];
      this.dirty = true;
    }
  }

  /** Total number of cached entries. */
  get size(): number {
    return this.data ? Object.keys(this.data.entries).length : 0;
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private async computeHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

/**
 * ProjectMemory Store
 *
 * Persistent storage for chat history, architectural decisions, insights,
 * and other context that should survive across sessions (RAG-ready).
 *
 * Stored at .gitnexus/project-memory.json inside the repository.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

export interface MemoryEntry {
  /** SHA-256 of content (first 16 hex chars) */
  id: string;
  /** Category of the memory */
  type: 'chat' | 'decision' | 'insight' | 'context';
  /** The actual text content */
  content: string;
  /** Tags for filtering (e.g. ['auth', 'performance']) */
  tags: string[];
  /** Associated repo path (optional) */
  repoId?: string;
  /** ISO 8601 timestamp of when this entry was created */
  timestamp: string;
  /** Optional grouping identifier for related entries */
  sessionId?: string;
}

interface ProjectMemoryFile {
  version: number;
  entries: MemoryEntry[];
  lastUpdated: string;
}

export class ProjectMemoryStore {
  private memoryPath: string;
  private memory: ProjectMemoryFile | null = null;

  constructor(repoPath: string) {
    this.memoryPath = path.join(repoPath, '.gitnexus', 'project-memory.json');
  }

  /**
   * Load or initialise the memory store from disk.
   * If the file does not exist, an empty store is initialised in-memory
   * (it will be persisted on the first call to save() / add()).
   */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.memoryPath, 'utf-8');
      this.memory = JSON.parse(raw) as ProjectMemoryFile;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.memory = {
          version: 1,
          entries: [],
          lastUpdated: new Date().toISOString(),
        };
      } else {
        throw err;
      }
    }
  }

  /** Persist the in-memory store to disk. */
  async save(): Promise<void> {
    if (!this.memory) return;
    await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
    this.memory.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
  }

  /**
   * Add a new memory entry.
   * The id is derived from the content so identical notes are deduplicated.
   */
  async add(
    entry: Omit<MemoryEntry, 'id' | 'timestamp'>,
  ): Promise<MemoryEntry> {
    await this.load();

    const id = crypto
      .createHash('sha256')
      .update(entry.content)
      .digest('hex')
      .slice(0, 16);

    const newEntry: MemoryEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };

    this.memory!.entries.push(newEntry);
    await this.save();
    return newEntry;
  }

  /**
   * Search memory entries.
   * Performs a simple case-insensitive substring match on content and tags.
   *
   * @param query  - Search string
   * @param type   - Optional filter by entry type
   * @param limit  - Max results (default 20)
   */
  async search(
    query: string,
    type?: MemoryEntry['type'],
    limit = 20,
  ): Promise<MemoryEntry[]> {
    await this.load();

    const q = query.toLowerCase();

    const matches = this.memory!.entries.filter((entry) => {
      if (type && entry.type !== type) return false;
      const inContent = entry.content.toLowerCase().includes(q);
      const inTags = entry.tags.some((t) => t.toLowerCase().includes(q));
      return inContent || inTags;
    });

    return matches.slice(0, limit);
  }

  /**
   * List recent entries, optionally filtered by type, newest first.
   *
   * @param limit - Max results (default 20)
   * @param type  - Optional filter by entry type
   */
  async list(limit = 20, type?: MemoryEntry['type']): Promise<MemoryEntry[]> {
    await this.load();

    let entries = [...this.memory!.entries];

    if (type) {
      entries = entries.filter((e) => e.type === type);
    }

    // Sort newest first
    entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return entries.slice(0, limit);
  }

  /**
   * Delete a single entry by id.
   * Returns true if the entry was found and removed, false otherwise.
   */
  async delete(id: string): Promise<boolean> {
    await this.load();

    const before = this.memory!.entries.length;
    this.memory!.entries = this.memory!.entries.filter((e) => e.id !== id);
    const removed = this.memory!.entries.length < before;

    if (removed) {
      await this.save();
    }

    return removed;
  }
}

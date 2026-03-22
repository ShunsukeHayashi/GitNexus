import { describe, expect, it, vi } from 'vitest';
import {
  aggregateRemoteGraphMeta,
  normalizeMcpUrl,
} from '../../src/server/mcp-router.js';

describe('normalizeMcpUrl', () => {
  it('appends /api/mcp when only base url is provided', () => {
    expect(normalizeMcpUrl('http://localhost:4111')).toBe('http://localhost:4111/api/mcp');
  });

  it('preserves explicit /api/mcp endpoint', () => {
    expect(normalizeMcpUrl('http://localhost:4111/api/mcp')).toBe('http://localhost:4111/api/mcp');
  });
});

describe('aggregateRemoteGraphMeta', () => {
  it('merges JSONL snapshots from multiple MCP sources', async () => {
    const reader = vi.fn(async (source: { url: string; repo: string }) => {
      if (source.repo === 'repo-a') {
        return [
          '{"kind":"repo","repo":{"name":"repo-a","namespace":"repo-a"}}',
          '{"kind":"node","node":{"id":"repo-a:file:1","label":"File","properties":{"name":"index.ts","filePath":"src/index.ts","namespace":"repo-a"}}}',
          '{"kind":"relationship","relationship":{"id":"repo-a_rel","sourceId":"repo-a:file:1","targetId":"repo-a:file:2","type":"IMPORTS","confidence":1,"reason":"import"}}',
        ].join('\n');
      }

      return [
        '{"kind":"repo","repo":{"name":"repo-b","namespace":"repo-b"}}',
        '{"kind":"node","node":{"id":"repo-b:file:1","label":"File","properties":{"name":"api.ts","filePath":"src/api.ts","namespace":"repo-b"}}}',
      ].join('\n');
    });

    const result = await aggregateRemoteGraphMeta(
      [
        { url: 'http://repo-a.local', repo: 'repo-a' },
        { url: 'http://repo-b.local/api/mcp', repo: 'repo-b' },
      ],
      reader,
    );

    expect(result.summary).toEqual({
      sourceCount: 2,
      repoCount: 2,
      nodeCount: 2,
      relationshipCount: 1,
    });
    expect(result.sources).toEqual([
      expect.objectContaining({
        url: 'http://repo-a.local',
        repo: 'repo-a',
        mcpUrl: 'http://repo-a.local/api/mcp',
        lineCount: 3,
        repoCount: 1,
        nodeCount: 1,
        relationshipCount: 1,
      }),
      expect.objectContaining({
        url: 'http://repo-b.local/api/mcp',
        repo: 'repo-b',
        mcpUrl: 'http://repo-b.local/api/mcp',
        lineCount: 2,
        repoCount: 1,
        nodeCount: 1,
        relationshipCount: 0,
      }),
    ]);
    expect(result.repos.map((repo) => repo.name)).toEqual(['repo-a', 'repo-b']);
    expect(result.nodes.map((node) => node.properties.namespace)).toEqual(['repo-a', 'repo-b']);
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it('rejects sources without repo name', async () => {
    await expect(
      aggregateRemoteGraphMeta(
        [{ url: 'http://repo-a.local', repo: '' }],
        vi.fn(),
      ),
    ).rejects.toThrow('missing repo');
  });
});

import { describe, expect, it } from 'vitest';
import { calculateFederatedImpact } from '../../src/core/federation/impact.js';

const graph = {
  nodes: [
    { id: 'repo-a:validate', label: 'Function', properties: { name: 'validate', filePath: 'src/auth.ts', namespace: 'repo-a' } },
    { id: 'repo-a:login', label: 'Function', properties: { name: 'login', filePath: 'src/auth.ts', namespace: 'repo-a' } },
    { id: 'repo-b:syncUser', label: 'Function', properties: { name: 'syncUser', filePath: 'src/sync.ts', namespace: 'repo-b' } },
    { id: 'repo-a:process', label: 'Process', properties: { name: 'LoginFlow', heuristicLabel: 'LoginFlow', filePath: '', namespace: 'repo-a', stepCount: 2 } },
    { id: 'repo-b:process', label: 'Process', properties: { name: 'SyncFlow', heuristicLabel: 'SyncFlow', filePath: '', namespace: 'repo-b', stepCount: 3 } },
    { id: 'repo-a:community', label: 'Community', properties: { name: 'Auth', heuristicLabel: 'Auth', filePath: '', namespace: 'repo-a' } },
    { id: 'repo-b:community', label: 'Community', properties: { name: 'Sync', heuristicLabel: 'Sync', filePath: '', namespace: 'repo-b' } },
    { id: 'repo-a:test', label: 'Function', properties: { name: 'validate.spec', filePath: 'test/validate.spec.ts', namespace: 'repo-a' } },
  ],
  relationships: [
    { id: 'rel-1', sourceId: 'repo-a:login', targetId: 'repo-a:validate', type: 'CALLS', confidence: 1, reason: 'direct' },
    { id: 'rel-2', sourceId: 'repo-b:syncUser', targetId: 'repo-a:validate', type: 'CROSS_REPO_CALL', confidence: 0.95, reason: 'api-call' },
    { id: 'rel-3', sourceId: 'repo-a:test', targetId: 'repo-a:validate', type: 'CALLS', confidence: 1, reason: 'test' },
    { id: 'rel-4', sourceId: 'repo-a:login', targetId: 'repo-a:process', type: 'STEP_IN_PROCESS', confidence: 1, reason: '', step: 1 },
    { id: 'rel-5', sourceId: 'repo-b:syncUser', targetId: 'repo-b:process', type: 'STEP_IN_PROCESS', confidence: 1, reason: '', step: 2 },
    { id: 'rel-6', sourceId: 'repo-a:login', targetId: 'repo-a:community', type: 'MEMBER_OF', confidence: 1, reason: '' },
    { id: 'rel-7', sourceId: 'repo-b:syncUser', targetId: 'repo-b:community', type: 'MEMBER_OF', confidence: 1, reason: '' },
  ],
};

describe('calculateFederatedImpact', () => {
  it('traverses CROSS_REPO_CALL edges and reports affected repos', () => {
    const result = calculateFederatedImpact(graph, {
      target: 'validate',
      namespace: 'repo-a',
      direction: 'upstream',
    });

    expect(result.error).toBeUndefined();
    expect(result.impactedCount).toBe(2);
    expect(result.summary.repos_affected).toBe(2);
    expect(result.affected_repos).toEqual(['repo-a', 'repo-b']);
    expect((result.byDepth[1] || []).map((item: any) => item.name)).toEqual(expect.arrayContaining(['login', 'syncUser']));
    expect((result.byDepth[1] || []).map((item: any) => item.namespace)).toEqual(expect.arrayContaining(['repo-a', 'repo-b']));
    expect(result.affected_processes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'LoginFlow', namespace: 'repo-a' }),
      expect.objectContaining({ name: 'SyncFlow', namespace: 'repo-b' }),
    ]));
  });

  it('returns ambiguity candidates when target exists in multiple repos', () => {
    const ambiguousGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: 'repo-b:validate', label: 'Function', properties: { name: 'validate', filePath: 'src/validate.ts', namespace: 'repo-b' } },
      ],
    };

    const result = calculateFederatedImpact(ambiguousGraph, {
      target: 'validate',
      direction: 'upstream',
    });

    expect(result.error).toMatch(/ambiguous/i);
    expect(result.candidates).toHaveLength(2);
  });

  it('skips test files by default', () => {
    const result = calculateFederatedImpact(graph, {
      target: 'validate',
      namespace: 'repo-a',
      direction: 'upstream',
    });

    expect((result.byDepth[1] || []).map((item: any) => item.name)).not.toContain('validate.spec');
  });
});

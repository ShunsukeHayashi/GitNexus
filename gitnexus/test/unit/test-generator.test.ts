/**
 * Unit Tests: TestGenerator
 *
 * Tests the core logic of TestGenerator:
 * - generateTestSkeleton: produces valid Vitest code for Function and Class types
 * - suggestTestPath: maps source paths to test paths
 * - hasExistingTest: detects existing test coverage
 * - suggestTests: end-to-end proposal generation from impact results
 *
 * File-system operations are exercised against a real temp directory
 * (no mocking needed — they are pure fs reads, no DB involved).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TestGenerator } from '../../src/mcp/local/test-generator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Create a minimal impact result fixture */
function makeImpactResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    target: {
      id: 'func:validateUser',
      name: 'validateUser',
      type: 'Function',
      filePath: 'src/auth/validator.ts',
    },
    direction: 'upstream',
    impactedCount: 2,
    risk: 'HIGH',
    summary: { direct: 2, processes_affected: 1, modules_affected: 1 },
    byDepth: {
      1: [
        { depth: 1, id: 'func:login', name: 'login', type: 'Function', filePath: 'src/auth/login.ts', relationType: 'CALLS', confidence: 1.0 },
        { depth: 1, id: 'func:register', name: 'register', type: 'Function', filePath: 'src/auth/register.ts', relationType: 'CALLS', confidence: 1.0 },
      ],
    },
    affected_processes: [],
    affected_modules: [],
    ...overrides,
  };
}

// ─── TestGenerator.generateTestSkeleton ──────────────────────────────

describe('TestGenerator.generateTestSkeleton', () => {
  let gen: TestGenerator;

  beforeEach(() => {
    gen = new TestGenerator();
  });

  it('generates a describe block for a Function', () => {
    const code = gen.generateTestSkeleton({
      name: 'validateUser',
      type: 'Function',
      filePath: 'src/auth/validator.ts',
    });
    expect(code).toContain("describe('validateUser'");
    expect(code).toContain("import { describe, it, expect, vi } from 'vitest'");
  });

  it('contains at least two it() blocks for a Function', () => {
    const code = gen.generateTestSkeleton({
      name: 'doSomething',
      type: 'Function',
      filePath: 'src/utils.ts',
    });
    const itMatches = code.match(/\bit\(/g);
    expect(itMatches).toBeDefined();
    expect(itMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it('generates a Class skeleton with beforeEach and instance', () => {
    const code = gen.generateTestSkeleton({
      name: 'AuthService',
      type: 'Class',
      filePath: 'src/auth/auth-service.ts',
    });
    expect(code).toContain("describe('AuthService'");
    expect(code).toContain('beforeEach');
    expect(code).toContain('instance');
    expect(code).toContain("import { describe, it, expect, vi, beforeEach } from 'vitest'");
  });

  it('includes a TODO import comment with the symbol name', () => {
    const code = gen.generateTestSkeleton({
      name: 'parseToken',
      type: 'Function',
      filePath: 'src/jwt/parser.ts',
    });
    expect(code).toContain('parseToken');
    expect(code).toContain('TODO');
  });

  it('works for Method type (same as Function skeleton)', () => {
    const code = gen.generateTestSkeleton({
      name: 'getUserById',
      type: 'Method',
      filePath: 'src/users/service.ts',
    });
    expect(code).toContain("describe('getUserById'");
  });

  it('works when filePath is empty string', () => {
    const code = gen.generateTestSkeleton({ name: 'mystery', type: 'Function', filePath: '' });
    expect(code).toContain("describe('mystery'");
  });
});

// ─── TestGenerator.suggestTestPath ───────────────────────────────────

describe('TestGenerator.suggestTestPath', () => {
  let gen: TestGenerator;

  beforeEach(() => {
    gen = new TestGenerator();
  });

  it('maps src/foo/bar.ts → test/unit/foo/bar.test.ts', () => {
    expect(gen.suggestTestPath('src/foo/bar.ts')).toBe('test/unit/foo/bar.test.ts');
  });

  it('maps src/server/api.ts → test/unit/server/api.test.ts', () => {
    expect(gen.suggestTestPath('src/server/api.ts')).toBe('test/unit/server/api.test.ts');
  });

  it('maps lib/utils.ts → test/unit/utils.test.ts', () => {
    expect(gen.suggestTestPath('lib/utils.ts')).toBe('test/unit/utils.test.ts');
  });

  it('maps a root-level index.ts → test/unit/index.test.ts', () => {
    expect(gen.suggestTestPath('index.ts')).toBe('test/unit/index.test.ts');
  });

  it('strips src/ prefix', () => {
    const result = gen.suggestTestPath('src/auth/validator.ts');
    expect(result).toBe('test/unit/auth/validator.test.ts');
    expect(result).not.toContain('src/');
  });

  it('handles .js extension', () => {
    expect(gen.suggestTestPath('src/core/runner.js')).toBe('test/unit/core/runner.test.ts');
  });

  it('handles Windows-style backslash paths', () => {
    const result = gen.suggestTestPath('src\\auth\\login.ts');
    expect(result).toBe('test/unit/auth/login.test.ts');
  });

  it('returns a safe fallback for empty path', () => {
    expect(gen.suggestTestPath('')).toBe('test/unit/unknown.test.ts');
  });
});

// ─── TestGenerator.hasExistingTest ───────────────────────────────────

describe('TestGenerator.hasExistingTest', () => {
  let gen: TestGenerator;
  let tmpDir: string;

  beforeEach(async () => {
    gen = new TestGenerator();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns false when there is no test directory', async () => {
    const result = await gen.hasExistingTest('someFunction', tmpDir);
    expect(result).toBe(false);
  });

  it('returns false when test/ exists but contains no matching test', async () => {
    const testDir = path.join(tmpDir, 'test', 'unit');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'other.test.ts'),
      `describe('otherFunction', () => { it('works', () => {}); });`
    );
    const result = await gen.hasExistingTest('myFunction', tmpDir);
    expect(result).toBe(false);
  });

  it('returns true when describe block matches symbol name', async () => {
    const testDir = path.join(tmpDir, 'test', 'unit');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'auth.test.ts'),
      `describe('validateUser', () => { it('works', () => {}); });`
    );
    const result = await gen.hasExistingTest('validateUser', tmpDir);
    expect(result).toBe(true);
  });

  it('returns true for double-quote describe pattern', async () => {
    const testDir = path.join(tmpDir, 'test', 'unit');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'utils.test.ts'),
      `describe("parseToken", () => { it("parses", () => {}); });`
    );
    const result = await gen.hasExistingTest('parseToken', tmpDir);
    expect(result).toBe(true);
  });

  it('searches recursively in subdirectories', async () => {
    const subDir = path.join(tmpDir, 'test', 'unit', 'auth');
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(
      path.join(subDir, 'login.test.ts'),
      `describe('loginUser', () => { it('logs in', () => {}); });`
    );
    const result = await gen.hasExistingTest('loginUser', tmpDir);
    expect(result).toBe(true);
  });

  it('ignores non-test files (.ts without .test.ts suffix)', async () => {
    const testDir = path.join(tmpDir, 'test');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'helper.ts'),  // not a .test.ts file
      `describe('validateUser', () => {});`
    );
    const result = await gen.hasExistingTest('validateUser', tmpDir);
    expect(result).toBe(false);
  });
});

// ─── TestGenerator.suggestTests ──────────────────────────────────────

describe('TestGenerator.suggestTests', () => {
  let gen: TestGenerator;
  let tmpDir: string;

  beforeEach(async () => {
    gen = new TestGenerator();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitnexus-suggest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns target info matching impact result', async () => {
    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    expect(result.target.name).toBe('validateUser');
    expect(result.target.type).toBe('Function');
    expect(result.target.filePath).toBe('src/auth/validator.ts');
  });

  it('proposes tests for the target symbol when no existing test', async () => {
    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    const targetProposal = result.proposals.find(p => p.symbolName === 'validateUser');
    expect(targetProposal).toBeDefined();
    expect(targetProposal!.testCode).toContain("describe('validateUser'");
  });

  it('proposes tests for uncovered direct callers (d=1)', async () => {
    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    const callerNames = result.proposals.map(p => p.symbolName);
    expect(callerNames).toContain('login');
    expect(callerNames).toContain('register');
  });

  it('does not propose duplicate tests for already-covered symbols', async () => {
    // Create a test file that covers 'login'
    const testDir = path.join(tmpDir, 'test', 'unit');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'login.test.ts'),
      `describe('login', () => { it('logs in', () => {}); });`
    );

    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    const callerNames = result.proposals.map(p => p.symbolName);
    // login is already tested, should not appear in proposals
    expect(callerNames).not.toContain('login');
    // register is not tested, should still appear
    expect(callerNames).toContain('register');
  });

  it('sets correct priority from risk level', async () => {
    const impact = makeImpactResult({ risk: 'CRITICAL' });
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    for (const p of result.proposals) {
      expect(p.priority).toBe('critical');
    }
  });

  it('maps risk=LOW to priority=low', async () => {
    const impact = makeImpactResult({ risk: 'LOW' });
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    for (const p of result.proposals) {
      expect(p.priority).toBe('low');
    }
  });

  it('caps total proposals at 8', async () => {
    // Create byDepth with 10 direct callers
    const directCallers = Array.from({ length: 10 }, (_, i) => ({
      depth: 1,
      id: `func:caller${i}`,
      name: `caller${i}`,
      type: 'Function',
      filePath: `src/callers/caller${i}.ts`,
      relationType: 'CALLS',
      confidence: 1.0,
    }));
    const impact = makeImpactResult({ byDepth: { 1: directCallers } });
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    expect(result.proposals.length).toBeLessThanOrEqual(8);
    expect(result.totalProposed).toBeLessThanOrEqual(8);
  });

  it('returns empty proposals when all symbols are already tested', async () => {
    // Cover target, login, and register
    const testDir = path.join(tmpDir, 'test', 'unit');
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(
      path.join(testDir, 'covered.test.ts'),
      `describe('validateUser', () => {});
describe('login', () => {});
describe('register', () => {});`
    );

    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    expect(result.proposals).toHaveLength(0);
    expect(result.totalProposed).toBe(0);
    expect(result.coverageGap).toContain('No coverage gaps');
  });

  it('handles impact result with no byDepth gracefully', async () => {
    const impact = makeImpactResult({ byDepth: {} });
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    // Should still propose test for target itself
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
    expect(result.proposals[0].symbolName).toBe('validateUser');
  });

  it('handles impact result with missing target gracefully', async () => {
    const impact = { risk: 'LOW', byDepth: {} };
    const result = await gen.suggestTests('unknownSym', impact, tmpDir);
    expect(result.target.name).toBe('unknownSym');
  });

  it('includes a meaningful reason in each proposal', () => {
    return gen.suggestTests('validateUser', makeImpactResult(), tmpDir).then(result => {
      for (const p of result.proposals) {
        expect(p.reason.length).toBeGreaterThan(10);
      }
    });
  });

  it('suggests test file paths under test/unit/', async () => {
    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    for (const p of result.proposals) {
      expect(p.filePath).toMatch(/^test\/unit\//);
      expect(p.filePath).toMatch(/\.test\.ts$/);
    }
  });

  it('coverageGap contains risk level', async () => {
    const impact = makeImpactResult({ risk: 'HIGH' });
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    if (result.proposals.length > 0) {
      expect(result.coverageGap).toContain('HIGH');
    }
  });

  it('nextStep contains actionable text', async () => {
    const impact = makeImpactResult();
    const result = await gen.suggestTests('validateUser', impact, tmpDir);
    expect(result.nextStep.length).toBeGreaterThan(20);
  });
});

/**
 * TestGenerator
 *
 * Analyzes blast radius from impact() results and proposes Vitest unit test skeletons
 * for the target symbol and its uncovered direct callers (d=1 in the impact graph).
 *
 * Integrated with the `suggest_tests` MCP tool in local-backend.ts.
 */

import fs from 'fs/promises';
import path from 'path';

// Re-export the shape of impact() result for use by callers
export interface ImpactTargetInfo {
  name: string;
  type?: string;
  filePath?: string;
  id?: string;
}

export interface ImpactResultShape {
  target?: ImpactTargetInfo;
  direction?: string;
  impactedCount?: number;
  risk?: string;
  summary?: {
    direct?: number;
    processes_affected?: number;
    modules_affected?: number;
  };
  byDepth?: Record<string, ImpactedSymbol[]>;
  affected_processes?: unknown[];
  affected_modules?: unknown[];
  error?: string;
}

export interface ImpactedSymbol {
  depth?: number;
  id?: string;
  name?: string;
  type?: string;
  filePath?: string;
  relationType?: string;
  confidence?: number;
}

export interface TestProposal {
  /** Suggested test file path relative to repo root (e.g. test/unit/auth.test.ts) */
  filePath: string;
  /** Symbol being tested */
  symbolName: string;
  /** Symbol type: Function | Method | Class | etc. */
  symbolType: string;
  /** Full Vitest test skeleton code */
  testCode: string;
  /** Why this test was proposed */
  reason: string;
  /** Priority derived from impact risk level */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface SuggestTestsResult {
  target: { name: string; type: string; filePath: string };
  proposals: TestProposal[];
  totalProposed: number;
  /** Human-readable summary of the coverage gap */
  coverageGap: string;
  /** Actionable next step */
  nextStep: string;
}

/** Maximum number of test proposals to return in a single call */
const MAX_PROPOSALS = 8;

export class TestGenerator {
  /**
   * Generate test proposals for a symbol based on its impact analysis result.
   *
   * @param symbolName   - The symbol to generate tests for
   * @param impactResult - Result from impact() tool (JSON object)
   * @param repoPath     - Absolute path to the repository root
   */
  async suggestTests(
    symbolName: string,
    impactResult: Record<string, unknown>,
    repoPath: string
  ): Promise<SuggestTestsResult> {
    const result = impactResult as ImpactResultShape;

    // Extract target info — fall back to minimal info when impact failed
    const targetInfo: ImpactTargetInfo = result.target ?? { name: symbolName };
    const targetName = targetInfo.name ?? symbolName;
    const targetType = targetInfo.type ?? 'Function';
    const targetFilePath = targetInfo.filePath ?? '';
    const risk = (result.risk ?? 'LOW').toUpperCase();

    const priority = this.riskToPriority(risk);
    const proposals: TestProposal[] = [];

    // 1. Always generate a test for the target symbol itself
    const targetAlreadyTested = await this.hasExistingTest(targetName, repoPath);
    if (!targetAlreadyTested) {
      proposals.push({
        filePath: this.suggestTestPath(targetFilePath),
        symbolName: targetName,
        symbolType: targetType,
        testCode: this.generateTestSkeleton({
          name: targetName,
          type: targetType,
          filePath: targetFilePath,
        }),
        reason: `Direct target of analysis — no existing test found for '${targetName}'`,
        priority,
      });
    }

    // 2. Generate tests for direct callers (d=1) that lack coverage
    const byDepth = result.byDepth ?? {};
    const directCallers: ImpactedSymbol[] = byDepth[1] ?? [];

    for (const caller of directCallers) {
      if (proposals.length >= MAX_PROPOSALS) break;

      const callerName = caller.name;
      if (!callerName) continue;

      const callerAlreadyTested = await this.hasExistingTest(callerName, repoPath);
      if (callerAlreadyTested) continue;

      const callerType = caller.type ?? 'Function';
      const callerFilePath = caller.filePath ?? '';

      proposals.push({
        filePath: this.suggestTestPath(callerFilePath),
        symbolName: callerName,
        symbolType: callerType,
        testCode: this.generateTestSkeleton({
          name: callerName,
          type: callerType,
          filePath: callerFilePath,
        }),
        reason: `Direct caller of '${targetName}' (d=1) — changing the target may break this caller and it has no test coverage`,
        priority: this.riskToPriority(risk),
      });
    }

    const directCount = result.summary?.direct ?? directCallers.length;
    const untestedCount = proposals.length;

    // Build human-readable coverage gap summary
    const coverageGap = this.buildCoverageGapSummary({
      targetName,
      targetAlreadyTested,
      directCount,
      untestedCount,
      risk,
    });

    const nextStep = proposals.length > 0
      ? `Copy the test skeletons to the suggested paths, fill in the TODO sections, then run \`npx vitest run\` to validate.`
      : `All critical symbols already have test coverage. Run \`npx vitest run --coverage\` to verify.`;

    return {
      target: {
        name: targetName,
        type: targetType,
        filePath: targetFilePath,
      },
      proposals,
      totalProposed: proposals.length,
      coverageGap,
      nextStep,
    };
  }

  /**
   * Generate a Vitest test skeleton for a given symbol.
   * Produces a complete, runnable (though placeholder) test file.
   */
  generateTestSkeleton(symbol: {
    name: string;
    type: string;
    filePath?: string;
    content?: string;
  }): string {
    const { name, type, filePath = '' } = symbol;

    // Calculate a relative import path from the test file to the source file
    const testFilePath = this.suggestTestPath(filePath);
    const relativeImport = this.buildRelativeImport(testFilePath, filePath);

    if (type === 'Class') {
      return this.generateClassSkeleton(name, relativeImport);
    }

    return this.generateFunctionSkeleton(name, relativeImport);
  }

  private generateFunctionSkeleton(name: string, importPath: string): string {
    return `import { describe, it, expect, vi } from 'vitest';
// TODO: import { ${name} } from '${importPath}';

describe('${name}', () => {
  it('should handle normal input', () => {
    // TODO: arrange
    // const result = ${name}(/* args */);
    // expect(result).toBe(/* expected */);
    expect(true).toBe(true); // placeholder — replace with real assertions
  });

  it('should handle edge cases', () => {
    // TODO: test boundary conditions, null/undefined inputs, empty arrays, etc.
    expect(true).toBe(true); // placeholder
  });

  it('should handle error conditions', () => {
    // TODO: test that errors are thrown or returned correctly
    // expect(() => ${name}(/* invalid args */)).toThrow();
    expect(true).toBe(true); // placeholder
  });
});
`;
  }

  private generateClassSkeleton(name: string, importPath: string): string {
    return `import { describe, it, expect, vi, beforeEach } from 'vitest';
// TODO: import { ${name} } from '${importPath}';

describe('${name}', () => {
  // TODO: replace 'any' with the actual type once import is uncommented
  let instance: any; // ${name}

  beforeEach(() => {
    // TODO: replace with actual constructor args
    // instance = new ${name}(/* constructor args */);
    instance = {}; // placeholder
  });

  it('should be instantiated', () => {
    expect(instance).toBeDefined();
  });

  it('should handle normal operation', () => {
    // TODO: call instance methods and assert results
    expect(true).toBe(true); // placeholder
  });

  it('should handle edge cases', () => {
    // TODO: test edge cases for key methods
    expect(true).toBe(true); // placeholder
  });
});
`;
  }

  /**
   * Check if a symbol already has test coverage by scanning test files.
   * Looks for `describe('symbolName'` or `it('symbolName'` patterns.
   */
  async hasExistingTest(symbolName: string, repoPath: string): Promise<boolean> {
    const testDir = path.join(repoPath, 'test');
    try {
      await fs.access(testDir);
    } catch {
      // No test directory at all
      return false;
    }

    const patterns = [
      `describe('${symbolName}'`,
      `describe("${symbolName}"`,
      `it('${symbolName}'`,
      `it("${symbolName}"`,
      `describe(\`${symbolName}\``,
    ];

    return this.searchDirectoryForPatterns(testDir, patterns);
  }

  /**
   * Recursively scan a directory for files containing any of the given patterns.
   */
  private async searchDirectoryForPatterns(
    dir: string,
    patterns: string[]
  ): Promise<boolean> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return false;
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      let stat;
      try {
        stat = await fs.stat(entryPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        const found = await this.searchDirectoryForPatterns(entryPath, patterns);
        if (found) return true;
      } else if (
        entry.endsWith('.test.ts') ||
        entry.endsWith('.test.js') ||
        entry.endsWith('.spec.ts') ||
        entry.endsWith('.spec.js')
      ) {
        let content: string;
        try {
          content = await fs.readFile(entryPath, 'utf-8');
        } catch {
          continue;
        }

        for (const pattern of patterns) {
          if (content.includes(pattern)) return true;
        }
      }
    }

    return false;
  }

  /**
   * Determine the suggested test file path from a source file path.
   *
   * Examples:
   *   src/foo/bar.ts           → test/unit/foo/bar.test.ts
   *   src/server/api.ts        → test/unit/server/api.test.ts
   *   lib/utils.ts             → test/unit/utils.test.ts
   *   index.ts                 → test/unit/index.test.ts
   */
  suggestTestPath(sourceFilePath: string): string {
    if (!sourceFilePath) {
      return 'test/unit/unknown.test.ts';
    }

    // Normalize separators
    const normalized = sourceFilePath.replace(/\\/g, '/');

    // Strip leading common prefixes (src/, lib/, dist/, etc.)
    let relative = normalized;
    const stripPrefixes = ['src/', 'lib/', 'dist/', 'source/'];
    for (const prefix of stripPrefixes) {
      if (relative.startsWith(prefix)) {
        relative = relative.slice(prefix.length);
        break;
      }
    }

    // Replace extension with .test.ts
    const withoutExt = relative.replace(/\.(ts|js|tsx|jsx|mts|mjs|cts|cjs)$/, '');
    return `test/unit/${withoutExt}.test.ts`;
  }

  /**
   * Build a relative import path from the test file to the source file.
   */
  private buildRelativeImport(testFilePath: string, sourceFilePath: string): string {
    if (!sourceFilePath) {
      return '../src/unknown';
    }

    const testDir = path.dirname(testFilePath);
    const sourceWithoutExt = sourceFilePath.replace(/\.(ts|js|tsx|jsx|mts|mjs|cts|cjs)$/, '.js');
    const rel = path.relative(testDir, sourceWithoutExt).replace(/\\/g, '/');

    // Ensure it starts with ./ or ../
    return rel.startsWith('.') ? rel : `./${rel}`;
  }

  /**
   * Convert a risk level string to a TestProposal priority.
   */
  private riskToPriority(risk: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (risk.toUpperCase()) {
      case 'CRITICAL': return 'critical';
      case 'HIGH': return 'high';
      case 'MEDIUM': return 'medium';
      default: return 'low';
    }
  }

  /**
   * Build a human-readable coverage gap summary.
   */
  private buildCoverageGapSummary(opts: {
    targetName: string;
    targetAlreadyTested: boolean;
    directCount: number;
    untestedCount: number;
    risk: string;
  }): string {
    const { targetName, targetAlreadyTested, directCount, untestedCount, risk } = opts;

    const parts: string[] = [];

    if (!targetAlreadyTested) {
      parts.push(`'${targetName}' itself has no test coverage`);
    }

    if (directCount > 0) {
      const gapCount = untestedCount - (targetAlreadyTested ? 0 : 1);
      if (gapCount > 0) {
        parts.push(`${gapCount} of ${directCount} direct caller(s) lack test coverage`);
      } else if (!targetAlreadyTested) {
        parts.push(`all ${directCount} direct caller(s) are covered`);
      }
    }

    if (parts.length === 0) {
      return `No coverage gaps detected. All symbols in the blast radius appear to have existing tests.`;
    }

    return `Risk: ${risk}. ${parts.join('; ')}. Proposed ${untestedCount} test skeleton(s) to close the gap.`;
  }
}

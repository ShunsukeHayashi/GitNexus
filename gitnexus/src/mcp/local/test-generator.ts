type ImpactNode = {
  name?: string;
  filePath?: string;
  type?: string;
};

type ImpactPayload = {
  byDepth?: Record<string, ImpactNode[] | undefined>;
  summary?: Record<string, unknown>;
  risk?: string;
};

type TestSuggestion = {
  target: string;
  filePath?: string;
  kind: string;
  rationale: string;
  skeleton: string;
};

export class TestGenerator {
  suggestTests(symbol: string, impact: ImpactPayload, repoPath: string) {
    const impactedNodes = Object.entries(impact.byDepth ?? {})
      .flatMap(([, nodes]) => nodes ?? [])
      .filter((node): node is ImpactNode => Boolean(node && (node.name || node.filePath)));

    const suggestions: TestSuggestion[] = impactedNodes.slice(0, 5).map((node) => {
      const targetName = node.name ?? node.filePath ?? symbol;
      const kind = node.type ?? 'CodeElement';
      return {
        target: targetName,
        filePath: node.filePath,
        kind,
        rationale: `${symbol} の変更影響を受ける ${kind} を回帰確認する`,
        skeleton: [
          `describe('${targetName}', () => {`,
          `  it('covers the ${symbol} blast radius', () => {`,
          '    expect(true).toBe(true);',
          '  });',
          '});',
        ].join('\n'),
      };
    });

    return {
      symbol,
      repoPath,
      risk: impact.risk ?? 'unknown',
      summary: impact.summary ?? {},
      suggestions,
      generatedAt: new Date().toISOString(),
    };
  }
}

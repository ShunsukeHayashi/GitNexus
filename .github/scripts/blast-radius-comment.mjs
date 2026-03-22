#!/usr/bin/env node
/**
 * blast-radius-comment.mjs
 *
 * T021: Autonomous PR Blast Radius Commenter
 *
 * Workflow:
 *   1. Diffs BASE_SHA..HEAD_SHA to find changed source files in gitnexus/src/
 *   2. Queries the knowledge graph (via `miyabi-nexus cypher`) for symbols in those files
 *   3. Runs `miyabi-nexus impact` for up to MAX_SYMBOLS symbols
 *   4. Formats results as Markdown and writes to BLAST_RADIUS_OUTPUT
 *
 * Environment:
 *   BASE_SHA               — merge-base commit SHA (required)
 *   HEAD_SHA               — head commit SHA (default: HEAD)
 *   BLAST_RADIUS_OUTPUT    — output file path (default: /tmp/blast-radius-body.md)
 *   GITHUB_SERVER_URL      — e.g. https://github.com
 *   GITHUB_REPOSITORY      — e.g. owner/repo
 *   GITHUB_RUN_ID          — workflow run ID for deep-link
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE_SHA  = process.env.BASE_SHA;
const HEAD_SHA  = process.env.HEAD_SHA || 'HEAD';
const OUTPUT    = process.env.BLAST_RADIUS_OUTPUT || '/tmp/blast-radius-body.md';
const NEXUS_BIN = ['node', 'gitnexus/dist/cli/index.js'];

const MAX_FILES   = 10;
const MAX_SYMBOLS = 8;
const MARKER      = '<!-- blast-radius-report -->';

// ── helpers ────────────────────────────────────────────────────────────────────

function runCli(...args) {
  const result = spawnSync(NEXUS_BIN[0], [...NEXUS_BIN.slice(1), ...args], {
    encoding:  'utf8',
    timeout:   30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`miyabi-nexus ${args[0]} failed (exit ${result.status}): ${result.stderr?.slice(0, 500)}`);
  }
  return result.stdout;
}

function runGit(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 15_000 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

const RISK_EMOJI = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' };
const RISK_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function riskEmoji(risk) { return RISK_EMOJI[risk] ?? '⚪'; }
function riskOrder(risk)  { return RISK_ORDER[risk]  ?? 4;  }

// ── step 1: changed source files ──────────────────────────────────────────────

let changedFiles = [];

function filterSourceFiles(files) {
  return files.filter(f =>
    f &&
    f.startsWith('gitnexus/src/') &&
    !f.includes('.test.') &&
    !f.includes('.spec.') &&
    !f.includes('__tests__') &&
    !f.endsWith('.d.ts'),
  );
}

try {
  const ref     = BASE_SHA ? `${BASE_SHA}...${HEAD_SHA}` : `HEAD~1...${HEAD_SHA}`;
  const diffOut = runGit('diff', '--name-only', ref);
  changedFiles  = filterSourceFiles(diffOut.trim().split('\n'));
} catch {
  try {
    const diffOut = runGit('diff', '--name-only', 'HEAD~1', 'HEAD');
    changedFiles  = filterSourceFiles(diffOut.trim().split('\n'));
  } catch {
    changedFiles = [];
  }
}

console.log(`Changed source files (${changedFiles.length}):`, changedFiles.slice(0, MAX_FILES));

// ── step 2: find symbols via cypher ───────────────────────────────────────────

/** @type {Map<string, {name: string, type: string, filePath: string}>} */
const symbolMap = new Map();

for (const file of changedFiles.slice(0, MAX_FILES)) {
  const basename = file.split('/').pop();
  if (!basename) continue;

  // Escape single quotes for Cypher (double them)
  const safe = basename.replace(/'/g, "''");
  const query = [
    `MATCH (n)`,
    `WHERE n.filePath ENDS WITH '${safe}'`,
    `AND n.type IN ['Function', 'Class', 'Method', 'Interface', 'Struct', 'Enum']`,
    `RETURN n.name, n.type, n.filePath`,
    `LIMIT 8`,
  ].join(' ');

  try {
    const raw    = runCli('cypher', query);
    const parsed = JSON.parse(raw);

    // formatCypherAsMarkdown returns {markdown: string, row_count: number}
    if (parsed?.markdown) {
      const lines = parsed.markdown.split('\n').slice(2); // skip header + separator
      for (const line of lines) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length < 1) continue;
        const [name, type = 'Unknown', fp = file] = cols;
        if (name && !symbolMap.has(name)) {
          symbolMap.set(name, { name, type, filePath: fp });
        }
      }
    }
  } catch (err) {
    console.warn(`Cypher query failed for ${basename}:`, err.message);
  }
}

console.log(`Found ${symbolMap.size} symbol(s):`, [...symbolMap.keys()]);

// ── step 3: impact analysis ────────────────────────────────────────────────────

const impacts = [];

for (const { name, type, filePath } of [...symbolMap.values()].slice(0, MAX_SYMBOLS)) {
  try {
    const raw    = runCli('impact', name, '--direction', 'upstream');
    const result = JSON.parse(raw);

    if (result?.error || !result?.target) {
      console.warn(`Impact skipped for '${name}': ${result?.error ?? 'no target'}`);
      continue;
    }

    impacts.push({
      name:              result.target.name,
      type:              result.target.type || type,
      filePath:          result.target.filePath || filePath,
      risk:              result.risk          || 'LOW',
      impactedCount:     result.impactedCount || 0,
      partial:           !!result.partial,
      summary: {
        direct:              result.summary?.direct              ?? 0,
        processes_affected:  result.summary?.processes_affected  ?? 0,
        modules_affected:    result.summary?.modules_affected    ?? 0,
      },
      affected_processes: result.affected_processes || [],
      affected_modules:   result.affected_modules   || [],
      byDepth:            result.byDepth            || {},
    });
  } catch (err) {
    console.warn(`Impact failed for '${name}':`, err.message);
  }
}

// Sort: CRITICAL → HIGH → MEDIUM → LOW
impacts.sort((a, b) => riskOrder(a.risk) - riskOrder(b.risk));

console.log(`Impact results: ${impacts.length} symbol(s) analysed`);

// ── step 4: build markdown ─────────────────────────────────────────────────────

function buildMarkdown() {
  const fileCount = changedFiles.length;
  const symCount  = impacts.length;

  if (fileCount === 0) {
    return [
      '## Blast Radius Analysis',
      '',
      'No tracked source files changed in `gitnexus/src/` — skipping analysis.',
      '',
    ].join('\n');
  }

  if (symCount === 0) {
    const fileList = changedFiles.slice(0, MAX_FILES).map(f => `- \`${f}\``).join('\n');
    return [
      '## Blast Radius Analysis',
      '',
      `Changed source files (${fileCount}):`,
      fileList,
      '',
      'No exported symbols found in the knowledge graph for these files.',
      'The index may be stale — run `gitnexus analyze` locally to refresh.',
      '',
    ].join('\n');
  }

  const lines = [];

  lines.push('## Blast Radius Analysis', '');
  lines.push(
    `Analyzed **${symCount}** symbol(s) across **${fileCount}** changed file(s).`,
    '',
  );

  // ── summary table ──────────────────────────────────────────────────────────
  lines.push('| Symbol | Type | Risk | Direct Callers | Total Affected | Processes |');
  lines.push('|--------|------|------|----------------|----------------|-----------|');

  for (const r of impacts) {
    const riskCol = `${riskEmoji(r.risk)} **${r.risk}**`;
    lines.push(
      `| \`${r.name}\` | ${r.type} | ${riskCol} | ${r.summary.direct} | ${r.impactedCount} | ${r.summary.processes_affected} |`,
    );
  }
  lines.push('');

  // ── per-symbol details ─────────────────────────────────────────────────────
  for (const r of impacts) {
    const d1 = r.byDepth[1] || [];
    const d2 = r.byDepth[2] || [];
    const d3 = r.byDepth[3] || [];
    const partialNote = r.partial ? ' _(partial — graph traversal capped)_' : '';

    lines.push(
      `<details>`,
      `<summary><strong>\`${r.name}\`</strong> — ${riskEmoji(r.risk)} ${r.risk} · ${r.impactedCount} affected${partialNote}</summary>`,
      '',
    );

    if (r.filePath) {
      lines.push(`**File**: \`${r.filePath}\``, '');
    }

    if (d1.length > 0) {
      lines.push(`**Direct callers (d=1)** — ${d1.length} caller(s):`);
      for (const item of d1.slice(0, 8)) {
        const conf = item.confidence != null ? ` (${Math.round(item.confidence * 100)}%)` : '';
        lines.push(`- \`${item.name}\`${conf} · \`${item.filePath || ''}\``);
      }
      if (d1.length > 8) lines.push(`- _(${d1.length - 8} more)_`);
      lines.push('');
    }

    if (d2.length > 0) lines.push(`**Indirect (d=2)**: ${d2.length} symbol(s)`, '');
    if (d3.length > 0) lines.push(`**Transitive (d=3)**: ${d3.length} symbol(s)`, '');

    if (r.affected_processes.length > 0) {
      lines.push('**Affected execution flows**:');
      for (const p of r.affected_processes.slice(0, 5)) {
        lines.push(`- \`${p.name}\` (${p.hits} hit(s))`);
      }
      lines.push('');
    }

    if (r.affected_modules.length > 0) {
      const direct   = r.affected_modules.filter(m => m.impact === 'direct');
      const indirect = r.affected_modules.filter(m => m.impact === 'indirect');
      if (direct.length > 0) {
        lines.push(`**Directly affected modules**: ${direct.slice(0, 5).map(m => `\`${m.name}\``).join(', ')}`);
      }
      if (indirect.length > 0) {
        lines.push(`**Indirectly affected modules**: ${indirect.slice(0, 5).map(m => `\`${m.name}\``).join(', ')}`);
      }
      lines.push('');
    }

    lines.push('</details>', '');
  }

  // ── high/critical warning ──────────────────────────────────────────────────
  const highRisk = impacts.filter(r => r.risk === 'CRITICAL' || r.risk === 'HIGH');
  if (highRisk.length > 0) {
    lines.push(
      `> ⚠️ **${highRisk.length}** symbol(s) have HIGH or CRITICAL blast radius. Review all d=1 callers before merging.`,
      '',
    );
  }

  // ── footer ─────────────────────────────────────────────────────────────────
  const runUrl =
    process.env.GITHUB_SERVER_URL &&
    process.env.GITHUB_REPOSITORY &&
    process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null;

  const fileSnippet = changedFiles
    .slice(0, MAX_FILES)
    .map(f => `\`${f.replace('gitnexus/', '')}\``)
    .join(', ');
  const fileMore = changedFiles.length > MAX_FILES ? ` +${changedFiles.length - MAX_FILES} more` : '';

  lines.push(
    `---`,
    `<sub>🔍 GitNexus Blast Radius${runUrl ? ` · [Full run](${runUrl})` : ''} · ${fileSnippet}${fileMore}</sub>`,
  );

  return lines.join('\n');
}

const body = buildMarkdown();
writeFileSync(OUTPUT, MARKER + '\n' + body);
console.log(`Blast radius report written to ${OUTPUT} (${body.length} chars, ${impacts.length} impact(s))`);

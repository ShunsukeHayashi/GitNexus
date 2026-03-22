/**
 * Unit Tests: MCP Tool Definitions
 *
 * Tests: GITNEXUS_TOOLS from tools.ts
 * - All core tools are defined
 * - Each tool has valid name, description, inputSchema
 * - Required fields are correct
 * - Optional repo parameter is present on tools that need it
 * - suggest_tests tool is present with correct schema
 */
import { describe, it, expect } from 'vitest';
import { GITNEXUS_TOOLS, type ToolDefinition } from '../../src/mcp/tools.js';

/** Core tools that must always be present */
const CORE_TOOL_NAMES = [
  'list_repos', 'query', 'cypher', 'context',
  'detect_changes', 'rename', 'impact', 'suggest_tests',
];

describe('GITNEXUS_TOOLS', () => {
  it('exports at least the core tools', () => {
    expect(GITNEXUS_TOOLS.length).toBeGreaterThanOrEqual(CORE_TOOL_NAMES.length);
  });

  it('contains all core tool names', () => {
    const names = GITNEXUS_TOOLS.map(t => t.name);
    expect(names).toEqual(
      expect.arrayContaining(CORE_TOOL_NAMES)
    );
  });

  it('each tool has name, description, and inputSchema', () => {
    for (const tool of GITNEXUS_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });

  it('query tool requires "query" parameter', () => {
    const queryTool = GITNEXUS_TOOLS.find(t => t.name === 'query')!;
    expect(queryTool.inputSchema.required).toContain('query');
    expect(queryTool.inputSchema.properties.query).toBeDefined();
    expect(queryTool.inputSchema.properties.query.type).toBe('string');
  });

  it('cypher tool requires "query" parameter', () => {
    const cypherTool = GITNEXUS_TOOLS.find(t => t.name === 'cypher')!;
    expect(cypherTool.inputSchema.required).toContain('query');
  });

  it('context tool has no required parameters', () => {
    const contextTool = GITNEXUS_TOOLS.find(t => t.name === 'context')!;
    expect(contextTool.inputSchema.required).toEqual([]);
  });

  it('impact tool requires target and direction', () => {
    const impactTool = GITNEXUS_TOOLS.find(t => t.name === 'impact')!;
    expect(impactTool.inputSchema.required).toContain('target');
    expect(impactTool.inputSchema.required).toContain('direction');
  });

  it('rename tool requires new_name', () => {
    const renameTool = GITNEXUS_TOOLS.find(t => t.name === 'rename')!;
    expect(renameTool.inputSchema.required).toContain('new_name');
  });

  it('detect_changes tool has no required parameters', () => {
    const detectTool = GITNEXUS_TOOLS.find(t => t.name === 'detect_changes')!;
    expect(detectTool.inputSchema.required).toEqual([]);
  });

  it('list_repos tool has no parameters', () => {
    const listTool = GITNEXUS_TOOLS.find(t => t.name === 'list_repos')!;
    expect(Object.keys(listTool.inputSchema.properties)).toHaveLength(0);
    expect(listTool.inputSchema.required).toEqual([]);
  });

  it('core tools (except list_repos) have optional repo parameter', () => {
    const coreToolsWithRepo = CORE_TOOL_NAMES.filter(n => n !== 'list_repos');
    for (const toolName of coreToolsWithRepo) {
      const tool = GITNEXUS_TOOLS.find(t => t.name === toolName)!;
      expect(tool, `Tool '${toolName}' should exist`).toBeDefined();
      expect(tool.inputSchema.properties.repo, `Tool '${toolName}' should have repo param`).toBeDefined();
      expect(tool.inputSchema.properties.repo.type).toBe('string');
      // repo should never be required
      expect(tool.inputSchema.required).not.toContain('repo');
    }
  });

  it('detect_changes scope has correct enum values', () => {
    const detectTool = GITNEXUS_TOOLS.find(t => t.name === 'detect_changes')!;
    const scopeProp = detectTool.inputSchema.properties.scope;
    expect(scopeProp.enum).toEqual(['unstaged', 'staged', 'all', 'compare']);
  });

  it('impact relationTypes is array of strings', () => {
    const impactTool = GITNEXUS_TOOLS.find(t => t.name === 'impact')!;
    const relProp = impactTool.inputSchema.properties.relationTypes;
    expect(relProp.type).toBe('array');
    expect(relProp.items).toEqual({ type: 'string' });
  });

  // ─── suggest_tests tool ────────────────────────────────────────────

  it('suggest_tests tool exists', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'suggest_tests');
    expect(tool).toBeDefined();
  });

  it('suggest_tests tool requires "symbol" parameter', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'suggest_tests')!;
    expect(tool.inputSchema.required).toContain('symbol');
    expect(tool.inputSchema.properties.symbol).toBeDefined();
    expect(tool.inputSchema.properties.symbol.type).toBe('string');
  });

  it('suggest_tests tool has optional repo parameter', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'suggest_tests')!;
    expect(tool.inputSchema.properties.repo).toBeDefined();
    expect(tool.inputSchema.required).not.toContain('repo');
  });

  it('suggest_tests description mentions Vitest and blast radius', () => {
    const tool = GITNEXUS_TOOLS.find(t => t.name === 'suggest_tests')!;
    expect(tool.description.toLowerCase()).toContain('vitest');
    expect(tool.description.toLowerCase()).toContain('blast radius');
  });
});

import { describe, it, expect } from 'vitest';
import { TIER_CONFIDENCE, RELATIONSHIP_CONFIDENCE } from '../../src/core/ingestion/resolution-context.js';

describe('RELATIONSHIP_CONFIDENCE', () => {
  it('exports all expected confidence levels', () => {
    expect(RELATIONSHIP_CONFIDENCE.structural).toBe(1.0);
    expect(RELATIONSHIP_CONFIDENCE.classMethod).toBe(0.95);
    expect(RELATIONSHIP_CONFIDENCE.mroOrdered).toBe(0.9);
    expect(RELATIONSHIP_CONFIDENCE.singleInterface).toBe(0.85);
    expect(RELATIONSHIP_CONFIDENCE.heuristic).toBe(0.8);
    expect(RELATIONSHIP_CONFIDENCE.fallback).toBe(0.7);
    expect(RELATIONSHIP_CONFIDENCE.uncertain).toBe(0.5);
  });

  it('has strictly decreasing values from structural to uncertain', () => {
    const values = [
      RELATIONSHIP_CONFIDENCE.structural,
      RELATIONSHIP_CONFIDENCE.classMethod,
      RELATIONSHIP_CONFIDENCE.mroOrdered,
      RELATIONSHIP_CONFIDENCE.singleInterface,
      RELATIONSHIP_CONFIDENCE.heuristic,
      RELATIONSHIP_CONFIDENCE.fallback,
      RELATIONSHIP_CONFIDENCE.uncertain,
    ];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('all values are in the valid range [0, 1]', () => {
    for (const [key, value] of Object.entries(RELATIONSHIP_CONFIDENCE)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('TIER_CONFIDENCE values align with RELATIONSHIP_CONFIDENCE semantics', () => {
    // same-file should equal classMethod (both are authoritative)
    expect(TIER_CONFIDENCE['same-file']).toBe(RELATIONSHIP_CONFIDENCE.classMethod);
    // import-scoped should equal mroOrdered (both are strong but scoped)
    expect(TIER_CONFIDENCE['import-scoped']).toBe(RELATIONSHIP_CONFIDENCE.mroOrdered);
    // global should equal uncertain (both are low-confidence)
    expect(TIER_CONFIDENCE['global']).toBe(RELATIONSHIP_CONFIDENCE.uncertain);
  });
});

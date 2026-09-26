import { describe, it, expect } from 'vitest';
import { computeRiskScore, estimateComplexity } from '../lib/risk-scorer';

describe('computeRiskScore', () => {
  it('returns 1.0 for a fully risky item', () => {
    expect(
      computeRiskScore({ recency: 1, no_test: 1, complexity_raw: 10 })
    ).toBe(1.0);
  });

  it('returns 0.75 for a recently changed, untested, simple function', () => {
    // 0.4*1 + 0.35*1 + 0.25*0 = 0.75
    expect(
      computeRiskScore({ recency: 1, no_test: 1, complexity_raw: 0 })
    ).toBe(0.75);
  });

  it('returns 0.35 for an untested, never-changed, simple function', () => {
    // 0.4*0 + 0.35*1 + 0.25*0 = 0.35
    expect(
      computeRiskScore({ recency: 0, no_test: 1, complexity_raw: 0 })
    ).toBe(0.35);
  });

  it('caps complexity at 10 branches → weight = 0.25', () => {
    // 0.4*0 + 0.35*0 + 0.25*1 = 0.25
    expect(
      computeRiskScore({ recency: 0, no_test: 0, complexity_raw: 99 })
    ).toBe(0.25);
  });

  it('returns 0 for an item with zero risk factors', () => {
    expect(
      computeRiskScore({ recency: 0, no_test: 0, complexity_raw: 0 })
    ).toBe(0);
  });
});

describe('estimateComplexity', () => {
  it('counts if/else branches', () => {
    const code = `
      if (a) { }
      else if (b) { }
      else { }
    `;
    expect(estimateComplexity(code)).toBe(3);
  });

  it('counts switch/case', () => {
    const code = `switch (x) { case 1: break; case 2: break; }`;
    expect(estimateComplexity(code)).toBe(3); // switch + 2 case
  });

  it('counts catch', () => {
    const code = `try { } catch (e) { }`;
    expect(estimateComplexity(code)).toBe(1);
  });

  it('returns 0 for a pure expression', () => {
    const code = `const x = a + b;`;
    expect(estimateComplexity(code)).toBe(0);
  });
});

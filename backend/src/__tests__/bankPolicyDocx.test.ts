/**
 * Tests for the editable Word-document (.docx) source-of-truth round trip:
 *   export policy -> .docx -> (edit params) -> import -> BankPolicy
 * The deterministic engine reads the resulting policy, so the Word doc must
 * round-trip every numeric parameter losslessly.
 */

import {
  BANK_POLICIES_2026, BankPolicy,
  buildPolicyDocx, importPolicyDocx,
  serializePolicyParams, applyParamsToPolicy,
  extractDocxLines, parseParamLines,
} from '../services/bankPolicy';

const cba = BANK_POLICIES_2026.find((p) => p.brandCode === 'CBA') as BankPolicy;

describe('docx parameter serialization', () => {
  it('serialises identity + per-product params as key=value lines', () => {
    const lines = serializePolicyParams(cba);
    const map = new Map(lines.map((l) => [l.key, l.value]));
    expect(map.get('brandCode')).toBe('CBA');
    expect(map.get('ownerOcc.maxLvr')).toBe('0.95');
    expect(map.get('investment.maxDti')).toBe('6.5');
    expect(map.get('commercial.maxLvr')).toBe('0.7');
  });

  it('applies parsed values onto a base policy and reports warnings', () => {
    const kv = new Map<string, string>([
      ['investment.maxDti', '6.8'],
      ['ownerOcc.maxLvr', '0.9'],
      ['investment.propertyTreatmentRules.selectionStrategy', 'all'],
      ['investment.incomeShadingRules.rental.acceptPct', 'not-a-number'], // should warn + keep
    ]);
    const { policy, applied, warnings } = applyParamsToPolicy(cba, kv);
    expect(policy.residentialInvestment.maxDti).toBe(6.8);
    expect(policy.residentialOwnerOcc.maxLvr).toBe(0.9);
    expect(policy.residentialInvestment.propertyTreatmentRules.selectionStrategy).toBe('all');
    // invalid rental value kept the original
    expect(policy.residentialInvestment.incomeShadingRules.rental.acceptPct).toBe(cba.residentialInvestment.incomeShadingRules.rental.acceptPct);
    expect(applied).toBe(3);
    expect(warnings.join(' ')).toMatch(/not a number/i);
    // base is not mutated
    expect(cba.residentialInvestment.maxDti).not.toBe(6.8);
  });

  it('ignores enum values not in the allowed set', () => {
    const kv = new Map([['ownerOcc.debtTreatmentRules.hecsHelpTreatment', 'nonsense']]);
    const { policy, warnings } = applyParamsToPolicy(cba, kv);
    expect(policy.residentialOwnerOcc.debtTreatmentRules.hecsHelpTreatment).toBe(cba.residentialOwnerOcc.debtTreatmentRules.hecsHelpTreatment);
    expect(warnings.length).toBe(1);
  });
});

describe('docx line extraction', () => {
  it('extracts one line per paragraph and parses the params block', () => {
    const xml =
      '<w:p><w:r><w:t>&lt;&lt;&lt; BEGIN POLICY PARAMETERS &gt;&gt;&gt;</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>ownerOcc.maxLvr = 0.9</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>investment.selectionStrategy = all   (allowed: a | b)</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>&lt;&lt;&lt; END POLICY PARAMETERS &gt;&gt;&gt;</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>ownerOcc.maxLvr = 0.5</w:t></w:r></w:p>'; // outside block, ignored
    const lines = extractDocxLines(xml);
    const kv = parseParamLines(lines);
    expect(kv.get('ownerOcc.maxLvr')).toBe('0.9'); // not the post-END value
    expect(kv.get('investment.selectionStrategy')).toBe('all'); // hint stripped
  });
});

describe('full .docx round trip (export -> import)', () => {
  it('reproduces every parameter when the document is unchanged', async () => {
    const buffer = await buildPolicyDocx(cba);
    const { policy, brandCode, applied } = await importPolicyDocx(buffer, cba);
    expect(brandCode).toBe('CBA');
    expect(applied).toBeGreaterThan(30);
    // Spot-check a value in each product survives the round trip.
    expect(policy.residentialOwnerOcc.maxLvr).toBe(cba.residentialOwnerOcc.maxLvr);
    expect(policy.residentialInvestment.maxDti).toBe(cba.residentialInvestment.maxDti);
    expect(policy.residentialInvestment.incomeShadingRules.rental.acceptPct).toBe(cba.residentialInvestment.incomeShadingRules.rental.acceptPct);
    expect(policy.commercialPropertyLight.maxLvr).toBe(cba.commercialPropertyLight.maxLvr);
    expect(policy.residentialInvestment.propertyTreatmentRules.selectionStrategy).toBe(cba.residentialInvestment.propertyTreatmentRules.selectionStrategy);
  });

  it('rejects a .docx uploaded against the wrong bank', async () => {
    const buffer = await buildPolicyDocx(cba);
    const nab = BANK_POLICIES_2026.find((p) => p.brandCode === 'NAB') as BankPolicy;
    await expect(importPolicyDocx(buffer, nab)).rejects.toThrow(/CBA/);
  });

  it('rejects a non-docx buffer', async () => {
    await expect(importPolicyDocx(Buffer.from('hello'), cba)).rejects.toThrow();
  });
});

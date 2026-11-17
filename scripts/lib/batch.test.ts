import { describe, expect, it } from 'vitest';
import { getIndustry } from '../../src/engine/data';
import { createRng } from '../../src/engine/rng';
import { makeJobs, policyOptions, runJob, samplePolicies } from './batch';
import { quantile, toCsv } from './analyze';

describe('大量シミュレーションの部品', () => {
  it('同じシードなら同じ会社の一覧になる', () => {
    expect(makeJobs('trading', 20, 7)).toEqual(makeJobs('trading', 20, 7));
    expect(makeJobs('trading', 20, 7)).not.toEqual(makeJobs('trading', 20, 8));
  });

  it('抽選した制度は、業種で選べるものだけ', () => {
    const trading = getIndustry('trading');
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(trading.remoteAllowed).toContain(samplePolicies(rng, trading).workStyle);
    expect(policyOptions(trading).workStyle).not.toContain('remote');
  });

  it('抽選でどの選択肢も出る', () => {
    const jobs = makeJobs('trading', 300, 1);
    expect(new Set(jobs.map((j) => j.policies.bonus)).size).toBe(4);
    expect(new Set(jobs.map((j) => j.policies.overtime)).size).toBe(4);
  });

  it('1社を回すと結果がまとまり、CSVの1行になる', () => {
    const [job] = makeJobs('trading', 1, 3);
    if (!job) throw new Error('job がありません');
    const r = runJob(job);
    expect(r.summary.months).toBeGreaterThan(0);
    const csv = toCsv([r]).trim().split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[1]?.split(',').length).toBe(csv[0]?.split(',').length);
  });

  it('quantile は並べた位置の値を補間する', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1);
  });
});

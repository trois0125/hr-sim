import { describe, expect, it } from 'vitest';
import { MONTHS_PER_YEAR } from '../types';
import { defaultDetailedPolicies } from './detailedPolicy';
import { totalHeadcount } from './layers';
import { STANCES, applyStance, isWaitingForScene, resolveScene } from './scenes';
import { toCompanyView } from './view';
import { runIntermediateToEnd, startIntermediate, yearTickInPlace } from './yearTick';

const play = (seed: number) => startIntermediate({ seed, industryId: 'trading', foundingPatternId: 'carveout', autoScenes: false });

describe('中級の場面（§15.3）', () => {
  it('創業時に場面が出て、判断するまで年は進まない', () => {
    const s = play(1);
    expect(s.pendingScene?.kind).toBe('founding');
    expect(isWaitingForScene(s)).toBe(true);
    yearTickInPlace(s);
    expect(s.year).toBe(0);
    resolveScene(s, { stanceId: 'keep', detail: s.detail });
    expect(s.pendingScene).toBeNull();
    yearTickInPlace(s);
    expect(s.year).toBe(1);
  });

  it('方針を選ぶと設計の初期値が入る（範囲の中に収まる）', () => {
    const d = defaultDetailedPolicies();
    expect(applyStance(d, 'keep')).toEqual(d);
    const reward = applyStance(d, 'reward');
    expect(reward.bonus.variableShare).toBeGreaterThan(d.bonus.variableShare);
    expect(reward.grade.seniorityCap).toBeLessThan(applyStance(d, 'nurture').grade.seniorityCap);
    for (const s of STANCES) expect(() => applyStance({ ...d, grade: { ...d.grade, levels: 2, seniorityCap: 1 } }, s.id)).not.toThrow();
  });

  it('前提が変わった年か、連鎖が進んだ年に場面が出る。それ以外の年は出ない', () => {
    const s = startIntermediate({ seed: 3, industryId: 'trading', foundingPatternId: 'carveout' });
    s.autoScenes = true;
    const end = runIntermediateToEnd(s);
    // 自動で進めると、場面は「今のまま」で記録される
    expect(end.sceneLog[0]?.kind).toBe('founding');
    for (const log of end.sceneLog.slice(1)) {
      const y = end.history[log.year - 1]!;
      const before = end.history[log.year - 2];
      const premiseChanged = (Object.keys(y.premise) as (keyof typeof y.premise)[]).some((k) => y.premise[k] !== before?.premise[k]);
      expect(log.kind === 'chain' || log.kind === 'premise').toBe(true);
      expect(premiseChanged || y.chainStage > (before?.chainStage ?? 0) || log.kind === 'premise').toBe(true);
    }
  });
});

describe('初級の画面で読める形（ステップ22）', () => {
  it('社員は層の人数ぶん一人ひとりに広がり、月の記録が1年に12件ずつ増える', () => {
    const s = play(2);
    resolveScene(s, { stanceId: 'keep', detail: s.detail });
    yearTickInPlace(s);
    const v = toCompanyView(s);
    expect(v.employees).toHaveLength(totalHeadcount(s.layers));
    expect(new Set(v.employees.map((e) => e.id)).size).toBe(v.employees.length);
    expect(v.history).toHaveLength(MONTHS_PER_YEAR);
    expect(v.month).toBe(MONTHS_PER_YEAR);
    expect(v.history.at(-1)!.headcount).toBe(totalHeadcount(s.layers));
  });
});

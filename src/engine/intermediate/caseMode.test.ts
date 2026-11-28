import { afterEach, describe, expect, it } from 'vitest';
import { formatGameDate, setCalendarStartYear } from '../calendar';
import { calendarYear, getCase, headcountTarget, historicalChoice, getCaseScene, runHistoricalShadow, startCase } from './caseMode';
import { totalHeadcount } from './layers';
import { isWaitingForScene, resolveScene } from './scenes';
import { runIntermediateToEnd, yearTickInPlace } from './yearTick';

const data = getCase('mitsubishi');

describe('追体験：三菱商事（§15.7）', () => {
  afterEach(() => setCalendarStartYear(null));

  it('1954年から、実際に近い人数の層で始まり、最初の場面（大合同）で止まる', () => {
    const s = startCase('mitsubishi', 1, { autoScenes: false });
    expect(calendarYear(s)).toBe(1954);
    expect(Math.abs(totalHeadcount(s.layers) - headcountTarget(data, 1954))).toBeLessThan(50);
    expect(s.pendingScene?.caseSceneId).toBe('1954_merger');
    expect(isWaitingForScene(s)).toBe(true);
  });

  it('場面のデータ：年の順に並び、出典と史実の方針がある', () => {
    const years = data.scenes.map((x) => x.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(data.scenes.length).toBeGreaterThanOrEqual(20);
    for (const x of data.scenes) {
      expect(x.source).toMatch(/P\./);
      expect(x.history.summary.length).toBeGreaterThan(0);
    }
  });

  it('場面は史実の年に順に出る。どの方針を選んでも、場面の流れは変わらない', () => {
    const keep = runIntermediateToEnd(startCase('mitsubishi', 2, { autoScenes: true }));
    expect(keep.year).toBe(data.endYear - data.startYear + 1);
    expect(keep.sceneLog.map((l) => data.startYear + l.year)).toEqual(data.scenes.map((x) => x.year));
    const hist = runHistoricalShadow('mitsubishi', 2);
    expect(hist.sceneLog.map((l) => l.year)).toEqual(keep.sceneLog.map((l) => l.year));
    // 史実の方針を選んだので、制度は変わっている
    expect(hist.detail).not.toEqual(keep.detail);
  }, 30000);

  it('史実の影の計算は、同じシードなら同じ結果になる', () => {
    const shorten = (seed: number) => {
      const s = startCase('mitsubishi', seed, { autoScenes: true, historical: true });
      s.maxYears = 20;
      return runIntermediateToEnd(s);
    };
    expect(shorten(5).history).toEqual(shorten(5).history);
  });

  it('画面で史実と違う方針を選んでも、次の場面は史実の年に出る', () => {
    const s = startCase('mitsubishi', 3, { autoScenes: false });
    resolveScene(s, { stanceId: 'reward', detail: s.detail });
    yearTickInPlace(s); // 1954
    expect(s.pendingScene?.caseSceneId).toBe('1955_hiring');
    const h = historicalChoice(s, getCaseScene(s, '1955_hiring'));
    expect(h.base.hiring).toBe('new_grad');
  });

  it('定年は時代ごとに変わる（1950年代は55歳）', () => {
    const s = startCase('mitsubishi', 4, { autoScenes: true });
    s.maxYears = 6;
    const end = runIntermediateToEnd(s);
    expect(end.departures.filter((d) => d.kind === 'retirement').every((d) => d.age === 55)).toBe(true);
  });

  it('ゲームの日付は1954年から数える（画面の表示）', () => {
    setCalendarStartYear(1954);
    expect(formatGameDate(0)).toMatch(/^1954年/);
    setCalendarStartYear(null);
    expect(formatGameDate(0)).not.toMatch(/^1954年/);
  });
});

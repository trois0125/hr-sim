import { describe, expect, it } from 'vitest';
import { reportStrings as t } from './strings';

describe('振り返りの文：納得感の要因のつなぎ方', () => {
  const up = '評価への納得が高まった';
  const down = '働く負荷への不満が強まった';
  it('全体が上がったときは上がった要因を先に、下がったときは下がった要因を先に書く', () => {
    expect(t.retroFactors('up', up, down)).toBe(`${up}一方で、${down}。`);
    expect(t.retroFactors('down', up, down)).toBe(`${down}一方で、${up}。`);
  });
  it('全体と逆向きの要因しかないときは「一方で」にする（「とくに」にしない）', () => {
    expect(t.retroFactors('down', up, null)).toBe(`一方で、${up}。`);
    expect(t.retroFactors('up', null, down)).toBe(`一方で、${down}。`);
    expect(t.retroFactors('up', up, null)).toBe(`とくに${up}。`);
  });
  it('全体がほとんど変わらないときは「ただ」。要因がなければ空', () => {
    expect(t.retroFactors('flat', null, down)).toBe(`ただ、${down}。`);
    expect(t.retroFactors('flat', null, null)).toBe('');
  });
});

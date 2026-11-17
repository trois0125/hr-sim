/**
 * データ（JSON）を型付きで読み込む窓口。
 * エンジンはこのファイル経由でデータを参照する（React には依存しない）。
 */
import coefficientsJson from '../data/coefficients.json';
import foundingsJson from '../data/foundings.json';
import tradingJson from '../data/industries/trading.json';
import locationsJson from '../data/locations.json';
import namesJson from '../data/names.json';
import policiesJson from '../data/policies.json';
import type {
  Coefficient,
  FoundingPattern,
  FoundingPatternId,
  Gender,
  IndustryData,
  IndustryId,
  LocationData,
  PolicySet,
} from './types';

export type NamesData = {
  surnames: string[];
  givenNames: Record<Gender, string[]>;
  companyStems: string[];
};

/** 現在データがある業種。ステップ12で残り3業種を足す */
export const industries: Partial<Record<IndustryId, IndustryData>> = {
  trading: tradingJson as IndustryData,
};

export const foundingPatterns = foundingsJson as FoundingPattern[];
export const locations = locationsJson as LocationData[];
export const names = namesJson as NamesData;
export const defaultPolicies = policiesJson.default as PolicySet;
export const coefficients = coefficientsJson as Coefficient[];

export function getIndustry(id: IndustryId): IndustryData {
  const data = industries[id];
  if (!data) throw new Error(`業種データがありません: ${id}`);
  return data;
}

export function availableIndustries(): IndustryData[] {
  return Object.values(industries).filter((d): d is IndustryData => d !== undefined);
}

export function getFoundingPattern(id: FoundingPatternId): FoundingPattern {
  const p = foundingPatterns.find((f) => f.id === id);
  if (!p) throw new Error(`創業パターンがありません: ${id}`);
  return p;
}

export function getLocation(id: string): LocationData {
  const l = locations.find((x) => x.id === id);
  if (!l) throw new Error(`所在地がありません: ${id}`);
  return l;
}

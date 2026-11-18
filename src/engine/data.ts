/**
 * データ（JSON）を型付きで読み込む窓口。
 * エンジンはこのファイル経由でデータを参照する（React には依存しない）。
 */
import referencesJson from '../data/references.json';
import coefficientsJson from '../data/coefficients.json';
import foundingsJson from '../data/foundings.json';
import manufacturingJson from '../data/industries/manufacturing.json';
import restaurantJson from '../data/industries/restaurant.json';
import saasJson from '../data/industries/saas.json';
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
  Sourced,
} from './types';

export type NamesData = {
  surnames: string[];
  givenNames: Record<Gender, string[]>;
  companyStems: string[];
};

/** 業種のデータ（初級の4業種。§3.2） */
export const industries: Partial<Record<IndustryId, IndustryData>> = {
  trading: tradingJson as IndustryData,
  restaurant: restaurantJson as unknown as IndustryData,
  saas: saasJson as unknown as IndustryData,
  manufacturing: manufacturingJson as unknown as IndustryData,
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

/** 業種の参照値（統計など。ゲームの計算には使わず、画面とバランス確認で比べるためだけに使う） */
export type IndustryReferences = Partial<Record<'attritionRate' | 'laborCostRatio' | 'overtimeHours', Sourced<number>>>;

export function industryReferences(id: IndustryId): IndustryReferences {
  return ((referencesJson as { industries: Record<string, IndustryReferences> }).industries[id] ?? {}) as IndustryReferences;
}

/**
 * 初級者向けの解説（DESIGN.md §14.3。ステップ16）。中身は src/data/guide.json。
 * 制度・法令・個別制度・施策の、要点・メリット・デメリット・向いている会社・導入の注意・よくある失敗・法令のポイントと出典。
 */
import guideJson from '../data/guide.json';

export type GuideSource = { name: string; url: string };

/** 制度のカテゴリ（等級制度など）の解説 */
export type CategoryGuide = { title: string; summary: string; considerations: string[]; legal?: string[]; sources?: GuideSource[] };

/** 選択肢・個別制度・施策の解説 */
export type ItemGuide = {
  title?: string;
  summary: string;
  merits: string[];
  demerits: string[];
  fits: string;
  cautions: string[];
  pitfalls: string[];
  legal?: string[];
  sources?: GuideSource[];
};

/** 法令の解説 */
export type LawGuide = {
  summary: string;
  who: string;
  legal: string[];
  cautions: string[];
  pitfalls: string[];
  sources: GuideSource[];
  /** 確かめきれなかったこと（画面にも出す） */
  todo?: string;
};

export type GuideData = {
  checkedAt: string;
  policyCategories: Record<string, CategoryGuide>;
  /** キーは「カテゴリ.選択肢」（例：grade.skill） */
  policyOptions: Record<string, ItemGuide>;
  laws: Record<string, LawGuide>;
  programs: Record<string, ItemGuide>;
  initiatives: Record<string, ItemGuide>;
};

export const guide = guideJson as unknown as GuideData;

/** 辞典で開く項目の指定 */
export type GuideRef =
  | { kind: 'category'; id: string }
  | { kind: 'option'; id: string }
  | { kind: 'law'; id: string }
  | { kind: 'program'; id: string }
  | { kind: 'initiative'; id: string };

export const optionKey = (category: string, option: string) => `${category}.${option}`;

/** 画面の文言（日本語）。UI の文字列はすべてここに置く。 */
export const strings = {
  appTitle: '人事部、創業から。',
  appSubtitle: '人事・経営を学ぶシミュレーション',
  wip: '準備中です（ステップ1：土台づくり）',
} as const;

/** 法令の画面の文言（ステップ9で画面に使う） */
export const lawStrings = {
  milestoneTitle: (headcount: number) => `社員が${headcount}人になりました`,
  milestoneLead: '新しく生じた義務があります。対応を選んでください。',
  responses: {
    immediate: { label: 'すぐ対応する', note: '費用と手間がかかる。自社で対応すると、まれに不備が残る' },
    outsource: { label: '社労士に依頼する', note: '費用は高めだが確実' },
    postpone: { label: '後回しにする', note: '費用はかからないが、違反の状態になる。臨検や退職者の申告で発覚すると是正勧告を受ける' },
  },
  /** 安衛法の義務を表示するときに必ず出す注記（CLAUDE.md） */
  workplaceUnitNote:
    '※ 労働安全衛生法の義務は、本来は会社全体ではなく事業場（支店・工場など）ごとの人数で決まります。このゲームでは「1社＝1事業場」に単純化しています。',
  overtimeWarning: 'このまま残業させると、36協定なしの残業になります（労働基準法違反）。',
} as const;

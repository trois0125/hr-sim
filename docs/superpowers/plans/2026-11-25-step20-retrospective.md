# ステップ20：社史レポートの「変更の振り返り」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 社史レポートの先頭に人事スタイル診断を置き、そのあとに、制度の変更・施策・個別制度・組織改編のうち数字が大きく動いたもの（最大5件）を「前・直後・1年後」のカードで振り返れるようにする。

**Architecture:** 新しい `src/report/retrospective.ts`（UI に依存しない）が、今ある記録（`policyChanges`・`decisions`・`programLog`・`organization.log`・`history`・`departures`・`voices`）から振り返りのカードを組み立てる。エンジンとセーブの形式は変えない。今の分岐点の解説は、制度の変更を除いて「法令と出来事の学び」の小さな欄に縮める。`End.tsx` でブロックの順を入れ替え、カードを描く。

**Tech Stack:** TypeScript、React、Vitest、既存の係数台帳（`src/data/coefficients.json` と `coef()`）

**Spec:** `DESIGN.md` §14.7（と §11 の表のステップ20の行）

## Global Constraints

- `src/report/` は React や画面に依存させない
- 数値をコードに直接書かない。係数台帳に置き、`basis: "assumption"` と `source`（「仮置き。…」）を付ける
- 乱数は使わない（振り返りは同じ状態から同じ結果）
- 画面の文言は日本語で `src/ui/strings.ts` に置く
- エンジン（`src/engine/`）とセーブの形式は変えない
- スマホ 360px で横にはみ出さない
- カードの注記の文：「前と後を比べたものです。景気や会社の成長など、制度以外の動きも混ざっています」
- 完了したら `PROGRESS.md` に記録する（日付、ステップ番号、決めたこと、やったこと、バランス、残った課題）

## Review Focus

1. 早く倒産した会社や10年のゲームで、条件を満たす変更が1件もない → 振り返りは「目立った変化はなかった」と出て落ちない（Task 3 のテスト）
2. 売上が0の期間（SaaS の創業直後など）→ 人件費率は `null` になり、画面は「－」、点数に使わない。NaN が出ない（Task 2 のテスト）
3. 4か月おきに変更を続けた会社 → 1つの長いまとまりになり、落ちない。見出しが長くなりすぎない（Task 1 のテストと Task 5 の見出しの省略）
4. ゲーム全体で指標がほとんど動かない会社（ふだんの揺れが0）→ 0で割らず、点数は0（Task 2 のテスト）
5. 納得感の内訳（`org`）がない古い記録 → 内訳の欄だけ出さず、ほかは出る（Task 3 のテスト）

---

## ファイルの構成

| ファイル | 役割 |
|---|---|
| Create `src/report/retrospective.ts` | 変更の拾い出し・まとめ、期間の数字、ふだんの揺れ、カードの組み立てと選択 |
| Create `src/report/retrospective.test.ts` | 上のテスト |
| Modify `src/data/coefficients.json` | `retrospective.*` の6件を足す |
| Modify `src/report/history.ts` | 分岐点の解説から制度の変更を除き、「法令と出来事の学び」にする |
| Modify `src/report/report.test.ts` | 分岐点のテストを新しい形に合わせる |
| Modify `src/ui/screens/End.tsx` | ブロックの順の入れ替え、振り返りのカード |
| Modify `src/ui/strings.ts` | `reportStrings` に振り返りと学びの欄の文言 |
| Modify `src/ui/styles.css` | カードの見た目 |
| Modify `PROGRESS.md` | ステップ20の記録 |

---

### Task 1: 変更の拾い出しとまとめ（係数台帳を含む）

**Files:**
- Modify: `src/data/coefficients.json`（末尾に足す）
- Create: `src/report/retrospective.ts`
- Test: `src/report/retrospective.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ChangeItem =
    | { month: number; kind: 'policy'; changes: { category: keyof PolicySet; option: string }[]; method: ChangeMethod | null }
    | { month: number; kind: 'initiative'; eventId: string; choiceIndex: number }
    | { month: number; kind: 'program'; programId: ProgramId; action: 'install' | 'stop' }
    | { month: number; kind: 'reorg'; from: OrgForm; to: OrgForm };
  export type ChangeGroup = { first: number; last: number; items: ChangeItem[] };
  export function collectChanges(state: CompanyState): ChangeItem[];      // 月の順（同じ月は policy, initiative, program, reorg の順）
  export function groupChanges(items: readonly ChangeItem[]): ChangeGroup[];
  ```

係数台帳に足す6件（すべて `basis: "assumption"`、`source` は「仮置き。ステップ20の振り返りの…」と用途を書く）：

| id | value | unit |
|---|---|---|
| `retrospective.group_gap_months` | 6 | か月 |
| `retrospective.window_months` | 6 | か月 |
| `retrospective.min_before_months` | 3 | か月 |
| `retrospective.notable_score` | 1.5 | 倍（Task 6 で見直す） |
| `retrospective.flat_ratio` | 0.5 | 倍 |
| `retrospective.max_cards` | 5 | 件 |

- [ ] **Step 1: 係数台帳に6件を足す**（既存の項目と同じ形：`id`・`value`・`unit`・`basis`・`source`）

- [ ] **Step 2: 失敗するテストを書く**

```ts
describe('変更の拾い出し', () => {
  it('制度の変更・施策・個別制度・組織改編を月の順に拾う。創業時の制度は拾わない', () => {
    const c = played(11);
    c.policyChanges = [{ month: 40, categories: ['training'], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 }];
    c.programLog = [{ month: 20, id: programDefs[0]!.id, action: 'install' }];
    c.organization.log = [{ month: 60, from: 'direct', to: 'functional', method: 'careful' }];
    const initiative = eventDefs.find((e) => e.trigger.type === 'initiative')!;
    c.decisions = [{ month: 30, eventId: initiative.id, choiceIndex: 0, targetId: null, axes: {}, diagnosis: {}, auto: false }];
    expect(collectChanges(c).map((x) => [x.month, x.kind])).toEqual([[20, 'program'], [30, 'initiative'], [40, 'policy'], [60, 'reorg']]);
  });

  it('施策でない出来事での判断は拾わない', () => {
    const c = played(11);
    c.policyChanges = []; c.programLog = []; c.organization.log = [];
    c.decisions = c.decisions.filter((d) => eventDefs.find((e) => e.id === d.eventId)?.trigger.type !== 'initiative');
    expect(collectChanges(c)).toEqual([]);
  });
});

describe('変更のまとめ', () => {
  const at = (month: number): ChangeItem => ({ month, kind: 'program', programId: 'x', action: 'install' });
  it('前の変更から6か月以内ならまとめ、離れていれば別にする', () => {
    expect(groupChanges([at(10), at(16), at(30)]).map((g) => [g.first, g.last, g.items.length])).toEqual([[10, 16, 2], [30, 30, 1]]);
  });
  it('4か月おきに続く変更は、1つの長いまとまりになる', () => {
    const g = groupChanges([0, 4, 8, 12, 16, 20].map((m) => at(m + 10)));
    expect(g).toHaveLength(1);
    expect([g[0]!.first, g[0]!.last]).toEqual([10, 30]);
  });
});
```

`played` は `report.test.ts` と同じヘルパー（`runToEnd(setFoundingPolicies(generateCompany({ seed, industryId: 'trading' }), policies))`）をこのファイルにも置く。`DecisionRecord` の `axes`・`diagnosis` の型に合わない場合は、型に合う空の値にする。

- [ ] **Step 3: テストが落ちるのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: FAIL（`collectChanges` がない）

- [ ] **Step 4: `collectChanges` と `groupChanges` を実装する**

制度の変更の `option` は、`history.ts` の `policiesAt` と同じく、その月の記録の制度（なければ今の制度）から取る。`policiesAt` を `history.ts` から export して使う。間隔は `coef('retrospective.group_gap_months')`。「前の変更から」は、まとまりの最後の変更の月から数える。

- [ ] **Step 5: テストが通るのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data/coefficients.json src/report/retrospective.ts src/report/retrospective.test.ts src/report/history.ts
git commit -m "ステップ20：振り返りの対象の変更を拾い、近いものをまとめる"
```

---

### Task 2: 期間の数字とふだんの揺れ

**Files:**
- Modify: `src/report/retrospective.ts`
- Test: `src/report/retrospective.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const RETRO_METRICS = ['laborCostRatio', 'operatingProfit', 'attritionRate', 'engagement'] as const;
  export type RetroMetric = (typeof RETRO_METRICS)[number];
  export type WindowStats = {
    months: number;
    laborCostRatio: number | null;   // 人件費の合計÷売上の合計。売上0なら null
    operatingProfit: number;         // 月平均
    attritionRate: number;           // 年に換算（退職の合計÷平均社員数×12÷月数）。平均社員数0なら0
    hires: number;                   // 合計
    engagement: number;              // 月平均
    economy: number;                 // 月平均
    factors: FactorScores | null;    // org.factors がある月の平均。1か月もなければ null
    topReason: AttritionReason | null; // その期間に自分から辞めた人（kind==='resignation'）でいちばん多い理由
  };
  /** 月 from 以上 to 未満の記録。1か月もなければ null */
  export function windowStats(state: CompanyState, from: number, to: number): WindowStats | null;
  /** ゲーム全体で、6か月平均がその前の6か月平均から動いた量（絶対値）の中央値。計算できなければ0 */
  export function typicalSwing(state: CompanyState, metric: RetroMetric): number;
  /** |a−b| ÷ swing。a か b が null、または swing が0なら0 */
  export function swingScore(a: number | null, b: number | null, swing: number): number;
  ```

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('期間の数字', () => {
  it('6か月の人件費率・営業利益・離職率・入社・納得感を記録から計算する', () => {
    const c = played(11);
    const rows = c.history.filter((r) => r.month >= 24 && r.month < 30);
    const w = windowStats(c, 24, 30)!;
    const rev = rows.reduce((s, r) => s + r.revenue, 0);
    expect(w.months).toBe(6);
    expect(w.laborCostRatio).toBeCloseTo(rows.reduce((s, r) => s + r.labor.total, 0) / rev);
    expect(w.operatingProfit).toBeCloseTo(rows.reduce((s, r) => s + r.operatingProfit, 0) / 6);
    expect(w.hires).toBe(rows.reduce((s, r) => s + r.hires, 0));
  });
  it('売上が0の期間は人件費率が null で、NaN が出ない', () => {
    const c = played(11);
    for (const r of c.history) if (r.month < 6) r.revenue = 0;
    const w = windowStats(c, 0, 6)!;
    expect(w.laborCostRatio).toBeNull();
    expect(Number.isNaN(w.attritionRate)).toBe(false);
  });
  it('記録のない期間は null', () => {
    expect(windowStats(played(11), 9999, 10005)).toBeNull();
  });
  it('納得感の内訳がない古い記録では factors が null', () => {
    const c = played(11);
    for (const r of c.history) delete r.org;
    expect(windowStats(c, 24, 30)!.factors).toBeNull();
  });
});

describe('ふだんの揺れ', () => {
  it('動きのある会社では正の値', () => {
    expect(typicalSwing(played(11), 'operatingProfit')).toBeGreaterThan(0);
  });
  it('ずっと同じ値なら0で、点数も0（0で割らない）', () => {
    const c = played(11);
    for (const r of c.history) r.avgEngagement = 50;
    expect(typicalSwing(c, 'engagement')).toBe(0);
    expect(swingScore(55, 50, 0)).toBe(0);
  });
  it('点数は差÷ふだんの揺れ', () => {
    expect(swingScore(0.4, 0.3, 0.05)).toBeCloseTo(2);
    expect(swingScore(null, 0.3, 0.05)).toBe(0);
  });
});
```

- [ ] **Step 2: テストが落ちるのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: FAIL（`windowStats` がない）

- [ ] **Step 3: 実装する**

`typicalSwing`：月 m（6の倍数でなくてよい、毎月ずらす）ごとに `windowStats(m, m+6)` と `windowStats(m−6, m)` の差の絶対値を取り、null を除いた中央値。窓の長さは `coef('retrospective.window_months')`。

- [ ] **Step 4: テストが通るのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/report/retrospective.ts src/report/retrospective.test.ts
git commit -m "ステップ20：振り返りの期間の数字とふだんの揺れ"
```

---

### Task 3: カードの組み立てと選択

**Files:**
- Modify: `src/report/retrospective.ts`
- Test: `src/report/retrospective.test.ts`

**Interfaces:**
- Consumes: Task 1・2 のすべて
- Produces:
  ```ts
  export type Arrow = { dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral' };
  export type RetroCard = {
    group: ChangeGroup;
    before: WindowStats;
    soon: WindowStats;    // 最後の変更の月から6か月
    later: WindowStats;   // その次の6か月（7〜12か月目）
    score: number;
    arrows: Record<RetroMetric, { soon: Arrow; later: Arrow }>;
    factorUp: EngagementFactor | null;    // later と before で最も上がった要因（上がったものがなければ null）
    factorDown: EngagementFactor | null;  // 最も下がった要因（下がったものがなければ null）
    voices: VoiceRecord[];                // 最大2つ：不満の声1つ・前向きな声1つ
  };
  export function buildRetrospective(state: CompanyState): RetroCard[];
  export function buildCards(state: CompanyState): RetroCard[];  // 外す条件だけ当て、目安で選ぶ前のカード（月の順）
  ```

決まりごと（DESIGN.md §14.7）：
- 前＝`[first − W, first)`、直後＝`[last, last + W)`、後＝`[last + W, last + 2W)`（W＝`window_months`）
- 前が `min_before_months` に満たない、または後の記録が W か月そろわないまとまりは外す
- 点数＝4指標それぞれの `max(swingScore(soon, before), swingScore(later, before))` の最大
- 点数が `notable_score` 以上のものを点数の高い順に `max_cards` 件まで選び、月の順に並べて返す
- 矢印：差の絶対値がふだんの揺れ×`flat_ratio` 未満なら `flat`。営業利益↑・離職率↓・納得感↑が good、逆が bad。人件費率はいつも `neutral`。flat はいつも `neutral`
- 声：期間 `[last, last + 2W)` の `kind==='voice'` から、不満（negative）と前向き（positive）をそれぞれ1つ。不満は `factorDown`、前向きは `factorUp` についての声を優先し、なければ同じ調子の声。候補の並びの真ん中のもの（乱数なし）

- [ ] **Step 1: 失敗するテストを書く**

```ts
describe('変更の振り返り', () => {
  /** 3年回し、研修を売上比1%に変え、そのあと1年半回した会社と、変えなかった会社 */
  function pair() {
    const base = runToEnd(setFoundingPolicies(generateCompany({ seed: 21, industryId: 'trading' }), { ...defaultPolicies, training: '0' }), 36);
    const changed = runToEnd(changePolicies(base, { ...base.policies, training: '1' }), 18);
    const control = runToEnd(base, 18);
    return { changed, control, month: base.month };
  }

  it('研修を増やすと、1年後の人件費率が変えなかった会社の同じ時期より高い（制度の方向に動く）', () => {
    const { changed, control, month } = pair();
    const W = coef('retrospective.window_months');
    const a = windowStats(changed, month + W, month + 2 * W)!.laborCostRatio!;
    const b = windowStats(control, month + W, month + 2 * W)!.laborCostRatio!;
    expect(a).toBeGreaterThan(b);
  });

  it('前・直後・後の期間がそろい、人件費率の矢印は良い悪いを付けない', () => {
    const { changed } = pair();
    const cards = buildCards(changed);
    const card = cards.find((x) => x.group.items.some((i) => i.kind === 'policy'))!;
    expect(card.before.months).toBe(coef('retrospective.window_months'));
    expect(card.later.months).toBe(coef('retrospective.window_months'));
    expect(card.arrows.laborCostRatio.later.tone).toBe('neutral');
  });

  it('終わりまで1年ない変更と、前が3か月に満たない変更は出ない', () => {
    const c = played(11);
    c.programLog = [];
    c.organization.log = [];
    c.decisions = [];
    c.policyChanges = [
      { month: 1, categories: ['training'], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 },
      { month: c.month - 6, categories: ['training'], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 },
    ];
    expect(buildCards(c)).toEqual([]);
  });

  it('最大5件、月の順、点数は目安以上', () => {
    const c = played(11);
    c.policyChanges = Array.from({ length: 12 }, (_, i) => ({ month: 20 + i * 14, categories: ['training' as const], resistance: 4, method: null, transition: false, affected: 0, averageCutPct: 0 }));
    const r = buildRetrospective(c);
    expect(r.length).toBeLessThanOrEqual(coef('retrospective.max_cards'));
    for (let i = 1; i < r.length; i++) expect(r[i]!.group.first).toBeGreaterThan(r[i - 1]!.group.first);
    for (const x of r) expect(x.score).toBeGreaterThanOrEqual(coef('retrospective.notable_score'));
  });

  it('変更がなければ空', () => {
    const c = played(11);
    c.policyChanges = []; c.programLog = []; c.organization.log = []; c.decisions = [];
    expect(buildRetrospective(c)).toEqual([]);
  });

  it('同じ状態からは同じ振り返り', () => {
    const { changed } = pair();
    expect(buildRetrospective(structuredClone(changed))).toEqual(buildRetrospective(changed));
  });

  it('納得感の内訳がない古い記録でも落ちず、要因は null', () => {
    const { changed } = pair();
    for (const r of changed.history) delete r.org;
    for (const card of buildCards(changed)) {
      expect(card.factorUp).toBeNull();
      expect(card.factorDown).toBeNull();
    }
  });

  it('声は最大2つで、直後〜1年後の期間のもの', () => {
    const { changed } = pair();
    for (const card of buildCards(changed)) {
      expect(card.voices.length).toBeLessThanOrEqual(2);
      for (const v of card.voices) {
        expect(v.month).toBeGreaterThanOrEqual(card.group.last);
        expect(v.month).toBeLessThan(card.group.last + 2 * coef('retrospective.window_months'));
      }
    }
  });
});
```

注：目安で選ぶ前のカードを確かめるために、`buildRetrospective` を `buildCards(state): RetroCard[]`（外す条件だけ当て、選択はしない）と選択に分ける。Produces に `export function buildCards(state: CompanyState): RetroCard[];` を足す。

- [ ] **Step 2: テストが落ちるのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: FAIL

- [ ] **Step 3: `buildCards` と `buildRetrospective` を実装する**（上の決まりごとのとおり）

- [ ] **Step 4: テストが通るのを確かめる**

Run: `npx vitest run src/report/retrospective.test.ts`
Expected: PASS。研修の方向のテストが落ちるときは、エンジンの研修費の扱いを見て（人件費の `training` に入るか）、方向のテストを変えずに原因を報告する

- [ ] **Step 5: Commit**

```bash
git add src/report/retrospective.ts src/report/retrospective.test.ts
git commit -m "ステップ20：振り返りのカード（前・直後・1年後、矢印、納得感の要因、社員の声）と大きな変化の選択"
```

---

### Task 4: 分岐点の解説を「法令と出来事の学び」にする

**Files:**
- Modify: `src/report/history.ts:155-240`
- Modify: `src/report/report.test.ts:175-210`

**Interfaces:**
- Produces（`TurningPoint` から `policy` を除き、名前を変える）：
  ```ts
  export const LESSONS_MAX = 5;
  export type LessonPoint =
    | { month: number; kind: 'event'; eventId: string; choiceIndex: number; lesson: string }
    | { month: number; kind: 'law'; ruleId: string; violationMonths: number; lesson: string };
  export function pickLessons(state: CompanyState): LessonPoint[];
  ```
  法令は今のまま2つまで、6か月以上の後回しだけ。出来事での判断の重みも今のまま。`policyLessons` は診断のデータに残す（ほかで使っていなければ、使っていないことだけ PROGRESS.md に書き、消さない）

- [ ] **Step 1: テストを新しい形に書き換える**

今の3つのテストを次にする：
- 「主な判断を最大5つ、月の順に挙げる。学びの一言がある」：`pickLessons`、件数は `toBeGreaterThanOrEqual(1)` と `LESSONS_MAX` 以下
- 「法令を長く後回しにした義務は優先して挙がる。制度の変更は挙がらない」：`policyChanges` に1件足しても `kind === 'policy'` がない（型の上でもない）こと、法令が挙がること
- 「法令は2つまでにして、出来事での判断も入れる」

- [ ] **Step 2: テストが落ちるのを確かめる**

Run: `npx vitest run src/report/report.test.ts`
Expected: FAIL（`pickLessons` がない）

- [ ] **Step 3: `history.ts` を直す**（`pickTurningPoints`・`TurningPoint`・`TURNING_POINTS_*` を上の名前に置き換え、制度の変更の候補を除く）

- [ ] **Step 4: テストが通るのを確かめる**

Run: `npx vitest run src/report`
Expected: PASS（`End.tsx` の型エラーは Task 5 で直すので、ここでは `npm test` だけ）

- [ ] **Step 5: Commit**

```bash
git add src/report/history.ts src/report/report.test.ts
git commit -m "ステップ20：分岐点の解説から制度の変更を除き、法令と出来事の学びにする"
```

---

### Task 5: 社史レポートの画面

**Files:**
- Modify: `src/ui/screens/End.tsx`
- Modify: `src/ui/strings.ts`（`reportStrings`）
- Modify: `src/ui/styles.css`

**Interfaces:**
- Consumes: `buildRetrospective`・`RetroCard`・`RetroMetric`・`Arrow`（Task 3）、`pickLessons`・`LessonPoint`（Task 4）、既存の `factorNames`・`reasonNames`・`orgStrings.forms`・`getProgram`・`optionName`・`policyStrings`

並び（`End.tsx` の section の順）：1 人事スタイル診断 → 2 変更の振り返り → 3 法令と出来事の学び → 4 会社の一生 → 5 数字の推移 → 6 同期創業の他社 → 7 従業員の声。

文言（`reportStrings` に足す・直す。文はこのまま使う）：
- `blocks.retro`: `'変更の振り返り'`、`blocks.turning` を `'法令と出来事の学び'` に
- `retroLead`: `'途中で変えた制度・打った施策・整えた個別制度・組織改編のうち、数字が大きく動いたものを挙げます。'`
- `retroNote`: `'前と後を比べたものです。景気や会社の成長など、制度以外の動きも混ざっています'`
- `retroEmpty`: `'1年後まで見届けた変更のうち、目立った変化はありませんでした。'`
- `retroCols`: `{ before: '前の半年', soon: '直後の半年', later: '1年後（7〜12か月目）' }`
- `retroRows`: `{ laborCostRatio: '人件費率', operatingProfit: '営業利益（月平均）', attritionRate: '離職率（年換算）', engagement: '納得感（平均）', hires: '入社（人）', economy: '景気（同じ時期）' }`
- `retroFactors`: `(up: string | null, down: string | null)` → 「上がった：〇〇／下がった：〇〇」（片方 null ならその側を省く）
- `retroReasons`: `(before: string | null, later: string | null)` → 「いちばん多い退職理由：前は〇〇、1年後は〇〇」（null は「なし」）
- `retroItem`：施策 `施策：{イベントの題}`、個別制度 `{名前}を整えた`／`{名前}を止めた`、組織改編 `組織を{前}から{後}に`、制度は既存の `changesText` を使う
- `turningLead` を `'法令の義務を長く後回しにしたことと、出来事での判断から、学びの一言を挙げます。'` に

カードの見出しは `dateLabel(group.first)` と項目を「、」でつなぐ。項目が4つを超えたら3つと「ほか{n}件」にする。人件費率が null の期間は「－」。矢印は ↑↓→ と tone ごとの色（good／bad／neutral のクラス）。

- [ ] **Step 1: 文言・画面・CSS を書く**

- [ ] **Step 2: 型とテストと書式を確かめる**

Run: `npm run typecheck && npm test`
Expected: エラーなし、全件 PASS

- [ ] **Step 3: ブラウザで確かめる**（1280px と 360px）

`npm run dev` を開き、開発用の `window.__game` で会社を作って、途中で研修などの制度を変え、32倍速で最後まで進める。確かめること：診断が先頭、振り返りのカードが出る（または「目立った変化は…」）、表が横にはみ出さない、コンソールにエラーがない。スクリーンショットを scratchpad に残す。

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/End.tsx src/ui/strings.ts src/ui/styles.css
git commit -m "ステップ20：社史レポートの並びを変え、変更の振り返りのカードを出す"
```

---

### Task 6: 目安の見直しと記録

**Files:**
- Modify: `src/data/coefficients.json`（`retrospective.notable_score` の値と source）
- Modify: `PROGRESS.md`

- [ ] **Step 1: 目安の分布を見る**

scratchpad に一時的なスクリプトを書き、4業種×50社を回して、各社で途中の制度変更（`scripts/simulate.ts` の途中変更と同じやり方、なければ5年ごとに研修か賞与を1つ変える）を入れ、`buildCards` の点数の分布と `buildRetrospective` の件数を出す。目安：変更が3件以上ある会社の多くで1〜5件のカードが出て、0件の会社が全体の半分を超えない。外れたら `notable_score` を変え、source に「はじめ1.5にしたら…」と理由を書く。

- [ ] **Step 2: 全体を確かめる**

Run: `npm run typecheck && npm test && npm run build`
Expected: すべて成功

- [ ] **Step 3: PROGRESS.md にステップ20を書く**（決めたこと、やったこと、テストの件数、目安の分布、残った課題）

- [ ] **Step 4: Commit と push**

```bash
git add src/data/coefficients.json PROGRESS.md
git commit -m "ステップ20：振り返りの目安の見直しと記録"
git push -u origin claude/brave-pasteur-l50kcw
```

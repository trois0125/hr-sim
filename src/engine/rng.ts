/**
 * シード付き乱数（mulberry32）。
 *
 * - ゲーム内の乱数はすべてここを通す。`Math.random()` は使わない。
 * - 同じシードなら必ず同じ乱数列になる。
 * - 用途ごとに独立した系列（ストリーム）を 1つのシードから作る。
 *   採用の抽選が 1回増えても、イベントや退職の乱数列はずれない。
 *
 * ここにある数値（ハッシュ定数など）はアルゴリズムの一部で、ゲームの係数ではない。
 */

/** 乱数の内部状態。セーブデータにそのまま保存できる。 */
export type RngState = { seed: number; state: number };

export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** [min, max) の一様乱数 */
  range(min: number, max: number): number;
  /** [min, max] の整数（両端を含む） */
  int(min: number, max: number): number;
  /** 確率 p で true */
  chance(p: number): boolean;
  /** 配列から1つ選ぶ */
  pick<T>(items: readonly T[]): T;
  /** 重み付きで1つ選ぶ。重みは0以上で、合計が正であること */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
  /** 正規乱数（Box–Muller） */
  normal(mean?: number, sd?: number): number;
  /** ガンマ乱数（shape > 0, scale = 1）。ディリクレ分布の抽選に使う */
  gamma(shape: number): number;
  /** 配列をシャッフルした新しい配列を返す（元の配列は変えない） */
  shuffle<T>(items: readonly T[]): T[];
  /** 現在の状態を取り出す（セーブ用） */
  getState(): RngState;
}

/** 文字列を 32bit 整数にする（FNV-1a）。ストリームのシード派生に使う。 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 2つの 32bit 整数を混ぜる（murmur3 の finalizer）。 */
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32Step(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** シードから乱数を作る。`fromState` を渡すと保存した状態から再開する。 */
export function createRng(seed: number, fromState?: number): Rng {
  const normalizedSeed = seed >>> 0;
  let state = fromState === undefined ? normalizedSeed : fromState >>> 0;

  const next = (): number => {
    const r = mulberry32Step(state);
    state = r.state;
    return r.value;
  };

  const rng: Rng = {
    next,
    range(min, max) {
      if (!(max >= min)) throw new RangeError(`range: max(${max}) < min(${min})`);
      return min + next() * (max - min);
    },
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        throw new RangeError(`int: 整数を指定してください (${min}, ${max})`);
      }
      if (max < min) throw new RangeError(`int: max(${max}) < min(${min})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('pick: 空の配列からは選べません');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weightedPick(items, weights) {
      if (items.length === 0 || items.length !== weights.length) {
        throw new RangeError('weightedPick: items と weights の長さが不正です');
      }
      let total = 0;
      for (const w of weights) {
        if (!(w >= 0)) throw new RangeError(`weightedPick: 負の重み (${w})`);
        total += w;
      }
      if (total <= 0) throw new RangeError('weightedPick: 重みの合計が0です');
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i] as number;
        if (r < 0) return items[i] as (typeof items)[number];
      }
      // 浮動小数の誤差で末尾まで来た場合は、重みが正の最後の要素を返す
      for (let i = items.length - 1; i >= 0; i--) {
        if ((weights[i] as number) > 0) return items[i] as (typeof items)[number];
      }
      throw new Error('weightedPick: unreachable');
    },
    normal(mean = 0, sd = 1) {
      // 1 - next() で (0, 1] にして log(0) を避ける
      const u1 = 1 - next();
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + z * sd;
    },
    gamma(shape) {
      if (!(shape > 0)) throw new RangeError(`gamma: shape は正の数 (${shape})`);
      // Marsaglia–Tsang 法。shape < 1 は shape+1 で引いて補正する
      if (shape < 1) return rng.gamma(shape + 1) * Math.pow(1 - next(), 1 / shape);
      const d = shape - 1 / 3;
      const c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x: number;
        let v: number;
        do {
          x = rng.normal();
          v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = 1 - next();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as (typeof out)[number];
        out[i] = out[j] as (typeof out)[number];
        out[j] = tmp;
      }
      return out;
    },
    getState() {
      return { seed: normalizedSeed, state };
    },
  };
  return rng;
}

/** 保存した状態から乱数を復元する。 */
export function restoreRng(saved: RngState): Rng {
  return createRng(saved.seed, saved.state);
}

/** 1つのシードから、ラベルごとに独立した系列のシードを作る。 */
export function deriveSeed(seed: number, label: string): number {
  return mix(seed >>> 0, hashString(label));
}

/**
 * 用途ごとの乱数系列。§2.1 のティック処理順に対応する。
 * 系列を足すときは末尾に追加する（既存の系列のシードは変わらない）。
 */
export const RNG_STREAM_NAMES = [
  'generation', // 会社・社員の生成
  'market', // 市場と景気
  'hiring', // 採用
  'performance', // 稼働と成果
  'attrition', // 退職
  'evaluation', // 評価と昇給
  'laws', // 法令チェック（臨検など）
  'events', // イベントの抽選
  'voices', // 従業員の声（セリフ）
] as const;

export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];
export type RngStreams = Record<RngStreamName, Rng>;
export type RngStreamsState = Record<RngStreamName, RngState>;

export function createStreams(seed: number): RngStreams {
  const out = {} as RngStreams;
  for (const name of RNG_STREAM_NAMES) out[name] = createRng(deriveSeed(seed, name));
  return out;
}

export function getStreamsState(streams: RngStreams): RngStreamsState {
  const out = {} as RngStreamsState;
  for (const name of RNG_STREAM_NAMES) out[name] = streams[name].getState();
  return out;
}

export function restoreStreams(saved: RngStreamsState): RngStreams {
  const out = {} as RngStreams;
  for (const name of RNG_STREAM_NAMES) out[name] = restoreRng(saved[name]);
  return out;
}

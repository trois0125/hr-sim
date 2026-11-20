/** 画面の設定（ゲームの係数ではない） */

/** 速度の選択肢（DESIGN.md §2.1：0.5x / 1x / 2x / 4x と一時停止） */
export const SPEEDS = [0.5, 1, 2, 4] as const;
/** 開発中だけ使える速い速度（動作の確認用） */
export const DEV_SPEEDS = import.meta.env.DEV ? [32] : [];
/** 社員の一覧に最初に出す人数 */
export const STAFF_PAGE = 30;

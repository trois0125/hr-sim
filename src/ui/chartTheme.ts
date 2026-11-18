/**
 * グラフの色と線（ステップ15）。系列の色は決まった順に割り当て、使い回さない。
 * 色の組み合わせは validate_palette.js で確かめた（紙の色 #f8faf9 の上で、隣どうしの色覚の差 ΔE≥9.1）。
 * 黄・水色・桃は紙の上で 3:1 に届かないので、どのグラフにも「表で見る」を付けて補う
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;
export const GRID = '#dde2df';
export const AXIS = '#4a5670';
export const BASELINE = '#9aa3a0';
export const AXIS_TICK = { fontSize: 11, fill: AXIS };

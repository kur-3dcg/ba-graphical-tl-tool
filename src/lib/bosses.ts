export interface BossPreset {
  name: string;
  limitSec: number;
  costCap: number;
}

const groups: [number, number, string[]][] = [
  [180, 11, ['KAITEN FX Mk.0', 'ビナー']],
  [240, 11, ['グレゴリオ', 'クロカゲ', 'ケセド', 'ゲブラ', 'ゴズ', 'シロクロ', 'ヒエロニムス', 'ペロロジラ', 'ホド', 'ホバークラフト']],
  [270, 11, ['イェソド', 'ドラム缶ガニ']],
  [270, 22, ['セトの憤怒']],
  [300, 22, ['コクマー', 'ティファレト']],
];

export const BOSS_PRESETS: BossPreset[] = groups.flatMap(([limitSec, costCap, names]) =>
  names.map((name) => ({ name, limitSec, costCap })),
);

export function formatLimit(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** テキストから画像への変換ルール（書き方ヘルプ） */
const RULES: [string, string, string][] = [
  ['区切り', 'スペース・タブ・全角スペースで列を区切る（どれでも同じ）', '3:55\tユウカ\t時間指定'],
  ['列の分け方', 'タイミング\t生徒\tコメント', 'NS着弾後 キサキ 条件指定'],
  ['時刻', 'm:ss（小数可）。m:ss.xxx に整形される', '3:55 → 3:55.000'],
  ['コスト', '数値・丸数字・範囲・付近', '6 / 5.95 / ⑤ / 5〜6 / 7付近'],
  ['連続（最速）', '→ でつなぐ。2人目以降は最速扱い。区切り無しで並べても可', 'ユウカ→ホシノ→ヒフミ'],
  ['対象指定', '名前[対象]。右上に対象を小さく表示（全角［］も可）', 'ウイ[ミカ]'],
  ['コピー', 'C＋名前。Cバッジ付きで表示。対象指定と併用可', 'リオ→Cホシノ / Cミカ[ウイ]'],
  ['生徒名＋文字', '生徒名以降はコメントへ回る', 'ホシノEX → ホシノ ＋ EX'],
  ['フェーズ見出し', '行頭が「移行」', '移行 第2フェーズ'],
  ['注釈', '生徒名を含まない行はそのまま注釈として表示', 'ボス移動まで待機'],
  ['改ページ', '--- / ーーー / 改ページ だけの行の次から改ページ', '---'],
];

export function FormatHelp() {
  return (
    <div className="mb-2 max-h-[40vh] overflow-auto rounded-lg border border-slate-300 bg-white p-3 text-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs text-slate-500">
            <th className="py-1 pr-3">項目</th>
            <th className="py-1 pr-3">説明</th>
            <th className="py-1">例</th>
          </tr>
        </thead>
        <tbody>
          {RULES.map(([name, desc, example]) => (
            <tr key={name} className="border-b border-slate-100 last:border-0">
              <th className="whitespace-nowrap py-1 pr-3 text-left align-top font-bold text-slate-700">{name}</th>
              <td className="py-1 pr-3 align-top text-slate-600">{desc.replace(/\t/g, ' ⇥ ')}</td>
              <td className="whitespace-pre py-1 align-top font-mono text-xs text-slate-500">{example.replace(/\t/g, '⇥')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">
        ⇥ はタブ。生徒名は ST/SP データと「ボス・別名設定」の別名で照合します。未登録の名前は警告が行の下に出ます。
      </p>
    </div>
  );
}

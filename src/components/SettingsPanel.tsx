import type { BossSetting } from '../lib/parser';
import type { Alias } from '../lib/students';
import { STUDENTS } from '../lib/students';
import { BOSS_PRESETS, formatLimit } from '../lib/bosses';

interface Props {
  bossName: string;
  boss: BossSetting;
  onBossChange: (name: string, boss: BossSetting) => void;
  aliases: Alias[];
  onAliasesChange: (a: Alias[]) => void;
}

export function SettingsPanel({ bossName, boss, onBossChange, aliases, onAliasesChange }: Props) {
  const preset = BOSS_PRESETS.find((b) => b.name === bossName);
  const edited = preset && (preset.limitSec !== boss.limitSec || preset.costCap !== boss.costCap);
  const known = new Set(STUDENTS.map((s) => s.name));

  const updateAlias = (i: number, patch: Partial<Alias>) =>
    onAliasesChange(aliases.map((a, k) => (k === i ? { ...a, ...patch } : a)));

  return (
    <div className="grid gap-6 p-3 text-sm lg:grid-cols-2">
      <section className="space-y-2">
        <h3 className="font-bold">ボス設定</h3>
        <label className="flex items-center gap-2">
          プリセット
          <select
            className="rounded border border-slate-300 px-1"
            value={bossName}
            onChange={(e) => {
              const p = BOSS_PRESETS.find((b) => b.name === e.target.value);
              onBossChange(e.target.value, p ? { limitSec: p.limitSec, costCap: p.costCap } : boss);
            }}
          >
            <option value="">（手動設定）</option>
            {BOSS_PRESETS.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}（{formatLimit(b.limitSec)} / コスト上限{b.costCap}）
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1">
            制限時間
            <input
              type="number"
              min={1}
              className="w-14 rounded border border-slate-300 px-1"
              value={Math.floor(boss.limitSec / 60)}
              onChange={(e) => onBossChange(bossName, { ...boss, limitSec: Math.max(0, Number(e.target.value)) * 60 + (boss.limitSec % 60) })}
            />
            分
            <input
              type="number"
              min={0}
              max={59}
              className="w-14 rounded border border-slate-300 px-1"
              value={boss.limitSec % 60}
              onChange={(e) =>
                onBossChange(bossName, { ...boss, limitSec: Math.floor(boss.limitSec / 60) * 60 + Math.min(59, Math.max(0, Number(e.target.value))) })
              }
            />
            秒
          </label>
          <label className="flex items-center gap-1">
            コスト上限
            <input
              type="number"
              min={1}
              className="w-16 rounded border border-slate-300 px-1"
              value={boss.costCap}
              onChange={(e) => onBossChange(bossName, { ...boss, costCap: Math.max(1, Number(e.target.value)) })}
            />
          </label>
        </div>
        <p className="rounded bg-slate-100 px-2 py-1 text-slate-600">
          判定の根拠: 制限時間 {formatLimit(boss.limitSec)} / コスト上限 {boss.costCap}
          {preset ? `（${preset.name}${edited ? ' のプリセットから手動変更' : ' のプリセット値'}）` : '（手動設定）'}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold">別名（このTL用）</h3>
          <span className="text-xs text-slate-500">元データは変更しません</span>
          <button
            className="ml-auto rounded bg-slate-700 px-2 py-0.5 text-white hover:bg-slate-600"
            onClick={() => onAliasesChange([...aliases, { alias: '', target: '' }])}
          >
            ＋ 追加
          </button>
        </div>
        <datalist id="student-names">
          {STUDENTS.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        {aliases.length === 0 && <p className="text-slate-500">例: 「水着ホシノ」→「ホシノ（水着）」</p>}
        {aliases.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="w-40 rounded border border-slate-300 px-1"
              placeholder="別名"
              value={a.alias}
              onChange={(e) => updateAlias(i, { alias: e.target.value })}
            />
            <span className="text-slate-400">→</span>
            <input
              className={`w-48 rounded border px-1 ${a.target && !known.has(a.target) ? 'border-red-400' : 'border-slate-300'}`}
              placeholder="正式名"
              list="student-names"
              value={a.target}
              onChange={(e) => updateAlias(i, { target: e.target.value })}
            />
            <button className="text-red-500 hover:text-red-700" onClick={() => onAliasesChange(aliases.filter((_, k) => k !== i))}>
              ✕
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

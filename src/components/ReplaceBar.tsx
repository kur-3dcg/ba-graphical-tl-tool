import { useState } from 'react';
import type { Rule } from '../lib/rules';
import { applyRules, unescapeReplacement } from '../lib/rules';
import { RULE_TEMPLATES } from '../lib/templates';
import { insertTabOnTabKey } from '../lib/tabKey';

interface Props {
  text: string;
  onApply: (next: string) => void;
  onUndo: () => void;
  undoCount: number;
}

function countMatches(text: string, from: string, regex: boolean): number {
  if (!regex) return text.split(from).length - 1;
  return (text.match(new RegExp(from, 'gm')) ?? []).length;
}

/** 置き換え1件を入力して、テキストへ直接適用する（上書き）。元に戻すで1回ずつ戻せる */
export function ReplaceBar({ text, onApply, onUndo, undoCount }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [regex, setRegex] = useState(false);
  const [message, setMessage] = useState<{ level: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const apply = () => {
    if (!from) {
      setMessage({ level: 'warn', text: '置換前を入力してください' });
      return;
    }
    let count: number;
    try {
      count = countMatches(text, from, regex);
    } catch (e) {
      setMessage({ level: 'error', text: `正規表現が不正です: ${(e as Error).message}` });
      return;
    }
    if (count === 0) {
      setMessage({ level: 'warn', text: '一致する箇所がありません' });
      return;
    }
    const rule: Rule = { id: 'once', from, to, type: regex ? 'regex' : 'simple', enabled: true };
    onApply(applyRules(text, [rule]).text);
    setMessage({ level: 'ok', text: `${count}件置き換えました` });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (insertTabOnTabKey(e)) return;
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      apply();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold">置き換え</span>
      <input
        className="w-44 rounded border border-slate-300 px-2 py-1 font-mono"
        placeholder="置換前"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span className="text-slate-400">⇒</span>
      <input
        className="w-44 rounded border border-slate-300 px-2 py-1 font-mono"
        placeholder="置換後（空欄で削除）"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onKeyDown={onKeyDown}
        title={to && unescapeReplacement(to) !== to ? '\\t \\n はタブ・改行になります' : undefined}
      />
      <label className="flex items-center gap-1" title="$1 などで括弧の中身を使えます">
        <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
        正規表現
      </label>
      <select
        className="rounded border border-slate-300 px-1 py-1"
        value=""
        onChange={(e) => {
          const t = RULE_TEMPLATES[Number(e.target.value)];
          if (!t) return;
          setFrom(t.from);
          setTo(t.to);
          setRegex(t.type === 'regex');
          setMessage(null);
        }}
      >
        <option value="">テンプレート…</option>
        {RULE_TEMPLATES.map((t, i) => (
          <option key={t.label} value={i}>
            {t.label}
          </option>
        ))}
      </select>
      <button className="rounded bg-blue-600 px-4 py-1 font-bold text-white hover:bg-blue-500" onClick={apply}>
        適用
      </button>
      <button
        className="rounded border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50 disabled:opacity-40"
        onClick={() => {
          onUndo();
          setMessage(null);
        }}
        disabled={undoCount === 0}
        title="Ctrl+Z（入力欄の外で）"
      >
        ↶ 元に戻す{undoCount > 0 ? `（${undoCount}）` : ''}
      </button>
      {message && (
        <span className={message.level === 'ok' ? 'text-green-700' : message.level === 'warn' ? 'text-amber-700' : 'text-red-600'}>
          {message.text}
        </span>
      )}
    </div>
  );
}

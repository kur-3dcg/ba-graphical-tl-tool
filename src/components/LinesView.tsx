import { useLayoutEffect, useRef } from 'react';
import type { RowKind } from '../lib/parser';
import { PAGE_BREAK_RE } from '../lib/parser';
import type { RowImage } from '../lib/useRender';
import type { PageBreakReason } from '../lib/render';
import { insertTabOnTabKey } from '../lib/tabKey';

interface Props {
  text: string;
  onChange: (text: string) => void;
  rowImages: Map<number, RowImage[]>;
  kinds: Map<number, RowKind>;
  issues: Map<number, string[]>;
}

const KIND_STYLE: Record<RowKind, { border: string; label: string }> = {
  op: { border: 'border-l-transparent', label: '操作' },
  phase: { border: 'border-l-blue-500', label: 'フェーズ見出し' },
  setup: { border: 'border-l-green-500', label: '開始SET' },
  note: { border: 'border-l-slate-400', label: '注釈（生徒名なし）' },
};

const REASON_LABEL: Record<PageBreakReason, string> = {
  start: '',
  manual: '（改ページ指定）',
  rows: '（行数）',
  height: '（高さ超過で自動改ページ）',
};

function PageSeparator({ page, reason, scale }: { page: number; reason?: PageBreakReason; scale?: number }) {
  const warn = reason === 'height';
  const shrunk = scale !== undefined && scale < 0.999;
  return (
    <div className={`flex items-center gap-2 py-1 text-xs font-bold ${warn ? 'text-amber-700' : 'text-slate-500'}`}>
      <span className={`h-px flex-1 ${warn ? 'bg-amber-400' : 'bg-slate-300'}`} />
      ページ {page}
      {reason && REASON_LABEL[reason]}
      {shrunk && <span className="text-blue-600">縮小 {Math.round(scale * 100)}%</span>}
      <span className={`h-px flex-1 ${warn ? 'bg-amber-400' : 'bg-slate-300'}`} />
    </div>
  );
}

/** テキスト1行と、その行から作られた画像の行を横に並べて表示する */
export function LinesView({ text, onChange, rowImages, kinds, issues }: Props) {
  const lines = text.split('\n');
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFocus = useRef<{ i: number; pos: number } | null>(null);

  useLayoutEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    pendingFocus.current = null;
    const el = refs.current[f.i];
    if (el) {
      el.focus();
      el.setSelectionRange(f.pos, f.pos);
    }
  });

  const commit = (next: string[], focus?: { i: number; pos: number }) => {
    pendingFocus.current = focus ?? null;
    onChange(next.join('\n'));
  };

  const focusLine = (i: number, pos: number) => {
    const el = refs.current[i];
    if (!el) return;
    el.focus();
    const p = Math.min(pos, el.value.length);
    el.setSelectionRange(p, p);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || insertTabOnTabKey(e)) return;
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const line = lines[i];
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = [...lines];
      next.splice(i, 1, line.slice(0, start), line.slice(end));
      commit(next, { i: i + 1, pos: 0 });
    } else if (e.key === 'Backspace' && start === 0 && end === 0 && i > 0) {
      e.preventDefault();
      const next = [...lines];
      const pos = next[i - 1].length;
      next.splice(i - 1, 2, next[i - 1] + line);
      commit(next, { i: i - 1, pos });
    } else if (e.key === 'Delete' && start === line.length && end === line.length && i < lines.length - 1) {
      e.preventDefault();
      const next = [...lines];
      next.splice(i, 2, line + next[i + 1]);
      commit(next, { i, pos: line.length });
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      focusLine(i - 1, start);
    } else if (e.key === 'ArrowDown' && i < lines.length - 1) {
      e.preventDefault();
      focusLine(i + 1, start);
    }
  };

  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\r\n?/g, '\n');
    if (!pasted.includes('\n')) return;
    e.preventDefault();
    const el = e.currentTarget;
    const line = lines[i];
    const before = line.slice(0, el.selectionStart ?? 0);
    const after = line.slice(el.selectionEnd ?? 0);
    const parts = pasted.split('\n');
    parts[0] = before + parts[0];
    const last = parts.length - 1;
    const pos = parts[last].length;
    parts[last] += after;
    const next = [...lines];
    next.splice(i, 1, ...parts);
    commit(next, { i: i + last, pos });
  };

  const insertBreakAfter = (i: number) => {
    const next = [...lines];
    next.splice(i + 1, 0, '---');
    commit(next);
  };

  return (
    <div>
      {lines.map((line, i) => {
        const no = i + 1;
        const imgs = rowImages.get(no) ?? [];
        const kind = kinds.get(no);
        const own = issues.get(no) ?? [];
        const isBreak = PAGE_BREAK_RE.test(line.trim());
        const firstPage = imgs[0]?.pageStart;
        return (
          <div key={i}>
            {firstPage && <PageSeparator page={firstPage} reason={imgs[0].pageReason} scale={imgs[0].pageScale} />}
            <div className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 border-b border-slate-200 focus-within:bg-blue-50 hover:bg-slate-50">
              <div className={`flex items-start border-l-4 ${kind ? KIND_STYLE[kind].border : 'border-l-transparent'}`} title={kind ? KIND_STYLE[kind].label : undefined}>
                <span className="w-9 shrink-0 select-none pt-1.5 pr-1 text-right font-mono text-xs text-slate-400">{no}</span>
                <div className="min-w-0 flex-1">
                  <input
                    ref={(el) => {
                      refs.current[i] = el;
                    }}
                    className={`w-full bg-transparent px-1 py-1 font-mono text-sm outline-none ${isBreak ? 'text-slate-400' : ''}`}
                    value={line}
                    spellCheck={false}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = e.target.value;
                      onChange(next.join('\n'));
                    }}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onPaste={(e) => onPaste(i, e)}
                  />
                  {own.map((m, k) => (
                    <p key={k} className="px-1 pb-1 text-xs text-amber-700">
                      ⚠ {m}
                    </p>
                  ))}
                </div>
                <button
                  className="invisible shrink-0 px-1 pt-1 text-xs text-slate-400 hover:text-slate-700 group-hover:visible"
                  title="この行の後で改ページ"
                  onClick={() => insertBreakAfter(i)}
                >
                  ⤓改頁
                </button>
              </div>
              <div className="cursor-text py-0.5" onClick={() => focusLine(i, line.length)}>
                {imgs.map((im, k) => (
                  <div key={k}>
                    {k > 0 && im.pageStart && <PageSeparator page={im.pageStart} reason={im.pageReason} scale={im.pageScale} />}
                    <img src={im.src} alt="" className="block w-full" style={{ aspectRatio: `${im.width} / ${im.height}` }} />
                  </div>
                ))}
                {isBreak && <div className="py-1 text-center text-xs text-slate-400">― ここで改ページ ―</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import type { BossSetting, CostFormat, RowKind } from './lib/parser';
import { parseText, validateRows } from './lib/parser';
import type { Alias } from './lib/students';
import { STUDENTS, StudentDictionary } from './lib/students';
import type { ImageSettings } from './lib/render';
import { DEFAULT_IMAGE_SETTINGS, canvasToBlob } from './lib/render';
import { usePersistentState } from './lib/storage';
import { useRender } from './lib/useRender';
import { insertTabOnTabKey } from './lib/tabKey';
import { ReplaceBar } from './components/ReplaceBar';
import { ImageSettingsBar } from './components/ImageSettingsBar';
import { LinesView } from './components/LinesView';
import { PagesView, pageFileName } from './components/PagesView';
import { TextOutput } from './components/TextOutput';
import { SettingsPanel } from './components/SettingsPanel';
import { FormatHelp } from './components/FormatHelp';

const SAMPLE = `開始SET ユウカ ホシノ ヒフミ キサキ
3:55 ユウカ 時間指定
6 ホシノ コスト指定
3:40 ユウカ→ホシノ→ヒフミ 先頭を指定時刻に使用し、後続は最速
NS着弾後 キサキ 条件指定
タイミング指定のない独立コメント
移行 第2フェーズ
⑤ リオ→Cホシノ リオでホシノをコピー
2:10.5　ウイ[ミカ]　AUTO OFF`;

const HISTORY_LIMIT = 50;

type Tab = 'edit' | 'text' | 'settings';
type View = 'lines' | 'pages';
const TABS: [Tab, string][] = [
  ['edit', '編集'],
  ['text', 'テキスト出力'],
  ['settings', 'ボス・別名設定'],
];

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [text, setTextRaw] = usePersistentState('input', SAMPLE);
  const [aliases, setAliases] = usePersistentState<Alias[]>('aliases', []);
  const [bossName, setBossName] = usePersistentState('bossName', 'ホド');
  const [boss, setBoss] = usePersistentState<BossSetting>('boss', { limitSec: 240, costCap: 11 });
  const [storedImageSettings, setImageSettings] = usePersistentState<ImageSettings>('image', DEFAULT_IMAGE_SETTINGS);
  // 保存済みの設定に後から追加した項目は初期値で補う
  const imageSettings = useMemo(() => ({ ...DEFAULT_IMAGE_SETTINGS, ...storedImageSettings }), [storedImageSettings]);
  const [textCostFormat, setTextCostFormat] = usePersistentState<CostFormat>('textCost', 'num');
  const [tab, setTab] = usePersistentState<Tab>('tab2', 'edit');
  const [view, setView] = usePersistentState<View>('view', 'lines');
  const [history, setHistory] = useState<string[]>([]);
  const [showHelp, setShowHelp] = usePersistentState('showHelp', false);

  const setText = useCallback((t: string) => setTextRaw(t.replace(/\r\n?/g, '\n')), [setTextRaw]);

  const dict = useMemo(() => new StudentDictionary(STUDENTS, aliases), [aliases]);
  const rows = useMemo(() => parseText(text, dict), [text, dict]);
  const issues = useMemo(() => validateRows(rows, dict, boss), [rows, dict, boss]);
  const render = useRender(rows, dict, imageSettings);

  const kinds = useMemo(() => new Map<number, RowKind>(rows.map((r) => [r.line, r.kind])), [rows]);
  const issuesByLine = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const x of issues) m.set(x.line, [...(m.get(x.line) ?? []), x.message]);
    return m;
  }, [issues]);

  /** 置き換えの適用・全消去など、元に戻せる変更 */
  const replaceText = (next: string) => {
    setHistory((h) => [...h, text].slice(-HISTORY_LIMIT));
    setText(next);
  };

  const undo = useCallback(() => {
    if (!history.length) return;
    setText(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  }, [history, setText]);

  // 入力欄の外での Ctrl+Z は置き換えの取り消し
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const downloadAll = async () => {
    const pages = render.renderPages();
    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) zip.file(pageFileName(i), await canvasToBlob(pages[i]));
    download(await zip.generateAsync({ type: 'blob' }), 'tl_pages.zip');
  };

  const isEmpty = text.trim() === '';

  return (
    <div className="mx-auto max-w-[1800px] px-3 pb-3">
      {/* タイトル・タブ・書き方・編集ツールバーはスクロールしても上に固定 */}
      <div className="sticky top-0 z-20 bg-slate-100 pb-2 pt-3">
        <header className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">TLグラフィカルツール</h1>
          <nav className="flex gap-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                className={`rounded px-4 py-1.5 text-sm ${tab === key ? 'bg-slate-700 text-white' : 'bg-white hover:bg-slate-200'}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          {issues.length > 0 && <span className="text-sm text-amber-700">⚠ 警告 {issues.length}件</span>}
          <button
            className={`ml-auto rounded border px-3 py-1 text-sm ${showHelp ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'}`}
            onClick={() => setShowHelp(!showHelp)}
          >
            ？ 書き方
          </button>
        </header>
        {showHelp && <FormatHelp />}
        {tab === 'edit' && (
          <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-2 shadow-sm">
            <ReplaceBar text={text} onApply={replaceText} onUndo={undo} undoCount={history.length} />
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-2">
              <ImageSettingsBar settings={imageSettings} onChange={setImageSettings} />
              <div className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-slate-500">
                  {render.busy ? '描画中…' : `${render.pageCount}ページ`}
                  {render.missing > 0 && <span className="ml-2 text-amber-700">⚠ 画像なし{render.missing}人</span>}
                  {render.heightBreaks > 0 && (
                    <span className="ml-2 text-amber-700" title="1ページの高さに収まらないため自動で改ページした箇所">
                      ⚠ 高さ超過で自動改ページ{render.heightBreaks}か所
                    </span>
                  )}
                </span>
                <div className="flex overflow-hidden rounded border border-slate-300">
                  {(
                    [
                      ['lines', '行ごと'],
                      ['pages', '全文＋ページ'],
                    ] as [View, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      className={`px-3 py-1 ${view === v ? 'bg-slate-700 text-white' : 'bg-white hover:bg-slate-100'}`}
                      onClick={() => setView(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500 disabled:opacity-50"
                  disabled={!render.pageCount || render.busy}
                  onClick={downloadAll}
                >
                  一括保存（zip）
                </button>
                <button className="rounded border border-slate-300 px-2 py-1 text-slate-500 hover:bg-slate-50" onClick={() => replaceText('')} title="全消去（元に戻せます）">
                  クリア
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {tab === 'edit' && (
        <div className="rounded-lg border border-slate-300 bg-white p-2">
          {isEmpty ? (
            <textarea
              autoFocus
              className="h-[60vh] w-full rounded border-2 border-dashed border-slate-300 p-3 font-mono text-sm"
              placeholder="ここにTLを貼り付けてください"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={insertTabOnTabKey}
            />
          ) : view === 'lines' ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 border-b border-slate-300 pb-1 text-xs font-bold text-slate-500">
                <span className="pl-10">テキスト（Enterで行分割 / ↑↓で移動）</span>
                <span>画像</span>
              </div>
              <LinesView text={text} onChange={setText} rowImages={render.rowImages} kinds={kinds} issues={issuesByLine} />
            </>
          ) : (
            <PagesView text={text} onChange={setText} version={render.rowImages} renderPages={render.renderPages} onDownload={download} />
          )}
        </div>
      )}

      <section className={tab === 'edit' ? 'hidden' : 'rounded-lg border border-slate-300 bg-white'}>
        {tab === 'text' && <TextOutput rows={rows} dict={dict} costFormat={textCostFormat} onCostFormatChange={setTextCostFormat} />}
        {tab === 'settings' && (
          <SettingsPanel
            bossName={bossName}
            boss={boss}
            onBossChange={(name, b) => {
              setBossName(name);
              setBoss(b);
            }}
            aliases={aliases}
            onAliasesChange={setAliases}
          />
        )}
      </section>
    </div>
  );
}

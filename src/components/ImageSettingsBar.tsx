import type { ImageSettings } from '../lib/render';
import { MAX_ROWS_PER_PAGE, MIN_FONT_SIZE } from '../lib/render';

interface Props {
  settings: ImageSettings;
  onChange: (s: ImageSettings) => void;
}

export function ImageSettingsBar({ settings, onChange }: Props) {
  const set = (patch: Partial<ImageSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-bold">画像</span>
      <label className="flex items-center gap-1">
        タイトル
        <input className="w-40 rounded border border-slate-300 px-1 py-0.5" value={settings.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="flex items-center gap-1">
        背景
        <select
          className="rounded border border-slate-300 px-1 py-0.5"
          value={settings.background}
          onChange={(e) => set({ background: e.target.value as ImageSettings['background'] })}
        >
          <option value="white">白</option>
          <option value="transparent">透過</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        文字
        <input
          type="number"
          min={MIN_FONT_SIZE}
          max={48}
          className="w-14 rounded border border-slate-300 px-1 py-0.5"
          value={settings.fontSize}
          onChange={(e) => set({ fontSize: Math.max(MIN_FONT_SIZE, Math.min(48, Number(e.target.value) || MIN_FONT_SIZE)) })}
        />
        px
      </label>
      <label className="flex items-center gap-1">
        コスト
        <select
          className="rounded border border-slate-300 px-1 py-0.5"
          value={settings.costFormat}
          onChange={(e) => set({ costFormat: e.target.value as ImageSettings['costFormat'] })}
        >
          <option value="num">数値のみ</option>
          <option value="cost">コスト付き</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={settings.showNames} onChange={(e) => set({ showNames: e.target.checked })} />
        生徒名
      </label>
      <label className="flex items-center gap-1" title="画像上部の「タイミング / 生徒 / コメント」の見出し">
        <input type="checkbox" checked={settings.showHeader} onChange={(e) => set({ showHeader: e.target.checked })} />
        列見出し
      </label>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={settings.showRowLines} onChange={(e) => set({ showRowLines: e.target.checked })} />
        区切り線
      </label>
      <label className="flex items-center gap-1">
        1ページ
        <select
          className="rounded border border-slate-300 px-1 py-0.5"
          value={settings.pageMode}
          onChange={(e) => set({ pageMode: e.target.value as ImageSettings['pageMode'] })}
        >
          <option value="rows">行数指定</option>
          <option value="manual">改ページ指定のみ</option>
          <option value="single">1枚にまとめる（縦長）</option>
        </select>
      </label>
      {settings.pageMode === 'rows' && (
        <label className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={MAX_ROWS_PER_PAGE}
            className="w-14 rounded border border-slate-300 px-1 py-0.5"
            value={settings.rowsPerPage}
            onChange={(e) => set({ rowsPerPage: Math.max(1, Math.min(MAX_ROWS_PER_PAGE, Math.floor(Number(e.target.value)) || 1)) })}
          />
          行
        </label>
      )}
    </div>
  );
}

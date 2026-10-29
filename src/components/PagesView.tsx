import { useEffect, useState } from 'react';
import { canvasToBlob } from '../lib/render';
import { insertTabOnTabKey } from '../lib/tabKey';

interface Props {
  text: string;
  onChange: (text: string) => void;
  /** 描画結果が更新されるたびに変わる値 */
  version: unknown;
  renderPages: () => HTMLCanvasElement[];
  onDownload: (blob: Blob, name: string) => void;
}

export const pageFileName = (i: number) => `tl_${String(i + 1).padStart(2, '0')}.png`;

/** 全文テキストとページ単位の画像を並べて表示する（貼り付け・一括編集用） */
export function PagesView({ text, onChange, version, renderPages, onDownload }: Props) {
  const [pages, setPages] = useState<HTMLCanvasElement[]>([]);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const canvases = renderPages();
    setPages(canvases);
    setUrls(canvases.map((c) => c.toDataURL('image/png')));
  }, [version, renderPages]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
      <textarea
        className="h-[75vh] w-full rounded border border-slate-300 bg-white p-2 font-mono text-sm"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={insertTabOnTabKey}
        placeholder="TLを貼り付けてください"
        spellCheck={false}
      />
      <div className="max-h-[75vh] space-y-3 overflow-auto">
        {urls.map((src, i) => (
          <figure key={i} className="rounded border border-slate-300 bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:20px_20px]">
            <img src={src} alt={`ページ${i + 1}`} className="w-full" />
            <figcaption className="flex items-center justify-between bg-white px-2 py-1 text-sm">
              <span>
                ページ {i + 1} / {urls.length}
              </span>
              <button className="text-blue-600 underline" onClick={async () => onDownload(await canvasToBlob(pages[i]), pageFileName(i))}>
                PNGを保存
              </button>
            </figcaption>
          </figure>
        ))}
        {urls.length === 0 && <p className="text-sm text-slate-500">表示する行がありません。</p>}
      </div>
    </div>
  );
}

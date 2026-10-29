import { useCallback, useEffect, useRef, useState } from 'react';
import type { Row } from './parser';
import type { StudentDictionary } from './students';
import type { ImageSettings, Page, PageBreakReason } from './render';
import { drawPage, layoutPages, loadImagesForRows, renderRowCanvas } from './render';

export interface RowImage {
  src: string;
  width: number;
  height: number;
  /** この表示行からページが始まる場合のページ番号（1始まり）と、改ページの理由 */
  pageStart?: number;
  pageReason?: PageBreakReason;
  /** ページの縮小倍率（改ページ指定モードで収めるために縮小した場合 1 未満） */
  pageScale?: number;
}

export interface RenderResult {
  /** テキストの行番号（1始まり）→ その行から作られた表示行の画像 */
  rowImages: Map<number, RowImage[]>;
  pageCount: number;
  /** 高さに収まらず自動で改ページした数 */
  heightBreaks: number;
  missing: number;
  busy: boolean;
}

const EMPTY: RenderResult = { rowImages: new Map(), pageCount: 0, heightBreaks: 0, missing: 0, busy: true };

/** 行データを描画する。入力中の連続再描画を避けるため少し遅らせる */
export function useRender(rows: Row[], dict: StudentDictionary, settings: ImageSettings) {
  const [result, setResult] = useState<RenderResult>(EMPTY);
  const latest = useRef<{ pages: Page[]; images: Map<string, HTMLImageElement | null>; settings: ImageSettings } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult((r) => ({ ...r, busy: true }));
    const timer = setTimeout(async () => {
      const images = await loadImagesForRows(rows, dict);
      if (cancelled) return;
      const pages = layoutPages(rows, dict, images, settings);
      const rowImages = new Map<number, RowImage[]>();
      pages.forEach((page, pi) => {
        page.rows.forEach((d, k) => {
          const canvas = renderRowCanvas(d, images, settings, k);
          const list = rowImages.get(d.src.line) ?? [];
          list.push({
            src: canvas.toDataURL('image/png'),
            width: canvas.width,
            height: canvas.height,
            pageStart: k === 0 ? pi + 1 : undefined,
            pageReason: k === 0 ? page.reason : undefined,
            pageScale: k === 0 ? page.scale : undefined,
          });
          rowImages.set(d.src.line, list);
        });
      });
      latest.current = { pages, images, settings };
      setResult({
        rowImages,
        pageCount: pages.length,
        heightBreaks: pages.filter((p) => p.reason === 'height').length,
        missing: [...images.values()].filter((v) => !v).length,
        busy: false,
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rows, dict, settings]);

  /** 最新の描画結果からページ画像を作る（プレビュー・ダウンロード用） */
  const renderPages = useCallback((): HTMLCanvasElement[] => {
    const cur = latest.current;
    if (!cur) return [];
    return cur.pages.map((p, i) => {
      const c = document.createElement('canvas');
      drawPage(c, p, cur.images, cur.settings, i + 1, cur.pages.length);
      return c;
    });
  }, []);

  return { ...result, renderPages };
}

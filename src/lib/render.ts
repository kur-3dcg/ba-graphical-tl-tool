import type { Row, CostFormat } from './parser';
import { formatTiming } from './parser';
import type { Student, StudentDictionary, ResolvedStudent } from './students';
import { resolveStudents } from './students';

export const PAGE_W = 1920;
export const PAGE_H = 1080;
export const MIN_FONT_SIZE = 24;

export interface ImageSettings {
  background: 'white' | 'transparent';
  fontSize: number;
  showNames: boolean;
  /** 列見出し（タイミング / 生徒 / コメント）を表示する */
  showHeader: boolean;
  /** 行の区切り線を引く */
  showRowLines: boolean;
  costFormat: CostFormat;
  title: string;
  /**
   * rows: 1ページの行数を指定 / manual: `---` の改ページ指定だけで区切る（収まらなければ縮小）/
   * single: 改ページせず、幅1920のまま縦をTLの長さに合わせて1枚にまとめる
   */
  pageMode: 'rows' | 'manual' | 'single';
  rowsPerPage: number;
}

export const MAX_ROWS_PER_PAGE = 30;

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  background: 'white',
  fontSize: 32,
  showNames: false,
  showHeader: true,
  showRowLines: true,
  costFormat: 'num',
  title: '',
  pageMode: 'rows',
  rowsPerPage: 10,
};

const FONT_FAMILY = '"Yu Gothic UI", "Yu Gothic", Meiryo, "Hiragino Sans", sans-serif';
const MARGIN = 32;
const COL_TIMING = 300;
const COL_STUDENTS = 640;
const COL_COMMENT = PAGE_W - MARGIN * 2 - COL_TIMING - COL_STUDENTS;
const PAD_X = 16;
/** 改ページ指定モードで縮小する下限の倍率。これでも収まらない場合だけ自動改ページする */
const MIN_SCALE = 0.15;

const COLOR = {
  text: '#111827',
  sub: '#6b7280',
  header: '#1f2937',
  headerText: '#ffffff',
  rowA: '#ffffff',
  rowB: '#f1f5f9',
  rowTransparent: 'rgba(255,255,255,0.88)',
  phase: '#dbeafe',
  phaseText: '#1e3a8a',
  border: '#cbd5e1',
  sp: '#f97316',
  st: '#94a3b8',
  copy: '#7c3aed',
  placeholder: '#e2e8f0',
};

/** 行の縦方向の寸法。改ページ指定モードではページごとに縮小した値を使う（列幅は変えない） */
interface Metrics {
  scale: number;
  fontSize: number;
  lh: number;
  padY: number;
  icon: number;
  arrowW: number;
  gapY: number;
  nameSize: number;
  nameLH: number;
  nameMaxW: number;
  targetIcon: number;
  /** 対象アイコンが使用者アイコンの右へはみ出す幅 */
  targetOverhang: number;
  radius: number;
}

function metrics(s: ImageSettings, scale = 1): Metrics {
  const k = scale;
  const nameSize = MIN_FONT_SIZE * k;
  return {
    scale: k,
    fontSize: s.fontSize * k,
    lh: s.fontSize * 1.4 * k,
    padY: 10 * k,
    icon: 72 * k,
    arrowW: 36 * k,
    gapY: 10 * k,
    nameSize,
    nameLH: nameSize * 1.3,
    nameMaxW: 220 * k,
    targetIcon: 44 * k,
    targetOverhang: 12 * k,
    radius: 12 * k,
  };
}

// ---------- 画像読み込み ----------

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

/** data/*.txt の画像URLを CORS 付きで読み込む（Canvas汚染回避）。失敗なら null（代替表示） */
function tryLoad(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function loadStudentImage(s: Student): Promise<HTMLImageElement | null> {
  let p = imageCache.get(s.id);
  if (!p) {
    p = tryLoad(s.imageUrl);
    imageCache.set(s.id, p);
  }
  return p;
}

export async function loadImagesForRows(rows: Row[], dict: StudentDictionary): Promise<Map<string, HTMLImageElement | null>> {
  const students = new Map<string, Student>();
  for (const row of rows) {
    const resolved =
      row.kind === 'op'
        ? resolveStudents(row.students, dict)
        : row.kind === 'setup'
          ? row.comment.split(/[ \t　]+/).filter(Boolean).map((n) => dict.resolveSegment(n))
          : [];
    for (const r of resolved) {
      if (r.student) students.set(r.student.id, r.student);
      if (r.target) students.set(r.target.id, r.target);
    }
  }
  const entries = await Promise.all(
    [...students.values()].map(async (s) => [s.id, await loadStudentImage(s)] as const),
  );
  return new Map(entries);
}

// ---------- レイアウト ----------

function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
}

/** 1文字単位で折り返す（日本語向け）。文字を切り捨てない */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const ch of Array.from(para)) {
      if (cur && ctx.measureText(cur + ch).width > maxW) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    lines.push(cur);
  }
  return lines;
}

interface StudentItem {
  resolved: ResolvedStudent;
  x: number;
  y: number;
  w: number;
  /** 画像の下（または代替表示内）に出す名前の行 */
  nameLines: string[];
  arrowBefore: boolean;
}

interface StudentLayout {
  items: StudentItem[];
  height: number;
}

type DisplayKind = 'op' | 'phase' | 'setup' | 'note' | 'cont';

export interface DisplayRow {
  src: Row;
  kind: DisplayKind;
  timingLines: string[];
  textLines: string[];
  students: StudentLayout | null;
  height: number;
  m: Metrics;
}

/** ページが始まった理由。start は先頭ページ */
export type PageBreakReason = 'start' | 'manual' | 'rows' | 'height';

export interface Page {
  rows: DisplayRow[];
  reason: PageBreakReason;
  /** 行の縮小倍率（1 = 縮小なし） */
  scale: number;
}

function nameLabel(r: ResolvedStudent): string {
  return r.student ? r.student.name : r.raw;
}

function layoutStudents(
  ctx: CanvasRenderingContext2D,
  resolved: ResolvedStudent[],
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
  m: Metrics,
  maxW: number,
  arrows: boolean,
): StudentLayout {
  const k = m.scale;
  ctx.font = font(m.nameSize);

  const sized = resolved.map((r) => {
    const img = r.student ? images.get(r.student.id) ?? null : null;
    const label = nameLabel(r);
    // 画像が無い場合は名前を枠内に表示する（出力は止めない）
    if (!img) {
      const w = Math.min(Math.max(m.icon, ctx.measureText(label).width + 16 * k), m.nameMaxW);
      const lines = wrapText(ctx, label, w - 12 * k);
      return { r, w, h: Math.max(m.icon, lines.length * m.nameLH + 12 * k), nameLines: lines };
    }
    if (!s.showNames) return { r, w: m.icon, h: m.icon, nameLines: [] as string[] };
    const w = Math.min(Math.max(m.icon, ctx.measureText(label).width), m.nameMaxW);
    const lines = wrapText(ctx, label, w);
    return { r, w, h: m.icon + 4 * k + lines.length * m.nameLH, nameLines: lines };
  });

  const items: StudentItem[] = [];
  let x = 0;
  let y = 0;
  let lineH = 0;
  sized.forEach((it, i) => {
    const arrow = arrows && i > 0;
    // 直前の生徒に対象アイコンが重なる場合は、はみ出す分だけ間隔を広げる
    const overhang = i > 0 && sized[i - 1].r.targetRaw ? m.targetOverhang : 0;
    const gap = (arrow ? m.arrowW : i > 0 ? m.gapY : 0) + overhang;
    if (x > 0 && x + gap + it.w > maxW) {
      y += lineH + m.gapY;
      x = 0;
      lineH = 0;
    }
    const ax = x > 0 ? x + gap : x;
    items.push({ resolved: it.r, x: ax, y, w: it.w, nameLines: it.nameLines, arrowBefore: arrow });
    x = ax + it.w;
    lineH = Math.max(lineH, it.h);
  });
  return { items, height: items.length ? y + lineH : 0 };
}

function availableHeight(s: ImageSettings): number {
  if (s.pageMode === 'single') return Infinity;
  return PAGE_H - MARGIN * 2 - titleHeight(s) - headerHeight(s);
}

function titleHeight(s: ImageSettings): number {
  return s.title.trim() ? Math.round(s.fontSize * 1.25 * 1.6) : 0;
}

function headerHeight(s: ImageSettings): number {
  return s.showHeader ? Math.round(s.fontSize * 1.6) : 0;
}

/** 行データを表示行に変換し、1ページに収まらない行は継続行に分割する */
export function buildDisplayRows(
  rows: Row[],
  dict: StudentDictionary,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
  scale = 1,
): DisplayRow[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const m = metrics(s, scale);
  const lh = m.lh;
  const avail = availableHeight(s);
  const out: DisplayRow[] = [];
  const spanW = COL_STUDENTS + COL_COMMENT - PAD_X * 2;

  for (const row of rows) {
    if (row.kind === 'phase') {
      ctx.font = font(m.fontSize, true);
      const lines = wrapText(ctx, row.comment, PAGE_W - MARGIN * 2 - PAD_X * 2);
      out.push({ src: row, kind: 'phase', timingLines: [], textLines: lines, students: null, height: m.padY * 2 + lines.length * lh, m });
      continue;
    }

    let timingLines: string[] = [];
    let students: StudentLayout | null = null;
    let textW: number;

    ctx.font = font(m.fontSize, true);
    if (row.kind === 'op') {
      timingLines = row.timing.trim() ? wrapText(ctx, formatTiming(row.timing, s.costFormat), COL_TIMING - PAD_X * 2) : [];
      students = layoutStudents(ctx, resolveStudents(row.students, dict), images, s, m, COL_STUDENTS - PAD_X * 2, true);
      textW = COL_COMMENT - PAD_X * 2;
    } else {
      if (row.kind === 'setup') timingLines = ['開始SET'];
      textW = spanW;
    }
    let comment = row.comment;
    // 開始SETが生徒名だけなら編成としてアイコン表示する
    if (row.kind === 'setup') {
      const names = comment.split(/[ \t　]+/).filter(Boolean);
      const resolved = names.map((n) => dict.resolveSegment(n));
      if (resolved.length && resolved.every((r) => r.student)) {
        students = layoutStudents(ctx, resolved, images, s, m, spanW, false);
        comment = '';
      }
    }
    ctx.font = font(m.fontSize);
    const textLines = comment ? wrapText(ctx, comment, textW) : [];

    const fixedH = Math.max(timingLines.length * lh, students?.height ?? 0);
    const height = m.padY * 2 + Math.max(fixedH, textLines.length * lh, lh);
    const kind: DisplayKind = row.kind;
    if (height <= avail) {
      out.push({ src: row, kind, timingLines, textLines, students, height, m });
      continue;
    }

    // 継続行へ分割。継続行のタイミング列には元の操作を示す
    const perRow = Math.max(1, Math.floor((avail - m.padY * 2) / lh));
    const first = textLines.slice(0, perRow);
    out.push({
      src: row,
      kind,
      timingLines,
      textLines: first,
      students,
      height: Math.min(avail, m.padY * 2 + Math.max(fixedH, first.length * lh)),
      m,
    });
    const ref = `↳ ${timingLines[0] ?? (row.students || '前の行')} の続き`;
    for (let i = perRow; i < textLines.length; i += perRow) {
      const chunk = textLines.slice(i, i + perRow);
      ctx.font = font(m.fontSize);
      out.push({
        src: row,
        kind: 'cont',
        timingLines: wrapText(ctx, ref, COL_TIMING - PAD_X * 2),
        textLines: chunk,
        students: null,
        height: m.padY * 2 + chunk.length * lh,
        m,
      });
    }
  }
  return out;
}

/**
 * 行数指定モードの改ページ。設定行数ごと・`---` の位置で区切り、
 * 高さに収まらない場合は文字を切らないよう自動で改ページする。
 * フェーズ見出しだけをページ末尾に残さない
 */
export function paginate(display: DisplayRow[], s: ImageSettings, firstReason: PageBreakReason = 'start'): Page[] {
  const avail = availableHeight(s);
  const maxRows = s.pageMode === 'manual' ? Infinity : Math.max(1, s.rowsPerPage);
  const pages: Page[] = [];
  let cur: DisplayRow[] = [];
  let used = 0;
  let curReason: PageBreakReason = firstReason;
  const flush = (reason: PageBreakReason) => {
    if (cur.length) pages.push({ rows: cur, reason: curReason, scale: cur[0].m.scale });
    cur = [];
    used = 0;
    curReason = reason;
  };

  display.forEach((d, i) => {
    let reason: PageBreakReason | null = null;
    if (cur.length > 0) {
      if (d.src.pageBreak && d.kind !== 'cont') reason = 'manual';
      else if (cur.length >= maxRows) reason = 'rows';
      else if (used + d.height > avail) reason = 'height';
      else if (d.kind === 'phase' && i + 1 < display.length) {
        const next = display[i + 1];
        if (cur.length + 2 > maxRows) reason = 'rows';
        else if (used + d.height + next.height > avail) reason = 'height';
      }
    }
    if (reason) flush(reason);
    cur.push(d);
    used += d.height;
  });
  flush('start');
  return pages;
}

const totalHeight = (display: DisplayRow[]) => display.reduce((sum, d) => sum + d.height, 0);

/**
 * 改ページ指定モード。`---` から次の `---` までを必ず1ページに収めるため、
 * 収まらない区間は行を縮小する（収まる最大の倍率を二分探索）
 */
function paginateManual(
  rows: Row[],
  dict: StudentDictionary,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
): Page[] {
  const avail = availableHeight(s);
  const segments: Row[][] = [];
  for (const row of rows) {
    if (row.pageBreak || segments.length === 0) segments.push([]);
    segments[segments.length - 1].push(row);
  }

  return segments.flatMap((seg, i) => {
    const reason: PageBreakReason = i === 0 ? 'start' : 'manual';
    const full = buildDisplayRows(seg, dict, images, s, 1);
    if (totalHeight(full) <= avail) return [{ rows: full, reason, scale: 1 }];

    const smallest = buildDisplayRows(seg, dict, images, s, MIN_SCALE);
    // 下限まで縮めても収まらない場合だけ、高さで自動改ページする
    if (totalHeight(smallest) > avail) return paginate(smallest, { ...s, pageMode: 'rows', rowsPerPage: Infinity }, reason);

    let lo = MIN_SCALE;
    let hi = 1;
    let best = smallest;
    for (let n = 0; n < 12; n++) {
      const mid = (lo + hi) / 2;
      const display = buildDisplayRows(seg, dict, images, s, mid);
      if (totalHeight(display) <= avail) {
        best = display;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return [{ rows: best, reason, scale: lo }];
  });
}

/** 行データからページを作る（設定の区切り方に従う） */
export function layoutPages(
  rows: Row[],
  dict: StudentDictionary,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
): Page[] {
  if (s.pageMode === 'manual') return paginateManual(rows, dict, images, s);
  if (s.pageMode === 'single') return [{ rows: buildDisplayRows(rows, dict, images, s), reason: 'start', scale: 1 }];
  return paginate(buildDisplayRows(rows, dict, images, s), s);
}

// ---------- 描画 ----------

function drawIcon(
  ctx: CanvasRenderingContext2D,
  item: StudentItem,
  img: HTMLImageElement | null,
  ox: number,
  oy: number,
  s: ImageSettings,
  m: Metrics,
) {
  const k = m.scale;
  const x = ox + item.x;
  const y = oy + item.y;
  const st = item.resolved.student;
  const isSP = st?.kind === 'SP';
  const icon = m.icon;

  if (item.arrowBefore && item.x > 0) {
    ctx.fillStyle = COLOR.sub;
    ctx.font = font(30 * k, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('→', x - m.arrowW / 2, y + icon / 2);
  }

  if (img) {
    const ix = x + (item.w - icon) / 2;
    ctx.save();
    ctx.beginPath();
    if (isSP) ctx.arc(ix + icon / 2, y + icon / 2, icon / 2, 0, Math.PI * 2);
    else ctx.roundRect(ix, y, icon, icon, m.radius);
    ctx.clip();
    ctx.drawImage(img, ix, y, icon, icon);
    ctx.restore();
    ctx.lineWidth = (isSP ? 5 : 3) * k;
    ctx.strokeStyle = isSP ? COLOR.sp : COLOR.st;
    ctx.beginPath();
    if (isSP) ctx.arc(ix + icon / 2, y + icon / 2, icon / 2 - 2 * k, 0, Math.PI * 2);
    else ctx.roundRect(ix + k, y + k, icon - 2 * k, icon - 2 * k, m.radius);
    ctx.stroke();

    if (s.showNames && item.nameLines.length) {
      ctx.fillStyle = COLOR.text;
      ctx.font = font(m.nameSize);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      item.nameLines.forEach((l, i) => ctx.fillText(l, x + item.w / 2, y + icon + 4 * k + i * m.nameLH));
    }
  } else {
    // 代替表示: 名前入りの枠
    const h = Math.max(icon, item.nameLines.length * m.nameLH + 12 * k);
    ctx.fillStyle = COLOR.placeholder;
    ctx.beginPath();
    ctx.roundRect(x, y, item.w, h, m.radius);
    ctx.fill();
    ctx.lineWidth = (isSP ? 5 : 3) * k;
    ctx.strokeStyle = isSP ? COLOR.sp : st ? COLOR.st : '#ef4444';
    ctx.stroke();
    ctx.fillStyle = COLOR.text;
    ctx.font = font(m.nameSize, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const top = y + (h - item.nameLines.length * m.nameLH) / 2;
    item.nameLines.forEach((l, i) => ctx.fillText(l, x + item.w / 2, top + i * m.nameLH + 2 * k));
  }

  if (item.resolved.copy) {
    const bx = x + 14 * k;
    const by = y + 14 * k;
    ctx.fillStyle = COLOR.copy;
    ctx.beginPath();
    ctx.arc(bx, by, 17 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * k;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(22 * k, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', bx, by + k);
  }
}

/** 対象指定 `ウイ[ミカ]` の対象を、使用者アイコンの右上に小さく重ねる */
function drawTarget(
  ctx: CanvasRenderingContext2D,
  item: StudentItem,
  hasMainImage: boolean,
  img: HTMLImageElement | null,
  ox: number,
  oy: number,
  m: Metrics,
) {
  const k = m.scale;
  const target = item.resolved.target;
  // 使用者アイコンの右端（画像は列内で中央寄せ、代替表示は枠いっぱい）
  const right = hasMainImage ? ox + item.x + (item.w + m.icon) / 2 : ox + item.x + item.w;
  const r = m.targetIcon / 2;
  const cx = right - r + m.targetOverhang;
  const cy = oy + item.y + r - 8 * k;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLOR.placeholder;
  ctx.fill();
  if (img) {
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, m.targetIcon, m.targetIcon);
  } else {
    // 画像なし・未登録は名前の先頭1文字で代替表示
    ctx.fillStyle = COLOR.text;
    ctx.font = font(m.nameSize, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(target?.name ?? item.resolved.targetRaw ?? '?')[0], cx, cy + k);
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r - k, 0, Math.PI * 2);
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + k, 0, Math.PI * 2);
  ctx.lineWidth = 2 * k;
  ctx.strokeStyle = !target ? '#ef4444' : target.kind === 'SP' ? COLOR.sp : COLOR.st;
  ctx.stroke();
}

export function drawPage(
  canvas: HTMLCanvasElement,
  page: Page,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
  pageNo: number,
  pageCount: number,
) {
  // 1枚モードは縦をTLの長さに合わせる
  const pageH = s.pageMode === 'single' ? MARGIN * 2 + titleHeight(s) + headerHeight(s) + Math.ceil(totalHeight(page.rows)) : PAGE_H;
  canvas.width = PAGE_W;
  canvas.height = pageH;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, PAGE_W, pageH);
  if (s.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, pageH);
  }
  const tableW = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  if (s.title.trim()) {
    ctx.fillStyle = s.background === 'white' ? COLOR.text : COLOR.rowTransparent;
    ctx.font = font(Math.round(s.fontSize * 1.25), true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (s.background === 'transparent') {
      ctx.fillRect(MARGIN, y, tableW, titleHeight(s) - 8);
      ctx.fillStyle = COLOR.text;
    }
    ctx.fillText(s.title, MARGIN + PAD_X, y + (titleHeight(s) - 8) / 2);
    if (pageCount > 1) {
      ctx.font = font(MIN_FONT_SIZE);
      ctx.textAlign = 'right';
      ctx.fillText(`${pageNo}/${pageCount}`, MARGIN + tableW - PAD_X, y + (titleHeight(s) - 8) / 2);
    }
    y += titleHeight(s);
  }

  // 列見出し（縮小しない）
  if (s.showHeader) {
    const hh = headerHeight(s);
    ctx.fillStyle = COLOR.header;
    ctx.fillRect(MARGIN, y, tableW, hh);
    ctx.fillStyle = COLOR.headerText;
    ctx.font = font(s.fontSize, true);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('タイミング', MARGIN + PAD_X, y + hh / 2);
    ctx.fillText('生徒', MARGIN + COL_TIMING + PAD_X, y + hh / 2);
    ctx.fillText('コメント', MARGIN + COL_TIMING + COL_STUDENTS + PAD_X, y + hh / 2);
    y += hh;
  }

  page.rows.forEach((d, i) => {
    drawRow(ctx, d, MARGIN, y, images, s, i);
    y += d.height;
  });
}

/** 表示行1つを (x0, y) に描く。stripe は縞模様用のページ内インデックス */
function drawRow(
  ctx: CanvasRenderingContext2D,
  d: DisplayRow,
  x0: number,
  y: number,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
  stripe: number,
) {
  const m = d.m;
  const lh = m.lh;
  const tableW = PAGE_W - MARGIN * 2;
  // 透過時は操作行・注釈の背景を塗らない（フェーズ見出しの色だけ残す）
  if (d.kind === 'phase' || s.background === 'white') {
    ctx.fillStyle = d.kind === 'phase' ? COLOR.phase : stripe % 2 === 0 ? COLOR.rowA : COLOR.rowB;
    ctx.fillRect(x0, y, tableW, d.height);
  }

  if (s.showRowLines) {
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y + d.height - 0.5);
    ctx.lineTo(x0 + tableW, y + d.height - 0.5);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const ty = y + m.padY + (lh - m.fontSize) / 2;

  if (d.kind === 'phase') {
    ctx.fillStyle = COLOR.phaseText;
    ctx.font = font(m.fontSize, true);
    d.textLines.forEach((l, k) => ctx.fillText(l, x0 + PAD_X, ty + k * lh));
    return;
  }

  ctx.fillStyle = d.kind === 'cont' ? COLOR.sub : COLOR.text;
  ctx.font = font(d.kind === 'cont' ? Math.max(m.nameSize, m.fontSize - 6 * m.scale) : m.fontSize, d.kind !== 'cont');
  d.timingLines.forEach((l, k) => ctx.fillText(l, x0 + PAD_X, ty + k * lh));

  if (d.students) {
    for (const item of d.students.items) {
      const id = item.resolved.student?.id;
      const mainImg = id ? images.get(id) ?? null : null;
      drawIcon(ctx, item, mainImg, x0 + COL_TIMING + PAD_X, y + m.padY, s, m);
      const tid = item.resolved.target?.id;
      if (item.resolved.targetRaw) {
        drawTarget(ctx, item, !!mainImg, tid ? images.get(tid) ?? null : null, x0 + COL_TIMING + PAD_X, y + m.padY, m);
      }
    }
  }

  ctx.fillStyle = d.kind === 'note' ? COLOR.sub : COLOR.text;
  ctx.font = font(m.fontSize);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const inCommentCol = d.kind === 'op' || (d.kind === 'cont' && d.src.kind === 'op');
  const tx = inCommentCol ? x0 + COL_TIMING + COL_STUDENTS + PAD_X : x0 + COL_TIMING + PAD_X;
  d.textLines.forEach((l, k) => ctx.fillText(l, tx, ty + k * lh));
}

/** 表示行1つだけの画像（編集画面でテキスト行の横に並べる用） */
export function renderRowCanvas(
  d: DisplayRow,
  images: Map<string, HTMLImageElement | null>,
  s: ImageSettings,
  stripe: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W - MARGIN * 2;
  canvas.height = Math.max(1, Math.ceil(d.height));
  drawRow(canvas.getContext('2d')!, d, 0, 0, images, s, stripe);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNGの生成に失敗しました'))), 'image/png'),
  );
}

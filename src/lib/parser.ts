import { StudentDictionary, resolveStudents, splitStudents, displayStudent } from './students';

export type RowKind = 'op' | 'phase' | 'setup' | 'note';

/** 表の1行。表で手動編集できるよう、各列は文字列で持つ */
export interface Row {
  id: string;
  kind: RowKind;
  timing: string;
  students: string;
  comment: string;
  pageBreak: boolean;
  /** 置き換え後テキストでの行番号（1始まり）。手動追加は 0 */
  line: number;
}

export type CostFormat = 'num' | 'cost';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒';
const NUM = `(?:\\d+(?:\\.\\d+)?|[${CIRCLED}])`;
const COST_RE = new RegExp(`^(?:コスト)?(${NUM})(?:[〜~\\-](${NUM}))?(付近)?$`);
const TIME_RE = /^(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/;
const COND_RE = /(着弾|後$|^即$|^最速$|^NS|^EX)/i;

/** 全角数字・記号を半角にする（丸数字は残す） */
function toHalfWidth(s: string): string {
  return s.replace(/[０-９．：～]/g, (c) => {
    if (c === '～') return '〜';
    return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
  });
}

function circledToNum(s: string): string {
  const i = CIRCLED.indexOf(s);
  return i >= 0 ? String(i + 1) : s;
}

export interface ParsedTime {
  ms: number;
  text: string;
}

/** 時刻を m:ss.xxx に正規化する。小数3桁未満はゼロ補完、3桁超は保持 */
export function parseTime(token: string): ParsedTime | null {
  const m = TIME_RE.exec(toHalfWidth(token));
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (sec >= 60) return null;
  const frac = m[3] ?? '';
  const fracText = frac.length < 3 ? frac.padEnd(3, '0') : frac;
  return {
    ms: (min * 60 + sec) * 1000 + (frac ? Number(`0.${frac}`) * 1000 : 0),
    text: `${min}:${String(sec).padStart(2, '0')}.${fracText}`,
  };
}

export interface ParsedCost {
  from: string;
  to: string | null;
  near: boolean;
  max: number;
}

export function parseCost(token: string): ParsedCost | null {
  const m = COST_RE.exec(toHalfWidth(token));
  if (!m) return null;
  const from = circledToNum(m[1]);
  const to = m[2] ? circledToNum(m[2]) : null;
  return { from, to, near: !!m[3], max: Math.max(Number(from), to ? Number(to) : 0) };
}

export type TimingToken =
  | { kind: 'time'; raw: string; time: ParsedTime }
  | { kind: 'cost'; raw: string; cost: ParsedCost }
  | { kind: 'cond'; raw: string }
  | { kind: 'other'; raw: string };

export function classifyTimingToken(raw: string): TimingToken {
  const time = parseTime(raw);
  if (time) return { kind: 'time', raw, time };
  const cost = parseCost(raw);
  if (cost) return { kind: 'cost', raw, cost };
  if (COND_RE.test(raw)) return { kind: 'cond', raw };
  return { kind: 'other', raw };
}

function tokenize(s: string): string[] {
  return s.split(/[ \t　]+/).filter(Boolean);
}

export function timingTokens(timing: string): TimingToken[] {
  return tokenize(timing).map(classifyTimingToken);
}

/** タイミング列の表示用文字列。時刻は正規化し、コストは表記設定に従う */
export function formatTiming(timing: string, costFormat: CostFormat): string {
  return timingTokens(timing)
    .map((t) => {
      if (t.kind === 'time') return t.time.text;
      if (t.kind === 'cost') {
        const { from, to, near } = t.cost;
        return `${costFormat === 'cost' ? 'コスト' : ''}${from}${to ? `〜${to}` : ''}${near ? '付近' : ''}`;
      }
      return t.raw;
    })
    .join(' ');
}

/** 生徒列トークンを解決する。最後の区間だけは「生徒名＋余り」を許す */
function matchStudentToken(token: string, dict: StudentDictionary): { students: string; rest: string } | null {
  const segs = token.split('→');
  if (segs.some((s) => s === '')) return null;
  const known = segs.filter((s) => dict.resolveSegment(s).student).length;
  // →区切りで1人でも登録済みなら生徒列とみなす（未登録名は検証で警告）
  if (segs.length > 1 && known > 0) {
    const last = segs[segs.length - 1];
    const len = dict.resolveSegment(last).student ? 0 : dict.prefixLength(last);
    if (len > 0) return { students: [...segs.slice(0, -1), last.slice(0, len)].join('→'), rest: last.slice(len) };
    return { students: token, rest: '' };
  }
  if (known === 1) return { students: token, rest: '' };
  const len = dict.prefixLength(token);
  return len > 0 ? { students: token.slice(0, len), rest: token.slice(len) } : null;
}

let rowSeq = 0;
export function newRowId(): string {
  rowSeq += 1;
  return `r${Date.now().toString(36)}${rowSeq}`;
}

export function emptyRow(kind: RowKind = 'op'): Row {
  return { id: newRowId(), kind, timing: '', students: '', comment: '', pageBreak: false, line: 0 };
}

/** この行の次から改ページする目印 */
export const PAGE_BREAK_RE = /^(-{3,}|ー{3,}|改ページ)$/;

/** 置き換え後テキストを行データにする（CLAUDE.md「行データへの変換」） */
export function parseText(text: string, dict: StudentDictionary): Row[] {
  const rows: Row[] = [];
  let pendingBreak = false;
  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    if (PAGE_BREAK_RE.test(line)) {
      pendingBreak = true;
      return;
    }
    const base = { ...emptyRow(), line: idx + 1, pageBreak: pendingBreak };
    pendingBreak = false;

    if (/^移行/.test(line)) {
      rows.push({ ...base, kind: 'phase', comment: line });
      return;
    }
    const setup = line.match(/^開始SET[\s:：]*(.*)$/i);
    if (setup) {
      rows.push({ ...base, kind: 'setup', comment: setup[1] });
      return;
    }

    const tokens = tokenize(line.replace(/\s*(→|->)\s*/g, '→'));
    let found = -1;
    let match: { students: string; rest: string } | null = null;
    for (let i = 0; i < tokens.length; i++) {
      // 時刻・コストに見えるトークンは生徒名として扱わない
      const t = classifyTimingToken(tokens[i]);
      if (t.kind === 'time' || t.kind === 'cost') continue;
      match = matchStudentToken(tokens[i], dict);
      if (match) {
        found = i;
        break;
      }
    }

    if (found < 0 || !match) {
      rows.push({ ...base, kind: 'note', comment: line });
      return;
    }

    // 区切り無しで続く生徒トークンは後続（最速）として連結する
    const studentParts = [match.students];
    let rest = match.rest;
    let next = found + 1;
    while (!rest && next < tokens.length) {
      const segs = splitStudents(tokens[next]);
      if (segs.length === 0 || !segs.every((s) => dict.resolveSegment(s).student)) break;
      studentParts.push(segs.join('→'));
      next++;
    }

    rows.push({
      ...base,
      kind: 'op',
      // 生徒名より前は内容を問わずタイミング列（時刻・コストは出力時に整形）
      timing: tokens.slice(0, found).join(' '),
      students: studentParts.join('→'),
      comment: [rest, ...tokens.slice(next)].filter(Boolean).join(' '),
    });
  });
  return rows;
}

export interface RowIssue {
  rowId: string;
  line: number;
  level: 'error' | 'warn';
  message: string;
}

export interface BossSetting {
  limitSec: number;
  costCap: number;
}

export function validateRows(rows: Row[], dict: StudentDictionary, boss: BossSetting): RowIssue[] {
  const issues: RowIssue[] = [];
  const push = (row: Row, level: RowIssue['level'], message: string) =>
    issues.push({ rowId: row.id, line: row.line, level, message });

  for (const row of rows) {
    if (row.kind === 'note') {
      const head = tokenize(row.comment)[0];
      const t = head ? classifyTimingToken(head) : null;
      if (t && (t.kind === 'time' || t.kind === 'cost')) {
        push(row, 'warn', '生徒名が見つかりません（独立注釈として扱います）');
      }
      continue;
    }
    if (row.kind !== 'op') continue;

    const unknown = resolveStudents(row.students, dict).filter((r) => !r.student);
    if (splitStudents(row.students).length === 0) push(row, 'warn', '生徒が空です');
    for (const u of unknown) push(row, 'warn', `未登録の生徒: ${u.raw}（別名設定で対応できます）`);
    for (const r of resolveStudents(row.students, dict)) {
      if (r.student && r.targetRaw && !r.target) push(row, 'warn', `対象の生徒が未登録: ${r.targetRaw}（別名設定で対応できます）`);
    }

    for (const t of timingTokens(row.timing)) {
      if (t.kind === 'time' && t.time.ms > boss.limitSec * 1000) {
        push(row, 'warn', `時刻 ${t.time.text} が制限時間を超えています`);
      }
      if (t.kind === 'cost' && t.cost.max > boss.costCap) {
        push(row, 'warn', `コスト ${t.raw} がコスト上限 ${boss.costCap} を超えています`);
      }    }
  }
  return issues;
}

/** 表示・出力用に生徒列を正式名へ置き換える */
export function formatStudents(students: string, dict: StudentDictionary): string {
  return resolveStudents(students, dict).map(displayStudent).join('→');
}

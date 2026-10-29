import stRaw from '../../data/ST.txt?raw';
import spRaw from '../../data/SP.txt?raw';

export type StudentKind = 'ST' | 'SP';

export interface Student {
  id: string;
  name: string;
  baseName: string;
  costume: string;
  kind: StudentKind;
  imageUrl: string;
}

/** TL単位の別名。元データは変更しない */
export interface Alias {
  alias: string;
  target: string;
}

/** 照合用に表記ゆれを吸収する（全角半角・括弧の種類・空白）。[] は対象指定なので衣装の括弧と同一視しない */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[【〔]/g, '(')
    .replace(/[】〕]/g, ')')
    .replace(/\s+/g, '');
}

function parseData(raw: string, kind: StudentKind): Student[] {
  const out: Student[] = [];
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const [url, rawName] = line.split('\t');
    if (!url || !rawName) continue;
    const name = rawName.trim();
    const m = name.match(/^(.+?)[（(](.+)[）)]$/);
    out.push({
      id: `${kind}:${name}`,
      name,
      baseName: m ? m[1] : name,
      costume: m ? m[2] : '',
      kind,
      imageUrl: url.trim(),
    });
  }
  return out;
}

export const STUDENTS: Student[] = [...parseData(stRaw, 'ST'), ...parseData(spRaw, 'SP')];

export interface ResolvedStudent {
  raw: string;
  student: Student | null;
  copy: boolean;
  /** 対象指定 `ウイ[ミカ]` の対象。未登録なら target は null で targetRaw のみ */
  target: Student | null;
  targetRaw: string | null;
}

const TARGET_RE = /^(.+?)[[［]([^\]］]+)[\]］]$/;

export class StudentDictionary {
  private map = new Map<string, Student>();

  constructor(students: Student[], aliases: Alias[]) {
    for (const s of students) {
      const key = normalizeName(s.name);
      if (!this.map.has(key)) this.map.set(key, s);
    }
    for (const a of aliases) {
      const target = this.map.get(normalizeName(a.target));
      const key = normalizeName(a.alias);
      if (target && key) this.map.set(key, target);
    }
  }

  get(name: string): Student | null {
    return this.map.get(normalizeName(name)) ?? null;
  }

  /**
   * 1区間（→で区切られた1人分）を解決する。先頭の C はコピー、即/最速 は無視。
   * 末尾の [名前] は常に対象指定（衣装は （） で書く）
   */
  resolveSegment(seg: string): ResolvedStudent {
    const s = seg.trim().replace(/^(即|最速)/, '');
    const m = TARGET_RE.exec(s);
    if (m) {
      const actor = this.resolveName(m[1]);
      if (actor) return { raw: seg, ...actor, target: this.get(m[2]), targetRaw: m[2].trim() };
    }
    const base = this.resolveName(s);
    if (base) return { raw: seg, ...base, target: null, targetRaw: null };
    return { raw: seg, student: null, copy: false, target: null, targetRaw: null };
  }

  private resolveName(s: string): { student: Student; copy: boolean } | null {
    const direct = this.get(s);
    if (direct) return { student: direct, copy: false };
    if (/^[CＣ]/.test(s)) {
      const copied = this.get(s.slice(1));
      if (copied) return { student: copied, copy: true };
    }
    return null;
  }

  /** 先頭が生徒名で始まる場合、その生徒名部分の文字数を返す（最長一致、2文字以上） */
  prefixLength(seg: string): number {
    for (let len = seg.length; len >= 2; len--) {
      if (this.resolveSegment(seg.slice(0, len)).student) return len;
    }
    return 0;
  }
}

/** 「ユウカ→Cホシノ」のような生徒列を区間ごとに分ける */
export function splitStudents(students: string): string[] {
  return students
    .split(/→|->/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveStudents(students: string, dict: StudentDictionary): ResolvedStudent[] {
  return splitStudents(students).map((seg) => dict.resolveSegment(seg));
}

/** 出力用の表記。登録済みなら正式名（コピーは C 付き、対象は [名前]）、未登録は原文のまま */
export function displayStudent(r: ResolvedStudent): string {
  if (!r.student) return r.raw;
  const target = r.targetRaw ? `[${r.target?.name ?? r.targetRaw}]` : '';
  return (r.copy ? 'C' : '') + r.student.name + target;
}

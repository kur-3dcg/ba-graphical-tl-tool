export type RuleType = 'simple' | 'regex';

export interface Rule {
  id: string;
  from: string;
  to: string;
  type: RuleType;
  enabled: boolean;
}

export interface RuleIssue {
  ruleId: string;
  level: 'error' | 'warn';
  message: string;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** 置き換え後の文字列中の \t \n をタブ・改行として扱う */
export function unescapeReplacement(s: string): string {
  return s.replace(/\\([tn\\])/g, (_, c: string) => (c === 't' ? '\t' : c === 'n' ? '\n' : '\\'));
}

function compile(rule: Rule): RegExp {
  return new RegExp(rule.from, 'gm');
}

function matches(rule: Rule, text: string): boolean {
  if (rule.type === 'simple') return text.includes(rule.from);
  try {
    return compile(rule).test(text);
  } catch {
    return false;
  }
}

/** ルールを上から順に適用する。不正な正規表現はそのルールだけスキップする */
export function applyRules(text: string, rules: Rule[]): { text: string; issues: RuleIssue[] } {
  const issues: RuleIssue[] = [];
  let out = text;
  for (const rule of rules) {
    if (!rule.enabled || rule.from === '') continue;
    const to = unescapeReplacement(rule.to);
    if (rule.type === 'simple') {
      out = out.split(rule.from).join(to);
      continue;
    }
    try {
      out = out.replace(compile(rule), to);
    } catch (e) {
      issues.push({ ruleId: rule.id, level: 'error', message: `正規表現が不正なためスキップ: ${(e as Error).message}` });
    }
  }
  return { text: out, issues };
}

/** 矛盾の警告: ①置換前が同じルールの重複 ②後のルールが前のルールの結果を再置換する */
export function checkRuleConflicts(rules: Rule[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const active = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.enabled && r.from !== '');
  for (let a = 0; a < active.length; a++) {
    for (let b = a + 1; b < active.length; b++) {
      const prev = active[a];
      const next = active[b];
      if (prev.r.type === next.r.type && prev.r.from === next.r.from) {
        issues.push({ ruleId: next.r.id, level: 'warn', message: `ルール${prev.i + 1}と置換前が重複しています` });
        continue;
      }
      const produced = unescapeReplacement(prev.r.to);
      if (produced !== '' && matches(next.r, produced)) {
        issues.push({ ruleId: next.r.id, level: 'warn', message: `ルール${prev.i + 1}の置換結果を再置換します` });
      }
    }
  }
  return issues;
}

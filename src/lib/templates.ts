import type { RuleType } from './rules';

export interface RuleTemplate {
  label: string;
  from: string;
  to: string;
  type: RuleType;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  { label: '連続空白の整理', from: '[ \\t　]+', to: ' ', type: 'regex' },
  { label: '区切りの最速表記統一（、→ →）', from: '、', to: '→', type: 'simple' },
  { label: '全角コロンを半角に', from: '：', to: ':', type: 'simple' },
  { label: '波線の統一（～ → 〜）', from: '～', to: '〜', type: 'simple' },
];

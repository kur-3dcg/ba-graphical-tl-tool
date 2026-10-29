import { useMemo, useState } from 'react';
import type { CostFormat, Row } from '../lib/parser';
import type { StudentDictionary } from '../lib/students';
import { exportTsv } from '../lib/exportText';

interface Props {
  rows: Row[];
  dict: StudentDictionary;
  costFormat: CostFormat;
  onCostFormatChange: (f: CostFormat) => void;
}

export function TextOutput({ rows, dict, costFormat, onCostFormatChange }: Props) {
  const tsv = useMemo(() => exportTsv(rows, dict, costFormat), [rows, dict, costFormat]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const save = () => {
    const url = URL.createObjectURL(new Blob([tsv], { type: 'text/tab-separated-values' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tl.tsv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          コスト表記
          <select
            className="rounded border border-slate-300 px-1"
            value={costFormat}
            onChange={(e) => onCostFormatChange(e.target.value as CostFormat)}
          >
            <option value="num">数値のみ</option>
            <option value="cost">コスト付き</option>
          </select>
        </label>
        <span className="text-slate-500">TSV（Excel・スプレッドシートに貼り付け可）</span>
        <button className="ml-auto rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500" onClick={copy}>
          {copied ? 'コピーしました' : 'コピー'}
        </button>
        <button className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50" onClick={save}>
          .tsv を保存
        </button>
      </div>
      <textarea readOnly className="h-80 w-full rounded border border-slate-300 p-2 font-mono text-sm" value={tsv} style={{ tabSize: 16 }} />
    </div>
  );
}

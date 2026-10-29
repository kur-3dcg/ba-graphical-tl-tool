import type { Row, CostFormat } from './parser';
import { formatTiming, formatStudents } from './parser';
import type { StudentDictionary } from './students';

/** セル内のタブ・改行はTSVを壊すので空白にする */
function cell(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').trim();
}

/** TSV出力（CLAUDE.md「テキスト出力仕様」） */
export function exportTsv(rows: Row[], dict: StudentDictionary, costFormat: CostFormat): string {
  const lines = ['タイミング\t生徒\tコメント'];
  for (const row of rows) {
    switch (row.kind) {
      case 'op':
        lines.push(
          [formatTiming(row.timing, costFormat), formatStudents(row.students, dict), row.comment].map(cell).join('\t'),
        );
        break;
      case 'phase':
        lines.push(`${cell(row.comment)}\t\t`);
        break;
      case 'setup':
        lines.push(`開始SET\t\t${cell(row.comment)}`);
        break;
      case 'note':
        lines.push(`\t\t${cell(row.comment)}`);
        break;
    }
  }
  return lines.join('\n');
}

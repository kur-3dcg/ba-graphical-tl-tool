import type { KeyboardEvent } from 'react';

/**
 * Tab キーでフォーカス移動せず、カーソル位置にタブ文字を入れる。
 * Shift+Tab は従来どおり前の項目へ移動する（キーボードだけで抜け出せるように残す）。
 * 処理した場合は true を返す
 */
export function insertTabOnTabKey(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.nativeEvent.isComposing) return false;
  e.preventDefault();
  // execCommand なら入力欄の Ctrl+Z 履歴に残り、React の onChange も発火する
  if (!document.execCommand('insertText', false, '\t')) {
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    el.setRangeText('\t', start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return true;
}

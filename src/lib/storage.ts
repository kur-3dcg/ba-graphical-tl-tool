import { useEffect, useState } from 'react';

const PREFIX = 'tl3.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** localStorage に保存される state。保存できない環境でも動作は続ける */
export function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // 保存失敗は無視（プライベートモード等）
    }
  }, [key, value]);
  return [value, setValue] as const;
}

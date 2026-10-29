import { useEffect, useRef, useState } from 'react';

/** ヘッダー右上のメニュー。配列1つが区切り線で分けた1グループ */
const LINK_GROUPS: { label: string; url: string }[][] = [
  [{ label: '他ツール', url: 'https://kur-3dcg.github.io/' }],
  [{ label: 'マニュアル（note）', url: 'https://note.com/kur7263/n/n0ef683f27d80' }],
  [
    {
      label: 'ご意見・ご感想・バグ報告などはこちらから',
      url: 'https://docs.google.com/forms/d/e/1FAIpQLSd60EMHzAJHjBE2BRF7L3ZIBdTytObTQoQ3c_4gBeHjHwMPwg/viewform?usp=header',
    },
    { label: '更新・開発情報はこちら', url: 'https://x.com/kur_3dcg' },
  ],
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // メニューの外をクリック・Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className={`flex h-8 w-9 flex-col items-center justify-center gap-1 rounded border ${open ? 'border-slate-700 bg-slate-700' : 'border-slate-300 bg-white hover:bg-slate-100'}`}
        onClick={() => setOpen(!open)}
        aria-label="メニュー"
        aria-expanded={open}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={`block h-0.5 w-4 rounded ${open ? 'bg-white' : 'bg-slate-600'}`} />
        ))}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-300 bg-white py-1 text-sm shadow-lg">
          {LINK_GROUPS.map((group, i) => (
            <div key={i} className={i > 0 ? 'border-t border-slate-200 pt-1 mt-1' : ''}>
              {group.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 hover:bg-slate-100"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

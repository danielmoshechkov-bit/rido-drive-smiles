import { useEffect } from 'react';

// Blokuje zmianę wartości pól <input type="number"> przez scroll myszki/touchpada
// (domyślne zachowanie przeglądarki: scroll nad zafokusowanym polem +/− wartość).
// Globalny listener (passive:false) — łapie WSZYSTKIE pola liczbowe, też w dialogach/
// portalach — bez ruszania każdego inputu z osobna. Reszta (wpisywanie/walidacja) bez zmian.
// Blokuje tylko gdy scrollowane pole jest zafokusowane (cursor nad nim) → scroll strony
// w innych miejscach działa normalnie.
export function useDisableNumberInputScroll() {
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);
}

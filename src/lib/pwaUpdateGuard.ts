import { useEffect } from 'react';

/**
 * Rejestr blokad auto-przeładowania PWA.
 *
 * Gdy service worker ma gotową nową wersję aplikacji, PwaUpdater przeładowuje
 * stronę automatycznie — ALE nigdy, gdy użytkownik jest "w trakcie czegoś".
 * Ten moduł odpowiada na pytanie "czy wolno teraz przeładować?".
 *
 * Dwie warstwy:
 * 1. Jawne blokady — komponent rejestruje się na czas montażu
 *    (usePwaUpdateBlocker). Używane przez ekrany podpisu (SignaturePad),
 *    bo utrata podpisu klienta jest nieakceptowalna.
 * 2. Heurystyki DOM/stanu — otwarte modale Radix, fokus w polu edycji,
 *    trwające mutacje TanStack Query, trasy podpisu. W projekcie nie ma
 *    jednolitego rejestru "dirty form", więc otwarty dialog + aktywny fokus
 *    w polu tekstowym pełnią rolę przybliżenia "niezapisanych zmian".
 */

const blockers = new Set<string>();

/** Rejestruje blokadę; zwraca funkcję zdejmującą. */
export function registerPwaUpdateBlocker(reason: string): () => void {
  // Set nie rozróżnia duplikatów — unikalizujemy, żeby dwa komponenty
  // z tym samym powodem nie zdejmowały sobie nawzajem blokady.
  let key = reason;
  let i = 0;
  while (blockers.has(key)) key = `${reason}#${++i}`;
  blockers.add(key);
  return () => { blockers.delete(key); };
}

/** Hook: blokuje auto-reload przez cały czas montażu komponentu (gdy active). */
export function usePwaUpdateBlocker(active: boolean, reason: string) {
  useEffect(() => {
    if (!active) return;
    return registerPwaUpdateBlocker(reason);
  }, [active, reason]);
}

// Trasy, na których klient podpisuje dokumenty (kosztorys, protokół odbioru,
// umowy najmu). Twarda blokada niezależnie od heurystyk — patrz WorkshopClientCard,
// RentalClientPortal, RentalContractPortal.
const SIGNATURE_ROUTE_PREFIXES = ['/warsztat/klient/', '/umowa/', '/wynajem/umowa/'];

export function isOnSignatureRoute(pathname: string = window.location.pathname): boolean {
  return SIGNATURE_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}

function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    // checkbox/radio/przycisk = klik, nie "pisanie" — nie blokują
    return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(type);
  }
  return (el as HTMLElement).isContentEditable;
}

function hasOpenOverlay(): boolean {
  // Radix Dialog / AlertDialog / Sheet / Drawer renderują role="dialog"
  // (lub "alertdialog") z data-state="open" w portalu.
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [vaul-drawer][data-state="open"]'
  );
}

export interface PwaBusyCheck {
  /** Liczba trwających mutacji TanStack Query (uploady, zapisy). */
  isMutating?: () => number;
}

/**
 * Czy użytkownik jest "w trakcie czegoś" — jeśli tak, NIE wolno auto-przeładować.
 * W razie wątpliwości zwraca true (bezpieczniej zostać na starej wersji).
 */
export function isUserBusy(check: PwaBusyCheck = {}): boolean {
  try {
    if (blockers.size > 0) return true;
    if (isOnSignatureRoute()) return true;
    if (hasOpenOverlay()) return true;
    if (isEditableElementFocused()) return true;
    if ((check.isMutating?.() ?? 0) > 0) return true;
    return false;
  } catch {
    return true;
  }
}

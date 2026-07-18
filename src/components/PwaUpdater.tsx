import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { isUserBusy } from '@/lib/pwaUpdateGuard';

/**
 * Auto-aktualizacja PWA.
 *
 * registerType: 'autoUpdate' → wygenerowany SW ma skipWaiting + clientsClaim,
 * więc nowa wersja SW aktywuje się sama zaraz po pobraniu. Problemy, które
 * ten komponent rozwiązuje:
 * 1. Nikt nie inicjował sprawdzania aktualizacji (SPA bez pełnych nawigacji
 *    = przeglądarka pytała o sw.js raz na 24h) → registration.update() na
 *    starcie, przy powrocie do karty, po odzyskaniu sieci i co 15 min.
 * 2. Po cichej aktywacji nowego SW otwarta karta dalej działała na starym
 *    bundle'u aż do ręcznego odświeżenia → kontrolowany reload: automatyczny
 *    po krótkim toaście, chyba że użytkownik jest w trakcie edycji/podpisu
 *    (wtedy trwały toast z przyciskiem + reload po zwolnieniu blokady).
 *
 * Detekcja nowej wersji: zdarzenie 'controllerchange' (nowy SW przejął
 * kontrolę). W trybie autoUpdate onNeedRefresh NIE jest wywoływany — to API
 * trybu 'prompt' — dlatego słuchamy controllerchange bezpośrednio.
 */

const UPDATE_INTERVAL_MS = 15 * 60 * 1000;
const RELOAD_FLAG_KEY = 'pwa-update-reloaded-at';
const RELOAD_LOOP_WINDOW_MS = 60 * 1000;
const BUSY_RECHECK_MS = 5 * 1000;
const AUTO_RELOAD_TOAST_MS = 1500;

// Singleton — App może się przemontować (StrictMode itp.), rejestracja ma
// wystartować raz na życie strony.
let started = false;

function reloadedRecently(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(RELOAD_FLAG_KEY) || 0);
    return ts > 0 && Date.now() - ts < RELOAD_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

function markReloadAndGo() {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(Date.now()));
  } catch { /* sessionStorage niedostępny — reload i tak bezpieczny */ }
  window.location.reload();
}

export function PwaUpdater() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (started || !('serviceWorker' in navigator)) return;
    started = true;

    const busyCheck = { isMutating: () => queryClient.isMutating() };
    let updateHandled = false;

    const showManualToast = (onFreeAgain: () => void) => {
      toast('Dostępna nowa wersja aplikacji', {
        id: 'pwa-update',
        description: 'Odśwież, aby z niej skorzystać.',
        duration: Infinity,
        action: { label: 'Odśwież', onClick: () => markReloadAndGo() },
      });
      // Gdy użytkownik skończy (zamknie modal / zapisze formularz / zejdzie
      // z ekranu podpisu) — przeładuj automatycznie.
      const poll = setInterval(() => {
        if (!isUserBusy(busyCheck)) {
          clearInterval(poll);
          onFreeAgain();
        }
      }, BUSY_RECHECK_MS);
    };

    const autoReloadWithToast = () => {
      toast('Aktualizuję do najnowszej wersji…', {
        id: 'pwa-update',
        duration: AUTO_RELOAD_TOAST_MS,
      });
      setTimeout(() => {
        // Stan mógł się zmienić w trakcie 1,5 s toastu (np. klient wszedł
        // w podpis) — sprawdź jeszcze raz tuż przed reloadem.
        if (isUserBusy(busyCheck)) {
          showManualToast(autoReloadWithToast);
        } else {
          markReloadAndGo();
        }
      }, AUTO_RELOAD_TOAST_MS);
    };

    const handleNewVersion = () => {
      if (updateHandled) return;
      updateHandled = true;
      if (reloadedRecently()) {
        // Ochrona przed pętlą: reload już się właśnie odbył, a SW dalej
        // zgłasza zmianę kontrolera — nie auto-przeładowuj drugi raz.
        showManualToast(() => { /* świadomie: tylko ręczny przycisk */ });
        return;
      }
      if (isUserBusy(busyCheck)) {
        showManualToast(autoReloadWithToast);
      } else {
        autoReloadWithToast();
      }
    };

    // Pierwsze wejście (strona bez kontrolera): pierwszy controllerchange to
    // clients.claim() świeżej instalacji, nie aktualizacja — pomijamy.
    // Uwaga: to jest zarazem ochrona przed toastem przy pierwszej instalacji.
    let wasControlled = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (!wasControlled) {
        wasControlled = true;
        return;
      }
      handleNewVersion();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | undefined;
    const checkForUpdate = () => {
      registration?.update().catch(() => { /* offline / chwilowy błąd sieci */ });
    };

    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, r) {
        registration = r;
        // register() sam odpala pierwsze sprawdzenie; dobij od razu jawnie,
        // żeby świeżo otwarta, długo nieużywana PWA złapała update natychmiast.
        checkForUpdate();
      },
      onRegisterError() { /* brak SW ≠ awaria aplikacji */ },
    });

    const interval = setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', checkForUpdate);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [queryClient]);

  return null;
}

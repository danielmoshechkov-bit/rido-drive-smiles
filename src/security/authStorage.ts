const REMEMBER_ME_KEY = "rido_remember_me";
const SESSION_ACTIVE_KEY = "rido_session_active";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function stores(): { local: BrowserStorage; session: BrowserStorage } | null {
  if (typeof window === "undefined") return null;
  return { local: window.localStorage, session: window.sessionStorage };
}

function shouldPersistSession(local: BrowserStorage): boolean {
  return local.getItem(REMEMBER_ME_KEY) === "true";
}

/**
 * Ustaw preferencję przed wywołaniem signIn. Dzięki temu Supabase zapisze nową
 * sesję od razu w prawidłowym magazynie, a nie przeniesie ją dopiero po loginie.
 */
export function setAuthPersistencePreference(remember: boolean): void {
  const storage = stores();
  if (!storage) return;

  if (remember) {
    storage.local.setItem(REMEMBER_ME_KEY, "true");
    storage.session.removeItem(SESSION_ACTIVE_KEY);
  } else {
    storage.local.removeItem(REMEMBER_ME_KEY);
    storage.session.setItem(SESSION_ACTIVE_KEY, "true");
  }
}

/**
 * Adapter Supabase rozdzielający sesje trwałe i sesyjne. Każdy klucz auth
 * istnieje najwyżej w jednym magazynie; removeItem czyści oba, co domyka
 * migrację ze starszej wersji, która zawsze używała localStorage.
 */
export const supabaseAuthStorage = {
  getItem(key: string): string | null {
    const storage = stores();
    if (!storage) return null;

    if (shouldPersistSession(storage.local)) {
      const persistent = storage.local.getItem(key);
      if (persistent !== null) {
        storage.session.removeItem(key);
        return persistent;
      }

      const transient = storage.session.getItem(key);
      if (transient !== null) {
        storage.local.setItem(key, transient);
        storage.session.removeItem(key);
      }
      return transient;
    }

    // Brak „zapamiętaj mnie” oznacza fail-closed po zamknięciu karty. Stary
    // token pozostawiony przez historyczny klient jest usuwany, nie używany.
    storage.local.removeItem(key);
    return storage.session.getItem(key);
  },

  setItem(key: string, value: string): void {
    const storage = stores();
    if (!storage) return;

    if (shouldPersistSession(storage.local)) {
      storage.local.setItem(key, value);
      storage.session.removeItem(key);
    } else {
      storage.session.setItem(key, value);
      storage.local.removeItem(key);
    }
  },

  removeItem(key: string): void {
    const storage = stores();
    if (!storage) return;
    storage.local.removeItem(key);
    storage.session.removeItem(key);
  },
};

export const AUTH_STORAGE_KEYS = {
  rememberMe: REMEMBER_ME_KEY,
  sessionActive: SESSION_ACTIVE_KEY,
} as const;

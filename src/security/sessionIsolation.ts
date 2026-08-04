export const PRINCIPAL_MARKER_KEY = "rido:security:last-principal";

const PRIVATE_CACHE_NAME_PATTERNS = [/supabase/i, /^rido-private-/i];

const SENSITIVE_LOCAL_KEYS = new Set([
  "testUser",
  "rido_cart",
  "rido_market_favs",
  "rido_market_compare",
  "rido-completed-tours",
  "workspace_onboarding_completed",
  "getrido_location_queue",
  "getrido_gps_consent",
  "getrido_address_history",
  "getrido_address_history_start",
  "getrido_address_history_end",
  "rido_recent_locations",
  "rido_vehicle_recent_locations",
  "fleet_live_view",
  "driver_selected_plan",
  "rental_dry_run",
  "workshop_booking_reminder_prefs",
]);

const SENSITIVE_LOCAL_PREFIXES = [
  "service-provider-activation-draft:",
  "workshop-order-draft:",
  "workshop:lastStation:",
  "workshop_doc_numbering_",
  "workshop_roles_",
  "workshop_rate_types_",
  "fleet_hidden_cols_",
  "fleet_show_rental_",
];

const SENSITIVE_SESSION_KEYS = new Set(["rido_session_active"]);
const SENSITIVE_SESSION_PREFIXES = ["rido:payment-intent:"];

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

export interface QueryClientLike {
  cancelQueries(): Promise<unknown>;
  clear(): void;
}

export function isSensitiveStorageKey(
  key: string,
  kind: "local" | "session",
): boolean {
  if (kind === "local") {
    return SENSITIVE_LOCAL_KEYS.has(key)
      || SENSITIVE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix));
  }
  return SENSITIVE_SESSION_KEYS.has(key)
    || SENSITIVE_SESSION_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function purgeSensitiveStorage(
  storage: StorageLike | undefined,
  kind: "local" | "session",
): string[] {
  if (!storage) return [];
  const removed: string[] = [];
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null);

  for (const key of keys) {
    if (!isSensitiveStorageKey(key, kind)) continue;
    try {
      storage.removeItem(key);
      removed.push(key);
    } catch {
      // Brak dostępu do konkretnego storage nie może odsłonić wartości w logu.
    }
  }
  return removed;
}

export async function purgePrivateBrowserCaches(
  cacheStorage?: CacheStorageLike,
): Promise<string[]> {
  if (!cacheStorage) return [];
  let names: string[];
  try {
    names = await cacheStorage.keys();
  } catch {
    return [];
  }

  const privateNames = names.filter((name) =>
    PRIVATE_CACHE_NAME_PATTERNS.some((pattern) => pattern.test(name))
  );
  await Promise.allSettled(privateNames.map((name) => cacheStorage.delete(name)));
  return privateNames;
}

export function principalFingerprint(session: unknown): string {
  const candidate = session as {
    user?: {
      id?: unknown;
      role?: unknown;
      app_metadata?: Record<string, unknown>;
    };
  } | null;
  const user = candidate?.user;
  if (!user || typeof user.id !== "string") return "anonymous";

  const metadata = user.app_metadata ?? {};
  const authorizationContext = {
    role: typeof user.role === "string" ? user.role : null,
    roles: metadata.roles ?? null,
    tenant_id: metadata.tenant_id ?? null,
    company_id: metadata.company_id ?? null,
    provider_id: metadata.provider_id ?? null,
  };
  return `${user.id}:${JSON.stringify(authorizationContext)}`;
}

function browserEnvironment() {
  if (typeof window === "undefined") {
    return {
      local: undefined,
      session: undefined,
      caches: undefined,
    };
  }
  return {
    local: window.localStorage as StorageLike,
    session: window.sessionStorage as StorageLike,
    caches: typeof window.caches === "undefined"
      ? undefined
      : window.caches as CacheStorageLike,
  };
}

export async function bootstrapPrincipalIsolation(principal: string): Promise<void> {
  const environment = browserEnvironment();
  await purgePrivateBrowserCaches(environment.caches);

  let previous: string | null = null;
  try {
    previous = environment.local?.getItem(PRINCIPAL_MARKER_KEY) ?? null;
  } catch {
    previous = null;
  }

  // Pierwsze uruchomienie po wdrożeniu również czyści niepartycjonowane dane
  // starszych wersji. Jest to jednorazowy, świadomy koszt bezpieczeństwa.
  if (previous !== principal) {
    purgeSensitiveStorage(environment.local, "local");
    purgeSensitiveStorage(environment.session, "session");
  }

  try {
    environment.local?.setItem(PRINCIPAL_MARKER_KEY, principal);
  } catch {
    // Marker jest optymalizacją; brak localStorage nie osłabia czyszczenia cache.
  }
}

export async function clearPrincipalScopedClientState(
  queryClient: QueryClientLike,
  nextPrincipal: string,
): Promise<void> {
  try {
    await queryClient.cancelQueries();
  } catch {
    // Anulowanie zapytania może odrzucić Promise, ale nie może pozostawić
    // danych poprzedniego użytkownika w pamięci aplikacji.
  }
  queryClient.clear();

  const environment = browserEnvironment();
  await purgePrivateBrowserCaches(environment.caches);
  purgeSensitiveStorage(environment.local, "local");
  purgeSensitiveStorage(environment.session, "session");
  try {
    environment.local?.setItem(PRINCIPAL_MARKER_KEY, nextPrincipal);
  } catch {
    // Brak trwałego markera oznacza ponowne czyszczenie przy następnym starcie.
  }
}

export const SECURITY_CONTEXT_CHANGE_EVENT = "rido:security-context-change";

export function announceSecurityContextChange(context: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SECURITY_CONTEXT_CHANGE_EVENT, {
    detail: { context: context.slice(0, 120) },
  }));
}

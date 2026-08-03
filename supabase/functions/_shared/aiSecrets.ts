// ============================================================================
// AI SECRETS — wspólna warstwa odczytu/zapisu kluczy API z ai_secret_store.
// Wartość czytana WYŁĄCZNIE przez service_role (ten moduł). Nigdy do frontu.
//
// Szyfrowanie at-rest: AES-GCM (Web Crypto) gdy ustawiony sekret
// AI_SECRETS_ENC_KEY. Bez niego wartość leży plaintext (is_encrypted=false) —
// nadal admin-only (RLS deny-all + REVOKE), panel sygnalizuje brak szyfrowania.
//
// Odczyt: ai_secret_store -> (fallback) Deno.env.get(key). Dzięki temu klucz
// można podać albo z panelu (A2), albo klasycznie przez Supabase Secrets.
// ============================================================================

const enc = new TextEncoder();
const dec = new TextDecoder();
const SECRET_CACHE_TTL_MS = 30_000;
const secretCache = new Map<string, { value: string; expiresAt: number }>();

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(passphrase));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decryptWithPassphrase(ciphertext: string, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase);
  const combined = b64decode(ciphertext);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return dec.decode(pt);
}

export function encryptionAvailable(): boolean {
  return !!Deno.env.get("AI_SECRETS_ENC_KEY");
}

export async function encryptValue(plain: string): Promise<{ ciphertext: string; is_encrypted: boolean }> {
  const pass = Deno.env.get("AI_SECRETS_ENC_KEY");
  if (!pass) return { ciphertext: plain, is_encrypted: false };
  const key = await deriveKey(pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return { ciphertext: b64encode(combined), is_encrypted: true };
}

export async function decryptValue(ciphertext: string, isEncrypted: boolean): Promise<string> {
  if (!isEncrypted) return ciphertext;
  const pass = Deno.env.get("AI_SECRETS_ENC_KEY");
  if (!pass) throw new Error("AI_SECRETS_ENC_KEY missing — nie można odszyfrować zapisanego klucza");
  try {
    return await decryptWithPassphrase(ciphertext, pass);
  } catch (currentError) {
    const previousPass = Deno.env.get("AI_SECRETS_ENC_KEY_PREVIOUS");
    if (!previousPass) throw currentError;
    return await decryptWithPassphrase(ciphertext, previousPass);
  }
}

/** Odczyt sekretu: ai_secret_store (service_role) -> fallback env. Null gdy brak. */
export async function getSecret(sb: any, key: string): Promise<string | null> {
  const cached = secretCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) secretCache.delete(key);
  const { data } = await sb
    .from("ai_secret_store")
    .select("ciphertext, is_encrypted")
    .eq("secret_key", key)
    .maybeSingle();
  if (data?.ciphertext) {
    try {
      const value = await decryptValue(data.ciphertext, data.is_encrypted);
      secretCache.set(key, { value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
      return value;
    } catch (_) {
      return null;
    }
  }
  const envValue = Deno.env.get(key) ?? null;
  if (envValue) secretCache.set(key, { value: envValue, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
  return envValue;
}

/** Zapis sekretu (nadpisuje stary). Wymaga klienta service_role. */
export async function setSecret(
  sb: any,
  key: string,
  value: string,
  group: string,
  userId: string | null,
): Promise<void> {
  const { ciphertext, is_encrypted } = await encryptValue(value);
  const { error } = await sb.from("ai_secret_store").upsert(
    {
      secret_key: key,
      ciphertext,
      is_encrypted,
      secret_group: group,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "secret_key" },
  );
  if (error) throw error;
  secretCache.set(key, { value, expiresAt: Date.now() + SECRET_CACHE_TTL_MS });
}

/** Status sekretu — NIGDY nie zwraca wartości. */
export async function secretStatus(
  sb: any,
  key: string,
): Promise<{ key: string; is_set: boolean; is_readable: boolean; source: "panel" | "env" | null; is_encrypted: boolean; updated_at: string | null }> {
  const { data } = await sb
    .from("ai_secret_store")
    .select("ciphertext, is_encrypted, updated_at")
    .eq("secret_key", key)
    .maybeSingle();
  if (data?.ciphertext) {
    let isReadable = true;
    if (data.is_encrypted) {
      try {
        await decryptValue(data.ciphertext, true);
      } catch (_) {
        isReadable = false;
      }
    }
    return { key, is_set: true, is_readable: isReadable, source: "panel", is_encrypted: data.is_encrypted, updated_at: data.updated_at };
  }
  if (Deno.env.get(key)) {
    return { key, is_set: true, is_readable: true, source: "env", is_encrypted: false, updated_at: null };
  }
  return { key, is_set: false, is_readable: false, source: null, is_encrypted: false, updated_at: null };
}

/**
 * Ponownie szyfruje cały magazyn bieżącym AI_SECRETS_ENC_KEY. Odczyt obsługuje
 * AI_SECRETS_ENC_KEY_PREVIOUS, więc przerwaną rotację można bezpiecznie wznowić.
 * Funkcja nie zwraca ani nie loguje wartości sekretów.
 */
export async function rotateStoredSecrets(sb: any): Promise<number> {
  if (!Deno.env.get("AI_SECRETS_ENC_KEY")) throw new Error("AI_SECRETS_ENC_KEY missing");
  const { data, error } = await sb.from("ai_secret_store")
    .select("secret_key,ciphertext,is_encrypted,secret_group,updated_by");
  if (error) throw error;

  const decrypted = await Promise.all((data || []).map(async (row: any) => ({
    ...row,
    value: await decryptValue(row.ciphertext, row.is_encrypted),
  })));
  for (const row of decrypted) {
    await setSecret(sb, row.secret_key, row.value, row.secret_group || "llm", row.updated_by || null);
  }
  return decrypted.length;
}

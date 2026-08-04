// ============================================================================
// AI SECRETS — wspólna warstwa odczytu/zapisu kluczy API z ai_secret_store.
// Wartość czytana WYŁĄCZNIE przez service_role (ten moduł). Nigdy do frontu.
//
// Szyfrowanie at-rest: AES-GCM (Web Crypto). Zapis bez poprawnie ustawionego
// AI_SECRETS_ENC_KEY jest celowo blokowany — sekret nie może trafić do tabeli
// jako plaintext nawet wtedy, gdy tabela ma restrykcyjne RLS.
//
// Odczyt: ai_secret_store -> (fallback) Deno.env.get(key). Dzięki temu klucz
// można podać albo z panelu (A2), albo klasycznie przez Supabase Secrets.
// ============================================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

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

export function encryptionAvailable(): boolean {
  return (Deno.env.get("AI_SECRETS_ENC_KEY")?.length ?? 0) >= 32;
}

export async function encryptValue(plain: string): Promise<{ ciphertext: string; is_encrypted: boolean }> {
  const pass = Deno.env.get("AI_SECRETS_ENC_KEY");
  if (!pass || pass.length < 32) {
    throw new Error("AI_SECRETS_ENC_KEY missing or too short");
  }
  const key = await deriveKey(pass);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return { ciphertext: b64encode(combined), is_encrypted: true };
}

export async function decryptValue(ciphertext: string, isEncrypted: boolean): Promise<string> {
  if (!isEncrypted) throw new Error("Refusing to read a plaintext secret from ai_secret_store");
  const pass = Deno.env.get("AI_SECRETS_ENC_KEY");
  if (!pass) throw new Error("AI_SECRETS_ENC_KEY missing — nie można odszyfrować zapisanego klucza");
  const key = await deriveKey(pass);
  const combined = b64decode(ciphertext);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return dec.decode(pt);
}

/** Odczyt sekretu: ai_secret_store (service_role) -> fallback env. Null gdy brak. */
export async function getSecret(sb: any, key: string): Promise<string | null> {
  const { data } = await sb
    .from("ai_secret_store")
    .select("ciphertext, is_encrypted")
    .eq("secret_key", key)
    .maybeSingle();
  if (data?.ciphertext && data.is_encrypted === true) {
    try {
      return await decryptValue(data.ciphertext, data.is_encrypted);
    } catch (_) {
      return null;
    }
  }
  return Deno.env.get(key) ?? null;
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
}

/** Status sekretu — NIGDY nie zwraca wartości. */
export async function secretStatus(
  sb: any,
  key: string,
): Promise<{ key: string; is_set: boolean; source: "panel" | "env" | null; is_encrypted: boolean; updated_at: string | null }> {
  const { data } = await sb
    .from("ai_secret_store")
    .select("ciphertext, is_encrypted, updated_at")
    .eq("secret_key", key)
    .maybeSingle();
  if (data?.ciphertext) {
    return { key, is_set: true, source: "panel", is_encrypted: data.is_encrypted, updated_at: data.updated_at };
  }
  if (Deno.env.get(key)) {
    return { key, is_set: true, source: "env", is_encrypted: false, updated_at: null };
  }
  return { key, is_set: false, source: null, is_encrypted: false, updated_at: null };
}

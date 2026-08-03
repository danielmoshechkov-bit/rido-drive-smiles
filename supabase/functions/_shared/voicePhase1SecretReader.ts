// Read-only copy of the production secret lookup used by the two Phase 1
// entrypoints. It deliberately excludes the unshipped cache/rotation work, so
// deploying this canary cannot alter secret semantics for non-canary traffic.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
  return output;
};

const deriveKey = async (passphrase: string): Promise<CryptoKey> => {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(passphrase));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
};

const decryptValue = async (ciphertext: string, isEncrypted: boolean): Promise<string> => {
  if (!isEncrypted) return ciphertext;
  const passphrase = Deno.env.get("AI_SECRETS_ENC_KEY");
  if (!passphrase) throw new Error("AI_SECRETS_ENC_KEY missing");
  const combined = decodeBase64(ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    await deriveKey(passphrase),
    combined.slice(12),
  );
  return decoder.decode(plaintext);
};

export async function getPhase1Secret(
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data?: { ciphertext?: string; is_encrypted?: boolean } | null }>;
        };
      };
    };
  },
  key: string,
): Promise<string | null> {
  const { data } = await supabase.from("ai_secret_store")
    .select("ciphertext, is_encrypted")
    .eq("secret_key", key)
    .maybeSingle();
  if (data?.ciphertext) {
    try {
      return await decryptValue(data.ciphertext, !!data.is_encrypted);
    } catch (_) {
      return null;
    }
  }
  return Deno.env.get(key) ?? null;
}

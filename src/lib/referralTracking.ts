// Referral code tracking - captures ?ref=CODE from URL and stores for 30 days

const STORAGE_KEY = "getrido_ref_code";
const STORAGE_EXP_KEY = "getrido_ref_code_exp";
const TTL_DAYS = 30;

export function captureReferralCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref") || params.get("REF");
    if (!code) return null;
    const clean = code.trim().toUpperCase().slice(0, 16);
    if (!/^[A-Z0-9]{4,16}$/.test(clean)) return null;
    storeReferralCode(clean);
    return clean;
  } catch {
    return null;
  }
}

export function storeReferralCode(code: string): void {
  try {
    const exp = Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(STORAGE_KEY, code);
    localStorage.setItem(STORAGE_EXP_KEY, String(exp));
    // Cookie fallback (30d)
    document.cookie = `${STORAGE_KEY}=${code}; Max-Age=${TTL_DAYS * 86400}; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function getStoredReferralCode(): string | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    const exp = Number(localStorage.getItem(STORAGE_EXP_KEY) || 0);
    if (code && exp && Date.now() < exp) return code;
    if (code && exp && Date.now() >= exp) clearReferralCode();
    // Cookie fallback
    const match = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_EXP_KEY);
    document.cookie = `${STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // ignore
  }
}

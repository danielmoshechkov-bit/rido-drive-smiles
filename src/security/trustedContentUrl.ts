const SUPABASE_DOCUMENT_ORIGIN = "https://wclrrytmrscqvsyxyvnn.supabase.co";

export const PRIVATE_DOCUMENT_BUCKETS = [
  "documents",
  "driver-documents",
  "purchase-invoices",
  "workspace-files",
  "ticket-screenshots",
] as const;

export type PrivateDocumentBucket = typeof PRIVATE_DOCUMENT_BUCKETS[number];
export type DocumentPreviewKind = "image" | "pdf" | "unsupported";

function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 8_192) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function parseStoragePath(
  value: unknown,
  allowedBuckets: readonly PrivateDocumentBucket[],
  allowedAccess: readonly ("public" | "sign")[],
): { url: URL; bucket: PrivateDocumentBucket; objectPath: string; access: "public" | "sign" } | null {
  const url = parseHttpsUrl(value);
  if (!url || url.origin !== SUPABASE_DOCUMENT_ORIGIN) return null;

  const match = url.pathname.match(/^\/storage\/v1\/object\/(public|sign)\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const access = match[1] as "public" | "sign";
  if (!allowedAccess.includes(access)) return null;

  let bucket: string;
  let objectPath: string;
  try {
    bucket = decodeURIComponent(match[2]);
    objectPath = decodeURIComponent(match[3]);
  } catch {
    return null;
  }

  if (!allowedBuckets.includes(bucket as PrivateDocumentBucket)) return null;
  if (!objectPath || objectPath.startsWith("/") || objectPath.includes("\\")) return null;
  if (objectPath.split("/").some((part) => !part || part === "." || part === "..")) return null;

  return { url, bucket: bucket as PrivateDocumentBucket, objectPath, access };
}

/**
 * Zwraca wyłącznie podpisany URL prywatnego obiektu z dokładnego projektu
 * Supabase. Publiczne i zewnętrzne adresy pozostają fail-closed.
 */
export function getTrustedPrivateDocumentUrl(
  value: unknown,
  allowedBuckets: readonly PrivateDocumentBucket[] = PRIVATE_DOCUMENT_BUCKETS,
): string | null {
  const parsed = parseStoragePath(value, allowedBuckets, ["sign"]);
  if (!parsed || !parsed.url.searchParams.get("token")) return null;

  parsed.url.hash = "";
  return parsed.url.toString();
}

/**
 * Służy tylko do zamiany historycznego URL Supabase na ścieżkę, dla której
 * klient poprosi Storage API o świeży signed URL. Zwróconej wartości nie wolno
 * renderować bez getTrustedPrivateDocumentUrl.
 */
export function getTrustedSupabaseObjectPath(
  value: unknown,
  allowedBucket: PrivateDocumentBucket,
): string | null {
  return parseStoragePath(value, [allowedBucket], ["public", "sign"])?.objectPath ?? null;
}

/** Waliduje historyczny rekord przechowujący samą ścieżkę zamiast URL. */
export function getTrustedRelativeStorageObjectPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) return null;
  if (value.startsWith("/") || value.includes("\\") || /[?#\u0000-\u001f]/.test(value)) return null;
  if (value.includes("://") || value.toLowerCase().startsWith("javascript:")) return null;

  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return value;
}

export function getTrustedDocumentPreviewKind(value: string): DocumentPreviewKind {
  const url = parseHttpsUrl(value);
  if (!url) return "unsupported";
  const path = url.pathname.toLowerCase();
  if (/\.(?:png|jpe?g|gif|webp)$/.test(path)) return "image";
  if (/\.pdf$/.test(path)) return "pdf";
  return "unsupported";
}

/** Arkusze osadzamy wyłącznie z dokładnego originu i gałęzi /spreadsheets/. */
export function getTrustedGoogleSheetsEmbedUrl(value: unknown): string | null {
  const url = parseHttpsUrl(value);
  if (!url || url.origin !== "https://docs.google.com") return null;
  if (!url.pathname.startsWith("/spreadsheets/")) return null;

  url.hash = "";
  url.searchParams.set("rm", "minimal");
  return url.toString();
}

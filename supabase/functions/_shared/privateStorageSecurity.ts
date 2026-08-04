import { isUuid, SecurityError } from "./securityPrimitives.ts";

export const PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS = 300;
export const PRIVATE_STORAGE_MAX_BODY_BYTES = 2048;

const PRIVATE_BUCKETS = new Set([
  "documents",
  "workspace-files",
  "ticket-screenshots",
  "driver-documents",
  "document-attachments",
  "driver-invoices",
  "purchase-invoices",
  "verification-documents",
  "meeting-audio",
  "invoice-pdfs",
  "invoices",
  "workshop-order-photos",
]);

export interface PrivateStorageIdentity {
  userId: string;
  isAdmin: boolean;
  companyIds: string[];
  ownedCompanyIds: string[];
}

export interface PrivateStorageObject {
  id: string;
  bucket_id: string;
  object_path: string;
  tenant_id: string | null;
  owner_user_id: string | null;
  classification: string;
  status: string;
}

export function assertPrivateStorageRequestHeaders(
  contentType: string | null,
  declaredLength: string | null,
): void {
  if (!(contentType ?? "").toLowerCase().startsWith("application/json")) {
    throw new SecurityError(415, "unsupported_media_type", "Wymagany jest JSON");
  }

  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new SecurityError(400, "invalid_content_length", "Nieprawidłowy rozmiar żądania");
    }
    if (Number(declaredLength) > PRIVATE_STORAGE_MAX_BODY_BYTES) {
      throw new SecurityError(413, "payload_too_large", "Żądanie jest zbyt duże");
    }
  }
}

export async function readPrivateStorageRequestBody(req: Request): Promise<string> {
  assertPrivateStorageRequestHeaders(
    req.headers.get("content-type"),
    req.headers.get("content-length"),
  );

  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > PRIVATE_STORAGE_MAX_BODY_BYTES) {
        await reader.cancel("payload_too_large");
        throw new SecurityError(413, "payload_too_large", "Żądanie jest zbyt duże");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export function parsePrivateStorageObjectBody(
  rawBody: string,
  contentType: string | null,
  declaredLength: string | null,
): string {
  assertPrivateStorageRequestHeaders(contentType, declaredLength);

  if (new TextEncoder().encode(rawBody).byteLength > PRIVATE_STORAGE_MAX_BODY_BYTES) {
    throw new SecurityError(413, "payload_too_large", "Żądanie jest zbyt duże");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new SecurityError(400, "invalid_json", "Nieprawidłowy JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SecurityError(400, "invalid_request", "Nieprawidłowe żądanie");
  }

  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length !== 1 || entries[0][0] !== "object_id" || !isUuid(entries[0][1])) {
    throw new SecurityError(400, "invalid_object_id", "Nieprawidłowy identyfikator obiektu");
  }
  return entries[0][1];
}

export function canDownloadPrivateStorageObject(
  identity: PrivateStorageIdentity,
  object: PrivateStorageObject | null,
  hasExplicitAccess = false,
): boolean {
  if (!object || object.status !== "active" || !PRIVATE_BUCKETS.has(object.bucket_id)) {
    return false;
  }

  if (identity.isAdmin) return true;

  // `owner_user_id` jest bezpiecznym skrótem wyłącznie dla obiektu osobistego.
  // Uploader pliku tenantowego nie zachowuje dostępu po usunięciu z firmy.
  if (!object.tenant_id) return object.owner_user_id === identity.userId;
  if (!identity.companyIds.includes(object.tenant_id)) return false;

  if (object.classification === "private") {
    return identity.ownedCompanyIds.includes(object.tenant_id) || hasExplicitAccess;
  }
  if (object.classification === "confidential") {
    return identity.ownedCompanyIds.includes(object.tenant_id) || hasExplicitAccess;
  }
  if (object.classification === "restricted") {
    return hasExplicitAccess;
  }

  return false;
}

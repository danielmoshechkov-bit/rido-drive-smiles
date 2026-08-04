import {
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  requireUser,
  SecurityError,
  writeAuditEvent,
} from "../_shared/security.ts";
import {
  canDownloadPrivateStorageObject,
  parsePrivateStorageObjectBody,
  readPrivateStorageRequestBody,
  PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS,
} from "../_shared/privateStorageSecurity.ts";

async function readObjectId(req: Request): Promise<string> {
  const rawBody = await readPrivateStorageRequestBody(req);
  return parsePrivateStorageObjectBody(
    rawBody,
    req.headers.get("content-type"),
    req.headers.get("content-length"),
  );
}

async function enforceDownloadRateLimit(
  admin: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await admin.rpc("security_consume_rate_limit", {
    p_scope: "storage.private_download",
    p_subject_id: userId,
    p_limit: 60,
    p_window_seconds: 60,
  });
  if (error) {
    throw new SecurityError(503, "rate_limit_unavailable", "Nie można bezpiecznie obsłużyć żądania");
  }
  if (data !== true) {
    throw new SecurityError(429, "rate_limit_exceeded", "Przekroczono limit żądań");
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") {
      throw new SecurityError(405, "method_not_allowed", "Niedozwolona metoda");
    }

    const admin = createServiceClient();
    const identity = await requireUser(req, admin);
    await enforceDownloadRateLimit(admin, identity.userId);
    const objectId = await readObjectId(req);
    const { data: object, error } = await admin
      .from("private_storage_objects")
      .select("id, bucket_id, object_path, tenant_id, owner_user_id, resource_type, resource_id, classification, status")
      .eq("id", objectId)
      .maybeSingle();

    if (error) {
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        action: "storage.private_download_failed",
        resourceType: "private_storage_object",
        resourceId: objectId,
        result: "failed",
        correlationId: identity.correlationId,
        metadata: { stage: "metadata_lookup" },
      });
      throw new SecurityError(503, "storage_metadata_unavailable", "Nie można potwierdzić dostępu do pliku");
    }

    let hasExplicitAccess = false;
    if (object?.tenant_id && !identity.isAdmin) {
      const { data: aclRows, error: aclError } = await admin
        .from("private_storage_object_acl")
        .select("expires_at")
        .eq("object_id", object.id)
        .eq("grantee_user_id", identity.userId)
        .eq("permission", "download")
        .is("revoked_at", null)
        .limit(1);
      if (aclError) {
        await writeAuditEvent(admin, {
          actorId: identity.userId,
          tenantId: object.tenant_id,
          action: "storage.private_download_failed",
          resourceType: "private_storage_object",
          resourceId: objectId,
          result: "failed",
          correlationId: identity.correlationId,
          metadata: { stage: "acl_lookup", object_resource_type: object.resource_type },
        });
        throw new SecurityError(503, "storage_acl_unavailable", "Nie można potwierdzić dostępu do pliku");
      }
      hasExplicitAccess = (aclRows ?? []).some((row: { expires_at: string | null }) => {
        if (!row.expires_at) return true;
        const expiry = Date.parse(row.expires_at);
        return Number.isFinite(expiry) && expiry > Date.now();
      });
    }

    const isAllowed = canDownloadPrivateStorageObject(identity, object, hasExplicitAccess);

    if (!isAllowed) {
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        tenantId: object?.tenant_id ?? null,
        action: "storage.private_download_denied",
        resourceType: "private_storage_object",
        resourceId: objectId,
        result: "denied",
        correlationId: identity.correlationId,
        metadata: {
          reason: "not_found_or_forbidden",
          object_resource_type: object?.resource_type ?? null,
        },
      });
      // Jeden komunikat dla braku rekordu i obcego tenanta zapobiega oracle ID.
      throw new SecurityError(404, "object_not_found", "Plik nie istnieje lub nie masz do niego dostępu");
    }

    const { data: signed, error: signError } = await admin.storage
      .from(object.bucket_id)
      .createSignedUrl(object.object_path, PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) {
      await writeAuditEvent(admin, {
        actorId: identity.userId,
        tenantId: object.tenant_id,
        action: "storage.private_download_failed",
        resourceType: "private_storage_object",
        resourceId: object.id,
        result: "failed",
        correlationId: identity.correlationId,
        metadata: { stage: "signed_url", object_resource_type: object.resource_type },
      });
      throw new SecurityError(503, "signed_url_unavailable", "Nie można bezpiecznie udostępnić pliku");
    }

    await writeAuditEvent(admin, {
      actorId: identity.userId,
      tenantId: object.tenant_id,
      action: "storage.private_download_authorized",
      resourceType: "private_storage_object",
      resourceId: object.id,
      result: "succeeded",
      correlationId: identity.correlationId,
      metadata: {
        expires_in_seconds: PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS,
        object_resource_type: object.resource_type,
      },
    });

    return jsonResponse(req, 200, {
      signed_url: signed.signedUrl,
      expires_in: PRIVATE_STORAGE_SIGNED_URL_TTL_SECONDS,
      correlation_id: identity.correlationId,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});

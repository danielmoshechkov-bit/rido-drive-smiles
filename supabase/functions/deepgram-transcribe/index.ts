import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  SecurityError,
  createServiceClient,
  errorResponse,
  handleCors,
  jsonResponse,
  readJsonBody,
  requireUser,
  writeAuditEvent,
} from "../_shared/security.ts";
import { getSecret } from "../_shared/aiSecrets.ts";
import { consumeAiRateLimit } from "../_shared/aiSecurity.ts";

const AUDIO_PATH_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webm|mp3|mp4|m4a|wav|ogg)$/i;
const TRANSCRIPTION_USER_HOURLY_LIMIT = 10;
const TRANSCRIPTION_USER_DAILY_LIMIT = 30;
const TRANSCRIPTION_MEETING_DAILY_LIMIT = 3;
const TRANSCRIPTION_LEASE_SECONDS = 15 * 60;

interface TranscriptionClaim {
  actorId: string;
  meetingId: string;
  audioFingerprint: string;
  correlationId: string;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function finalizeTranscriptionJob(
  admin: ReturnType<typeof createServiceClient>,
  claim: TranscriptionClaim,
  succeeded: boolean,
  errorCode: string | null,
): Promise<void> {
  const { data, error } = await admin.rpc("phase_f_finalize_meeting_transcription", {
    p_actor_id: claim.actorId,
    p_meeting_id: claim.meetingId,
    p_audio_fingerprint: claim.audioFingerprint,
    p_correlation_id: claim.correlationId,
    p_succeeded: succeeded,
    p_error_code: errorCode,
  });
  if (error || data !== true) {
    throw new SecurityError(503, "transcription_finalize_failed", "Nie można bezpiecznie zakończyć transkrypcji");
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  if (req.method !== "POST") return jsonResponse(req, 405, { error: "method_not_allowed" });

  let admin: ReturnType<typeof createServiceClient> | null = null;
  let authorizedMeetingId: string | null = null;
  let authorizedAudioPath: string | null = null;
  let actorId: string | null = null;
  let correlationId = crypto.randomUUID();
  let transcriptionClaim: TranscriptionClaim | null = null;
  let transcriptionFinalized = false;

  try {
    admin = createServiceClient();
    const identity = await requireUser(req, admin);
    actorId = identity.userId;
    correlationId = identity.correlationId;
    const body = await readJsonBody(req, 4_096);
    const meetingId = typeof body?.meeting_id === "string" ? body.meeting_id : "";
    const audioPath = typeof body?.audio_path === "string" ? body.audio_path : "";
    if (!meetingId || !audioPath || !AUDIO_PATH_PATTERN.test(audioPath)) {
      throw new SecurityError(400, "invalid_recording_reference", "Nieprawidłowe wskazanie nagrania");
    }

    const { data: meeting, error: meetingError } = await admin.from("meetings")
      .select("id, user_id, audio_url, transcript, status, next_meeting_suggestion")
      .eq("id", meetingId)
      .eq("user_id", identity.userId)
      .maybeSingle();
    if (meetingError) {
      throw new SecurityError(503, "meeting_lookup_failed", "Nie można potwierdzić dostępu do spotkania");
    }
    if (!meeting) {
      throw new SecurityError(403, "meeting_access_denied", "Brak dostępu do spotkania");
    }

    const expectedPrefix = `${identity.userId}/${meeting.id}.`;
    if (!audioPath.startsWith(expectedPrefix) || meeting.audio_url !== audioPath) {
      throw new SecurityError(403, "recording_access_denied", "Brak dostępu do nagrania");
    }
    authorizedMeetingId = meeting.id;
    authorizedAudioPath = audioPath;

    if (typeof meeting.transcript === "string" && meeting.transcript.trim()) {
      return jsonResponse(req, 200, {
        success: true,
        meeting_id: meeting.id,
        transcript: meeting.transcript,
        reused: true,
      });
    }

    if (meeting.next_meeting_suggestion?.error === "no_speech") {
      return jsonResponse(req, 200, {
        error: "Nie wykryto mowy w nagraniu",
        reason: "no_speech",
        meeting_id: meeting.id,
        reused: true,
      });
    }

    await consumeAiRateLimit(admin, {
      scope: "ai.transcription.user.hourly",
      subjectId: identity.userId,
      limit: TRANSCRIPTION_USER_HOURLY_LIMIT,
      windowSeconds: 3_600,
    });
    await consumeAiRateLimit(admin, {
      scope: "ai.transcription.user.daily",
      subjectId: identity.userId,
      limit: TRANSCRIPTION_USER_DAILY_LIMIT,
      windowSeconds: 86_400,
    });
    await consumeAiRateLimit(admin, {
      scope: "ai.transcription.meeting.daily",
      subjectId: meeting.id,
      limit: TRANSCRIPTION_MEETING_DAILY_LIMIT,
      windowSeconds: 86_400,
    });

    const audioFingerprint = await sha256Hex(audioPath);
    const { data: claimResult, error: claimError } = await admin.rpc("phase_f_claim_meeting_transcription", {
      p_actor_id: identity.userId,
      p_meeting_id: meeting.id,
      p_audio_path: audioPath,
      p_audio_fingerprint: audioFingerprint,
      p_lease_seconds: TRANSCRIPTION_LEASE_SECONDS,
      p_correlation_id: correlationId,
    });
    if (claimError) {
      throw new SecurityError(503, "transcription_claim_unavailable", "Nie można bezpiecznie rozpocząć transkrypcji");
    }
    if (claimResult === "in_progress") {
      throw new SecurityError(409, "transcription_in_progress", "Transkrypcja tego nagrania już trwa");
    }
    if (claimResult === "succeeded") {
      throw new SecurityError(409, "transcription_already_processed", "Nagranie zostało już przetworzone");
    }
    if (claimResult !== "claimed") {
      throw new SecurityError(503, "transcription_claim_invalid", "Nie można bezpiecznie rozpocząć transkrypcji");
    }
    transcriptionClaim = {
      actorId: identity.userId,
      meetingId: meeting.id,
      audioFingerprint,
      correlationId,
    };

    await writeAuditEvent(admin, {
      actorId: identity.userId,
      action: "meeting.transcribe",
      resourceType: "meeting",
      resourceId: meeting.id,
      result: "attempted",
      correlationId,
    });

    const deepgramKey = await getSecret(admin, "DEEPGRAM_API_KEY");
    if (!deepgramKey) {
      throw new SecurityError(503, "transcription_not_configured", "Transkrypcja nie jest skonfigurowana");
    }

    const { data: signed, error: signError } = await admin.storage
      .from("meeting-audio")
      .createSignedUrl(audioPath, 600);
    if (signError || !signed?.signedUrl) {
      console.error("deepgram_signed_url_failed", { code: signError?.name ?? "unknown", correlation_id: correlationId });
      throw new SecurityError(502, "recording_unavailable", "Nie udało się przygotować nagrania");
    }

    const params = new URLSearchParams({
      model: "nova-2",
      language: "pl",
      diarize: "true",
      punctuate: "true",
      smart_format: "true",
    });
    let providerResponse: Response;
    try {
      providerResponse = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey.replace(/[^\x20-\x7E]/g, "")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: signed.signedUrl }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new SecurityError(504, "transcription_timeout", "Usługa transkrypcji nie odpowiedziała na czas");
    }
    if (!providerResponse.ok) {
      await providerResponse.text().catch(() => "");
      console.error("deepgram_provider_failed", { status: providerResponse.status, correlation_id: correlationId });
      await admin.from("meetings")
        .update({ status: "failed", next_meeting_suggestion: { error: "recording" } })
        .eq("id", authorizedMeetingId)
        .eq("user_id", identity.userId)
        .eq("audio_url", audioPath);
      await finalizeTranscriptionJob(admin, transcriptionClaim, false, "provider_failed");
      transcriptionFinalized = true;
      throw new SecurityError(502, "transcription_failed", "Nie udało się przetworzyć nagrania");
    }

    const providerData = await providerResponse.json();
    const alternative = providerData?.results?.channels?.[0]?.alternatives?.[0];
    const plainTranscript = typeof alternative?.transcript === "string" ? alternative.transcript : "";
    const utterances = buildUtterances(Array.isArray(alternative?.words) ? alternative.words : []);
    const formatted = utterances.length
      ? utterances.map((utterance) => `Mówca ${utterance.speaker + 1}: ${utterance.text}`).join("\n\n")
      : plainTranscript;

    if (!formatted.trim()) {
      const { data: noSpeechMeeting, error: noSpeechUpdateError } = await admin.from("meetings").update({
        status: "failed",
        transcript: "",
        next_meeting_suggestion: { error: "no_speech" },
      })
        .eq("id", authorizedMeetingId)
        .eq("user_id", identity.userId)
        .eq("audio_url", audioPath)
        .select("id")
        .maybeSingle();
      if (noSpeechUpdateError || !noSpeechMeeting) {
        throw new SecurityError(409, "recording_changed", "Nagranie zmieniło się podczas transkrypcji");
      }
      await finalizeTranscriptionJob(admin, transcriptionClaim, true, "no_speech");
      transcriptionFinalized = true;
      return jsonResponse(req, 200, {
        error: "Nie wykryto mowy w nagraniu",
        reason: "no_speech",
        meeting_id: authorizedMeetingId,
      });
    }

    const { data: updatedMeeting, error: updateError } = await admin.from("meetings").update({
      transcript: formatted,
      status: "processing",
    })
      .eq("id", authorizedMeetingId)
      .eq("user_id", identity.userId)
      .eq("audio_url", audioPath)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedMeeting) {
      throw new SecurityError(503, "meeting_update_failed", "Nie udało się zapisać transkrypcji");
    }
    await finalizeTranscriptionJob(admin, transcriptionClaim, true, null);
    transcriptionFinalized = true;

    await writeAuditEvent(admin, {
      actorId: identity.userId,
      action: "meeting.transcribe",
      resourceType: "meeting",
      resourceId: authorizedMeetingId,
      result: "succeeded",
      correlationId,
      metadata: { utterances_count: utterances.length },
    });

    return jsonResponse(req, 200, {
      success: true,
      meeting_id: authorizedMeetingId,
      transcript: formatted,
      utterances,
    });
  } catch (error) {
    if (admin && transcriptionClaim && !transcriptionFinalized) {
      const safeErrorCode = error instanceof SecurityError ? error.code : "internal_error";
      await finalizeTranscriptionJob(admin, transcriptionClaim, false, safeErrorCode)
        .then(() => undefined, () => undefined);
    }
    if (admin && authorizedMeetingId && authorizedAudioPath && actorId && !(error instanceof SecurityError && error.status < 500)) {
      await admin.from("meetings")
        .update({ status: "failed", next_meeting_suggestion: { error: "recording" } })
        .eq("id", authorizedMeetingId)
        .eq("user_id", actorId)
        .eq("audio_url", authorizedAudioPath)
        .then(() => undefined, () => undefined);
    }
    return errorResponse(req, error);
  }
});

function buildUtterances(
  words: any[],
): { speaker: number; text: string; start: number; end: number }[] {
  const output: { speaker: number; text: string; start: number; end: number }[] = [];
  for (const word of words) {
    const speaker = typeof word?.speaker === "number" ? word.speaker : 0;
    const token = typeof word?.punctuated_word === "string"
      ? word.punctuated_word
      : typeof word?.word === "string"
      ? word.word
      : "";
    if (!token) continue;
    const last = output[output.length - 1];
    if (last && last.speaker === speaker) {
      last.text += ` ${token}`;
      last.end = typeof word.end === "number" ? word.end : last.end;
    } else {
      output.push({
        speaker,
        text: token,
        start: typeof word.start === "number" ? word.start : 0,
        end: typeof word.end === "number" ? word.end : 0,
      });
    }
  }
  return output;
}

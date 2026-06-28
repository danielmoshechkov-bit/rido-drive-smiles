// =====================================================================
// rental-availability — dostępność przedmiotu wynajmu (overlap)
// Dokument: docs/wynajem-mvp-projekt.md (pkt 2.4)
//
// Uogólnienie idei booking-available-slots na DOWOLNY subject (nie
// service_provider). Liczy WOLNE INTERWAŁY metodą odejmowania zakresów
// zajętych od zapytanego okna [range_start, range_end].
//
// Zajętość = rezerwacje danego subjectu w statusach 'confirmed' / 'in_progress'
// (pkt 2.3) + pełna blokada gdy subject.status = 'maintenance'/'retired'.
//
// Zakres tej paczki: TYLKO wewnętrzny overlap. Google Calendar / FreeBusy
// (pkt 2.5) = późniejsza paczka — tu NIE pobieramy zajętości z Google.
//
// Autoryzacja: respektujemy RLS — klient tworzony z nagłówkiem Authorization
// wywołującego (operator widzi tylko swoje subjecty). verify_jwt=false.
//
// Wejście (POST JSON): { subject_id, range_start, range_end }  (ISO 8601)
// Wyjście: { subject_id, available, subject_status, busy: [...], free: [...] }
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

interface Interval {
  start: number; // epoch ms
  end: number;
}

// Scala nakładające się / stykające zakresy zajętości.
function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

// Odejmuje zajęte zakresy od okna -> wolne interwały.
function freeWindows(windowStart: number, windowEnd: number, busy: Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = windowStart;
  for (const b of busy) {
    const bStart = Math.max(b.start, windowStart);
    const bEnd = Math.min(b.end, windowEnd);
    if (bEnd <= windowStart || bStart >= windowEnd) continue; // poza oknem
    if (bStart > cursor) free.push({ start: cursor, end: bStart });
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });
  return free;
}

const iso = (ms: number) => new Date(ms).toISOString();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const subjectId: string | undefined = body.subject_id;
    const rangeStartStr: string | undefined = body.range_start;
    const rangeEndStr: string | undefined = body.range_end;

    if (!subjectId || !rangeStartStr || !rangeEndStr) {
      return new Response(
        JSON.stringify({ error: "Wymagane pola: subject_id, range_start, range_end (ISO 8601)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const windowStart = Date.parse(rangeStartStr);
    const windowEnd = Date.parse(rangeEndStr);
    if (Number.isNaN(windowStart) || Number.isNaN(windowEnd) || windowEnd <= windowStart) {
      return new Response(
        JSON.stringify({ error: "Nieprawidłowy zakres: range_end musi być po range_start." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Klient z tokenem wywołującego -> RLS obowiązuje (operator widzi swoje subjecty).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Status subjectu — maintenance/retired = brak dostępności w całym oknie.
    const { data: subject, error: subjErr } = await supabase
      .from("rental_subjects")
      .select("id, status")
      .eq("id", subjectId)
      .single();

    if (subjErr || !subject) {
      return new Response(
        JSON.stringify({ error: "Subject nie znaleziony lub brak dostępu (RLS)." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (subject.status !== "available") {
      return new Response(
        JSON.stringify({
          subject_id: subjectId,
          subject_status: subject.status,
          available: false,
          busy: [{ start: iso(windowStart), end: iso(windowEnd), reason: subject.status }],
          free: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Rezerwacje blokujące w oknie: confirmed / in_progress, nakładające się na okno.
    const { data: rows, error: bookErr } = await supabase
      .from("bookings")
      .select("id, period_start, period_end, status")
      .eq("subject_id", subjectId)
      .in("status", ["confirmed", "in_progress"])
      .lt("period_start", iso(windowEnd))
      .gt("period_end", iso(windowStart));

    if (bookErr) {
      return new Response(
        JSON.stringify({ error: bookErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const busyRaw: Interval[] = (rows ?? []).map((r) => ({
      start: Date.parse(r.period_start as string),
      end: Date.parse(r.period_end as string),
    }));
    const busy = mergeIntervals(busyRaw);
    const free = freeWindows(windowStart, windowEnd, busy);

    return new Response(
      JSON.stringify({
        subject_id: subjectId,
        subject_status: subject.status,
        available: free.length > 0,
        busy: busy.map((b) => ({ start: iso(b.start), end: iso(b.end) })),
        free: free.map((f) => ({ start: iso(f.start), end: iso(f.end) })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[rental-availability-fatal]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

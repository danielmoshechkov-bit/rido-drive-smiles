import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const norm9 = (p: string | null | undefined) =>
  (p || "").replace(/\D/g, "").slice(-9);
const up = (s: string | null | undefined) => (s || "").trim().toUpperCase();

interface Body {
  // Branch A: confirm an ownership request created from a workshop order.
  request_id?: string;
  plate?: string;
  vin?: string;
  make?: string;
  model?: string;
  // Branch B: verify a manually-added vehicle by VIN against workshop records.
  verify_vehicle_id?: string;
}

serve(async (req: Request): Promise<Response> => {
  return phaseABlockedResponse(req, "client-verify-vehicle-ownership");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const body: Body = await req.json();
    const admin = createClient(url, serviceKey);

    if (body.verify_vehicle_id) {
      return await handleManualVinClaim(admin, user, body.verify_vehicle_id);
    }
    if (body.request_id) {
      return await handleRequestConfirm(admin, user, body);
    }
    return json({ error: "missing_request_id_or_vehicle_id" }, 400);
  } catch (e: any) {
    console.error("client-verify-vehicle-ownership error", e);
    return json({ error: e.message || "internal_error" }, 500);
  }
});

// ---- Branch A: confirm an ownership request from a workshop order --------
async function handleRequestConfirm(admin: any, user: any, body: Body): Promise<Response> {
  const callerPhone = norm9((user.user_metadata as any)?.phone || user.phone);
  if (!callerPhone) return json({ error: "no_phone_on_account" }, 400);

  const { data: reqRow, error: reqErr } = await admin
    .from("client_vehicle_ownership_requests")
    .select("*")
    .eq("id", body.request_id)
    .maybeSingle();
  if (reqErr || !reqRow) return json({ error: "request_not_found" }, 404);
  if (norm9(reqRow.phone) !== callerPhone) return json({ error: "forbidden" }, 403);
  if (reqRow.status !== "pending") return json({ error: "request_not_pending" }, 409);

  const plate = up(reqRow.plate_number);
  const vinOnFile = up(reqRow.vin);
  const contested = await findContested(admin, user.id, plate, vinOnFile);
  const isSale = contested.length > 0;

  const submittedVin = up(body.vin);
  if (isSale) {
    if (!vinOnFile) return json({ needsManual: true, reason: "no_vin_on_file" }, 200);
    if (submittedVin !== vinOnFile) return json({ error: "vin_mismatch" }, 200);
  } else {
    const matches = [
      up(body.plate) === plate,
      submittedVin === vinOnFile,
      up(body.make) === up(reqRow.make),
      up(body.model) === up(reqRow.model),
    ].filter(Boolean).length;
    if (matches < 3) return json({ error: "mismatch" }, 200);
  }

  const { data: newVehicle, error: insErr } = await admin
    .from("client_vehicles")
    .insert({
      user_id: user.id,
      plate_number: reqRow.plate_number,
      vin: reqRow.vin,
      make: reqRow.make,
      model: reqRow.model,
      year: reqRow.year,
      engine_capacity: reqRow.engine_capacity,
      workshop_vehicle_id: reqRow.workshop_vehicle_id,
      is_verified: true,
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insErr) {
    console.error("insert client_vehicle error", insErr);
    return json({ error: "insert_failed" }, 500);
  }

  await admin
    .from("client_vehicle_ownership_requests")
    .update({ status: "verified", verified_by_user_id: user.id, verified_at: new Date().toISOString() })
    .eq("id", reqRow.id);

  const notified = isSale
    ? await runTransfer(admin, contested, vehicleLabel(reqRow.make, reqRow.model, reqRow.plate_number))
    : 0;

  return json({ success: true, vehicle_id: newVehicle.id, transferred: isSale, old_owners_notified: notified }, 200);
}

// ---- Branch B: verify a manually-added vehicle by its VIN ----------------
async function handleManualVinClaim(admin: any, user: any, vehicleId: string): Promise<Response> {
  const { data: cv, error: cvErr } = await admin
    .from("client_vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();
  if (cvErr || !cv) return json({ error: "vehicle_not_found" }, 404);
  if (cv.user_id !== user.id) return json({ error: "forbidden" }, 403);
  if (cv.is_verified) return json({ success: true, verified: true, already: true }, 200);

  const vin = up(cv.vin);
  const plate = up(cv.plate_number);
  if (!vin) return json({ success: true, verified: false, reason: "no_vin" }, 200);

  // VIN must be known to a workshop in the system — that is the proof that
  // the car was actually serviced here (a random VIN won't match anything).
  const { data: wv } = await admin
    .from("workshop_vehicles")
    .select("id, vin")
    .limit(2000);
  const match = (wv || []).find((w: any) => up(w.vin) === vin);
  if (!match) return json({ success: true, verified: false, reason: "no_workshop_record" }, 200);

  const contested = await findContested(admin, user.id, plate, vin);
  const isSale = contested.length > 0;

  const { error: updErr } = await admin
    .from("client_vehicles")
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
      workshop_vehicle_id: cv.workshop_vehicle_id || match.id,
    })
    .eq("id", cv.id);
  if (updErr) {
    console.error("verify update error", updErr);
    return json({ error: "update_failed" }, 500);
  }

  const notified = isSale
    ? await runTransfer(admin, contested, vehicleLabel(cv.make, cv.model, cv.plate_number))
    : 0;

  return json({ success: true, verified: true, transferred: isSale, old_owners_notified: notified }, 200);
}

// ---- Shared helpers ------------------------------------------------------
async function findContested(admin: any, callerUserId: string, plate: string, vin: string) {
  const { data: existing } = await admin
    .from("client_vehicles")
    .select("id, user_id, plate_number, vin, is_sold, is_verified")
    .eq("is_verified", true)
    .or("is_sold.is.null,is_sold.eq.false");
  return (existing || []).filter((cv: any) => {
    if (cv.user_id === callerUserId) return false;
    const samePlate = plate && up(cv.plate_number) === plate;
    const sameVin = vin && up(cv.vin) === vin;
    return samePlate || sameVin;
  });
}

async function runTransfer(admin: any, contested: any[], vehicleName: string): Promise<number> {
  const ids = contested.map((r) => r.id);
  await admin
    .from("client_vehicles")
    .update({ is_sold: true, sold_at: new Date().toISOString() })
    .in("id", ids);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resend = resendKey ? new Resend(resendKey) : null;
  const seen = new Set<string>();
  let notified = 0;
  for (const row of contested) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    try {
      const { data: ou } = await admin.auth.admin.getUserById(row.user_id);
      const email = ou?.user?.email;
      if (email && resend) {
        await resend.emails.send({
          from: "RIDO <no-reply@getrido.pl>",
          to: [email],
          subject: "Zmiana właściciela pojazdu — GetRido",
          html: ownerChangeEmail(vehicleName),
        });
        notified++;
      }
    } catch (e) {
      console.error("notify old owner failed", row.user_id, e);
    }
  }
  return notified;
}

function vehicleLabel(make: any, model: any, plate: any): string {
  return [make, model, plate].filter(Boolean).join(" ");
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function ownerChangeEmail(vehicleName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin: 0;">get RIDO</h1>
      </div>
      <h2 style="color: #333;">Zmiana właściciela pojazdu</h2>
      <p>Cześć,</p>
      <p>Pojazd <strong>${vehicleName}</strong> został przypisany do nowego właściciela
         w systemie GetRido (potwierdzono numerem VIN).</p>
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;">Pojazd oznaczyliśmy w Twoim koncie jako <strong>sprzedany</strong>.
           Twoja dotychczasowa <strong>historia napraw pozostaje dostępna</strong> w Twoim panelu —
           nic nie tracisz.</p>
      </div>
      <p>Jeśli to pomyłka i nie sprzedałeś tego pojazdu, skontaktuj się z nami niezwłocznie.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="https://getrido.pl/cp" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Otwórz panel</a>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <p style="color: #999; font-size: 12px; text-align: center;">© get RIDO. Wszelkie prawa zastrzeżone.</p>
    </div>
  `;
}

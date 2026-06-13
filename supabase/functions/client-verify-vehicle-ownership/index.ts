import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const norm9 = (p: string | null | undefined) =>
  (p || "").replace(/\D/g, "").slice(-9);
const up = (s: string | null | undefined) => (s || "").trim().toUpperCase();

interface Body {
  request_id: string;
  plate?: string;
  vin?: string;
  make?: string;
  model?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller from their bearer token.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "unauthorized" }, 401);
    }

    const body: Body = await req.json();
    if (!body.request_id) return json({ error: "missing request_id" }, 400);

    const callerPhone = norm9(
      (user.user_metadata as any)?.phone || (user as any).phone,
    );
    if (!callerPhone) return json({ error: "no_phone_on_account" }, 400);

    const admin = createClient(url, serviceKey);

    // Load the ownership request.
    const { data: reqRow, error: reqErr } = await admin
      .from("client_vehicle_ownership_requests")
      .select("*")
      .eq("id", body.request_id)
      .maybeSingle();
    if (reqErr || !reqRow) return json({ error: "request_not_found" }, 404);

    // The request must belong to the caller's phone.
    if (norm9(reqRow.phone) !== callerPhone) {
      return json({ error: "forbidden" }, 403);
    }
    if (reqRow.status !== "pending") {
      return json({ error: "request_not_pending" }, 409);
    }

    const plate = up(reqRow.plate_number);
    const vinOnFile = up(reqRow.vin);

    // Is this plate/VIN already owned (verified, not sold) by SOMEONE ELSE?
    // That signals a sale -> we require a VIN match before transferring.
    const { data: existing } = await admin
      .from("client_vehicles")
      .select("id, user_id, plate_number, vin, is_sold, is_verified")
      .eq("is_verified", true)
      .or(`is_sold.is.null,is_sold.eq.false`);

    const contestedRows = (existing || []).filter((cv: any) => {
      if (cv.user_id === user.id) return false;
      const samePlate = plate && up(cv.plate_number) === plate;
      const sameVin = vinOnFile && up(cv.vin) === vinOnFile;
      return samePlate || sameVin;
    });
    const isSale = contestedRows.length > 0;

    // ---- Verification rules -------------------------------------------
    const submittedVin = up(body.vin);
    if (isSale) {
      // Owner change: VIN is the strong key. Require it.
      if (!vinOnFile) {
        return json({ needsManual: true, reason: "no_vin_on_file" }, 200);
      }
      if (submittedVin !== vinOnFile) {
        return json({ error: "vin_mismatch" }, 200);
      }
    } else {
      // First claim: at least 3 of plate/vin/make/model must match.
      const matches = [
        up(body.plate) === plate,
        submittedVin === vinOnFile,
        up(body.make) === up(reqRow.make),
        up(body.model) === up(reqRow.model),
      ].filter(Boolean).length;
      if (matches < 3) return json({ error: "mismatch" }, 200);
    }

    // ---- Create the verified vehicle (backfill trigger pulls history) --
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
      .update({
        status: "verified",
        verified_by_user_id: user.id,
        verified_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id);

    // ---- Sale transfer: mark old owners' copies as sold + email them ---
    let oldOwnersNotified = 0;
    if (isSale) {
      const oldIds = contestedRows.map((r: any) => r.id);
      await admin
        .from("client_vehicles")
        .update({ is_sold: true, sold_at: new Date().toISOString() })
        .in("id", oldIds);

      const vehicleName = [reqRow.make, reqRow.model, reqRow.plate_number]
        .filter(Boolean).join(" ");
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const resend = resendKey ? new Resend(resendKey) : null;
      const seen = new Set<string>();

      for (const row of contestedRows) {
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
            oldOwnersNotified++;
          }
        } catch (e) {
          console.error("notify old owner failed", row.user_id, e);
        }
      }
    }

    return json({
      success: true,
      vehicle_id: newVehicle.id,
      transferred: isSale,
      old_owners_notified: oldOwnersNotified,
    }, 200);
  } catch (e: any) {
    console.error("client-verify-vehicle-ownership error", e);
    return json({ error: e.message || "internal_error" }, 500);
  }
});

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

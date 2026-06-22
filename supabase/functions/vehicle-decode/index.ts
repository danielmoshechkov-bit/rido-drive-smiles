// Decoder nr rej (RegCheck Poland) z rozliczeniem 5 kredytów z user_credits (creditGate/ai_pricing).
// Reużywa integracji portal_integrations (regcheck_poland). Mapuje vehicleJson z tolerancją braków.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAndDeductCredits, refundCredits } from "../_shared/creditGate.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const FUEL_MAP: Record<string, string> = {
  petrol: "benzyna", gasoline: "benzyna", diesel: "diesel",
  electric: "elektryczny", hybrid: "hybryda", lpg: "lpg",
};
function mapFuel(v: string): string | undefined {
  if (!v) return undefined;
  const k = v.toLowerCase();
  for (const key in FUEL_MAP) if (k.includes(key)) return FUEL_MAP[key];
  return undefined;
}
function num(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { registrationNumber } = await req.json();
    if (!registrationNumber) return new Response(JSON.stringify({ error: "Brak numeru rejestracyjnego" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE);

    // auth z JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    // 5 kredytów z user_credits (ai_pricing: vehicle_lookup)
    const gate = await checkAndDeductCredits(admin, user.id, "vehicle_lookup", { modelUsed: "regcheck", querySummary: registrationNumber });
    if (!gate.allowed) return new Response(JSON.stringify({ error: "insufficient_credits", reason: gate.reason, balance: gate.balance, cost: gate.cost }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });

    try {
      const { data: integ } = await admin.from("portal_integrations").select("*").eq("key", "regcheck_poland").single();
      if (!integ || integ.is_enabled === false) throw new Error("INTEGRATION_DISABLED");
      const cfg = integ.config_json || {};
      const username = cfg.username || "";
      const endpoint = cfg.endpoint_url || "https://www.regcheck.org.uk/api/reg.asmx/CheckPoland";
      if (!username) throw new Error("NO_USERNAME");

      const url = `${endpoint}?RegistrationNumber=${encodeURIComponent(registrationNumber.trim().toUpperCase())}&username=${encodeURIComponent(username)}`;
      const resp = await fetch(url);
      const xml = await resp.text();
      const m = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/);
      const vj = m ? JSON.parse(m[1]) : null;

      const make = vj?.CarMake?.CurrentTextValue || vj?.MakeDescription?.CurrentTextValue;
      const model = vj?.CarModel?.CurrentTextValue || vj?.ModelDescription?.CurrentTextValue;
      if (!vj || (!make && !model && !vj?.VehicleIdentificationNumber)) {
        await refundCredits(admin, user.id, gate.cost); // brak danych → zwrot
        return new Response(JSON.stringify({ error: "NOT_FOUND", message: "Nie odnaleziono danych dla podanego numeru rejestracyjnego" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const mapped = {
        brand: make || undefined,
        model: model || undefined,
        year: num(vj.RegistrationYear) || num(vj.ManufacturingYear),
        vin: vj.VehicleIdentificationNumber || undefined,
        engineCapacity: num(vj.EngineSize),
        power: num(vj.Power),
        fuelType: mapFuel(vj.FuelType || ""),
        odometer: num(vj.Mileage),
        firstRegistrationDate: vj.RegistrationDate || undefined,
      };

      return new Response(JSON.stringify({ data: mapped, balance_after: gate.balance_after, cost: gate.cost }), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      await refundCredits(admin, user.id, gate.cost); // błąd integracji → zwrot
      const msg = (e as any)?.message || "Błąd integracji";
      const code = msg === "INTEGRATION_DISABLED" || msg === "NO_USERNAME" ? 400 : 502;
      return new Response(JSON.stringify({ error: msg, message: "Błąd połączenia z bazą pojazdów" }), { status: code, headers: { ...cors, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as any)?.message || "Błąd serwera" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

// Unified employee-notification dispatcher.
// Events: 'assigned' | 'quote_accepted' | 'department_changed' | 'repair_addon_request' | 'order_ready'
// Body: { order_id, event, employee_user_id?, station_id?, status_name? }
// Resolves target employees, inserts workspace_notifications + workshop_employee_notifications,
// and fires workshop-send-sms for each phone.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Event = 'assigned' | 'quote_accepted' | 'department_changed' | 'repair_addon_request' | 'order_ready';

function buildMessage(event: Event, orderNumber: string, statusName?: string, vehicleStr?: string, link?: string): { title: string; body: string; sms: string } {
  const veh = vehicleStr ? ` ${vehicleStr}` : '';
  const lnk = link ? ` ${link}` : '';
  switch (event) {
    case 'assigned':
      return {
        title: 'Nowe zlecenie warsztatowe',
        body: `Otrzymujesz zlecenie ${orderNumber}${veh ? ' —' + veh : ''}.`,
        sms: `GetRido: Nowe zlecenie ${orderNumber}${veh}.${lnk}`,
      };
    case 'quote_accepted':
      return {
        title: 'Klient zaakceptował wycenę',
        body: `Zlecenie ${orderNumber} — możesz rozpocząć naprawę.`,
        sms: `GetRido: Klient zaakceptowal wycene ${orderNumber}${veh}. Mozna rozpoczac naprawe.${lnk}`,
      };
    case 'department_changed':
      return {
        title: `Zlecenie na stanowisku ${statusName || ''}`.trim(),
        body: `Zlecenie ${orderNumber} przekazane do działu ${statusName || ''}.`,
        sms: `GetRido: Zlecenie ${orderNumber}${veh} trafilo do dzialu ${statusName || ''}.${lnk}`,
      };
    case 'repair_addon_request':
      return {
        title: 'Dodatek do naprawy — do akceptacji',
        body: `Mechanik zgłosił dodatkowe prace do zlecenia ${orderNumber}.`,
        sms: `GetRido: Dodatek do naprawy w zleceniu ${orderNumber}${veh} — wycen i wyslij do klienta.${lnk}`,
      };
    case 'order_ready':
      return {
        title: 'Naprawa zakończona',
        body: `Mechanik zakończył naprawę zlecenia ${orderNumber}.`,
        sms: `GetRido: Naprawa zlecenia ${orderNumber}${veh} zakonczona.${lnk}`,
      };
  }
}

serve(async (req) => {
  return phaseABlockedResponse(req, "workshop-notify-employee");

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { order_id, event, employee_user_id, station_id, status_name, client_code } = await req.json();
    if (!order_id || !event) {
      return new Response(JSON.stringify({ error: "Missing order_id or event" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: order } = await admin.from("workshop_orders")
      .select("id, order_number, provider_id, status_name, client_code, vehicle:workshop_vehicles(brand, model, license_plate)")
      .eq("id", order_id).maybeSingle();
    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Authorization (SECFIX ETAP 3) ──────────────────────────────────
    // Wcześniej: dowolny order_id z gołego body → spam SMS/powiadomień do
    // pracowników na koszt warsztatu (order_id wyciekały z dziury RLS #1).
    // Teraz: albo wołanie WEWNĘTRZNE (service-role), albo ZALOGOWANY właściciel/
    // aktywny pracownik providera zlecenia, albo ANONIMOWY klient z poprawnym
    // client_code TEGO zlecenia (tylko event 'quote_accepted' z karty klienta).
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isInternal = serviceKey.length > 0 && bearer === serviceKey;

    if (!isInternal) {
      let authorized = false;
      if (authHeader) {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
        const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", anonKey ?? "", {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (user) {
          const { data: owner } = await admin.from("service_providers")
            .select("id").eq("id", order.provider_id).eq("user_id", user.id).maybeSingle();
          if (owner) authorized = true;
          else {
            const { data: worker } = await admin.from("workshop_employees")
              .select("id").eq("provider_id", order.provider_id).eq("user_id", user.id)
              .eq("is_active", true).eq("status", "active").maybeSingle();
            if (worker) authorized = true;
          }
        }
      }
      // Ścieżka anonimowego klienta: poprawny sekret (client_code) tego zlecenia
      // + wyłącznie event wyzwalany z karty klienta.
      if (!authorized && event === "quote_accepted" && typeof client_code === "string") {
        const code = client_code.trim();
        if (code.length >= 4 && order.client_code && code === order.client_code) authorized = true;
      }
      if (!authorized) {
        return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // ── koniec Authorization ───────────────────────────────────────────
    const v: any = (order as any).vehicle;
    const vehicleStr = v ? [v.brand, v.model, v.license_plate].filter(Boolean).join(' ') : '';
    const appOrigin = Deno.env.get("APP_ORIGIN") || "https://getrido.pl";
    const link = `${appOrigin}/pracownik-warsztat?order=${order_id}`;

    // Resolve targets
    const userIds = new Set<string>();
    if (employee_user_id) userIds.add(employee_user_id);

    if (event === 'department_changed' || event === 'quote_accepted') {
      // notify all assigned employees
      const { data: assigns } = await admin.from("workshop_order_assignments")
        .select("employee_user_id").eq("order_id", order_id);
      (assigns || []).forEach((a: any) => a.employee_user_id && userIds.add(a.employee_user_id));
    }

    if (event === 'department_changed') {
      // Find station by name (status_name) and add its employees
      const stationName = status_name || order.status_name;
      if (stationName) {
        const { data: st } = await admin.from("workshop_stations")
          .select("id").eq("provider_id", order.provider_id).eq("name", stationName).maybeSingle();
        const sid = station_id || st?.id;
        if (sid) {
          const { data: members } = await admin.from("workshop_station_employees")
            .select("employee_user_id").eq("station_id", sid);
          (members || []).forEach((m: any) => m.employee_user_id && userIds.add(m.employee_user_id));
        }
      }
    }

    if (event === 'repair_addon_request' || event === 'order_ready') {
      // notify provider owner (admin)
      const { data: prov } = await admin.from("service_providers")
        .select("user_id").eq("id", order.provider_id).maybeSingle();
      if (prov?.user_id) userIds.add(prov.user_id);
    }

    if (userIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0, reason: 'no_targets' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msg = buildMessage(event, order.order_number || order_id.slice(0, 8), status_name, vehicleStr, link);

    // Fetch phone numbers for SMS
    const { data: emps } = await admin.from("workshop_employees")
      .select("user_id, phone, name")
      .in("user_id", Array.from(userIds));
    const phoneByUser = new Map<string, string>();
    (emps || []).forEach((e: any) => { if (e.user_id && e.phone) phoneByUser.set(e.user_id, e.phone); });

    // Insert in-app notifications
    const notifRows = Array.from(userIds).map(uid => ({
      user_id: uid,
      title: msg.title,
      body: msg.body,
      type: `workshop_${event}`,
      link: `/pracownik-warsztat?order=${order_id}`,
    }));
    await admin.from("workspace_notifications").insert(notifRows);

    // Also record in workshop_employee_notifications
    const wNotifRows = Array.from(userIds).map(uid => ({
      employee_user_id: uid,
      order_id,
      provider_id: order.provider_id,
      title: msg.title,
      body: msg.body,
      type: `workshop_${event}`,
      link: `/pracownik-warsztat?order=${order_id}`,
    }));
    await admin.from("workshop_employee_notifications").insert(wNotifRows);

    // Fire SMS (best-effort) — only to those with phone
    const smsResults: any[] = [];
    for (const uid of userIds) {
      const phone = phoneByUser.get(uid);
      if (!phone) continue;
      try {
        const { error } = await admin.functions.invoke("workshop-send-sms", {
          body: {
            phone, message: msg.sms, order_id,
            provider_id: order.provider_id,
            sms_type: `employee_${event}`,
          },
        });
        smsResults.push({ user_id: uid, ok: !error, error: error?.message });
      } catch (e: any) {
        smsResults.push({ user_id: uid, ok: false, error: e.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, notified: userIds.size, sms: smsResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[workshop-notify-employee] error", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

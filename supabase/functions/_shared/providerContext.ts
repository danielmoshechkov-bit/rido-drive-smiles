// ============================================================================
// providerContext — JEDNO źródło danych o firmie dla agentów AI.
// Dane firmy, godziny pracy i CENNIK agent bierze na żywo z karty usługodawcy
// („Moje usługi" → provider_services), a nie z kopii wklejonej w konfiguracji
// agenta. Zmiana ceny w panelu = agent od razu podaje nową cenę.
// ============================================================================

export interface ProviderContext {
  company_name: string;
  description: string;
  location: string;
  phone: string;
  hours: string;
  /** Lista usług z cenami, gotowa do wstawienia w prompt. */
  services: string;
  has_services: boolean;
}

const DAY_LABELS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // pon → nd
const hhmm = (t: unknown) => String(t ?? "").slice(0, 5);

function formatHours(rows: any[]): string {
  if (!rows?.length) return "";
  const byDay = new Map<number, any>();
  for (const r of rows) byDay.set(Number(r.day_of_week), r);
  const parts: string[] = [];
  for (const day of DAY_ORDER) {
    const h = byDay.get(day);
    if (!h) continue;
    const working = h.is_working !== false && h.is_open !== false && h.is_closed !== true;
    parts.push(working ? `${DAY_LABELS[day]} ${hhmm(h.start_time ?? h.open_time)}–${hhmm(h.end_time ?? h.close_time)}` : `${DAY_LABELS[day]} nieczynne`);
  }
  return parts.join(", ");
}

function formatPrice(s: any): string {
  const from = Number(s.price_from) || 0;
  const to = Number(s.price_to) || 0;
  if (from && to && to > from) return `od ${from} do ${to} zł`;
  if (from) return `od ${from} zł`;
  if (to) return `do ${to} zł`;
  return "cena po wycenie";
}

export async function loadProviderContext(admin: any, providerId: string): Promise<ProviderContext | null> {
  if (!providerId) return null;

  const [{ data: provider }, { data: services }, { data: swh }] = await Promise.all([
    admin.from("service_providers")
      .select("company_name, description, company_address, company_city, company_phone, user_id")
      .eq("id", providerId).maybeSingle(),
    admin.from("provider_services")
      .select("name, category, short_description, price_from, price_to, duration_minutes")
      .eq("provider_id", providerId).eq("is_active", true)
      .order("category", { ascending: true }).order("name", { ascending: true }),
    admin.from("service_working_hours")
      .select("day_of_week, start_time, end_time, is_working")
      .eq("provider_id", providerId).is("employee_id", null),
  ]);

  if (!provider) return null;

  let hours = formatHours(swh || []);
  if (!hours && provider.user_id) {
    // Fallback: godziny z ustawień warsztatu ([Pon…Nd] {open, from, to})
    const { data: ws } = await admin.from("workshop_settings")
      .select("working_hours").eq("user_id", provider.user_id).maybeSingle();
    if (Array.isArray(ws?.working_hours)) {
      hours = formatHours(ws.working_hours.map((d: any, idx: number) => ({
        day_of_week: idx === 6 ? 0 : idx + 1,
        start_time: (d?.from || "09:00") + ":00",
        end_time: (d?.to || "17:00") + ":00",
        is_working: !!d?.open,
      })));
    }
  }

  const list = (services || []).map((s: any) => {
    const bits = [`- ${s.name}: ${formatPrice(s)}`];
    if (s.duration_minutes) bits.push(`czas ok. ${s.duration_minutes} min`);
    if (s.short_description) bits.push(String(s.short_description));
    return bits.join(" · ");
  });

  return {
    company_name: provider.company_name || "",
    description: provider.description || "",
    location: [provider.company_address, provider.company_city].filter(Boolean).join(", "),
    phone: provider.company_phone || "",
    hours,
    services: list.join("\n"),
    has_services: list.length > 0,
  };
}

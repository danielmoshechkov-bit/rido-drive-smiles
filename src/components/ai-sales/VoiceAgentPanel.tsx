// ============================================================================
// VoiceAgentPanel — USTAWIENIA ASYSTENTA GŁOSOWEGO WIDZIANE PRZEZ WARSZTAT.
//
// Panel przepisany 16.08 po audycie (docs/voice-audyt-panelu-i-kosztow.md).
// Poprzednia wersja miała 770 linii i większość pól NIC NIE ROBIŁA: suwaki
// brzmienia, wybór głosu, tekst do odsłuchu, tryb odbioru i liczba sygnałów
// zapisywały się do bazy, której nikt w tych kolumnach nie czyta. Pole, które
// nic nie robi, jest obietnicą bez pokrycia — a „Agent aktywny" był gorszy:
// warsztat wyłączał agenta, widział wyłączony przełącznik i myślił, że telefon
// nie jest odbierany, podczas gdy agent odbierał i umawiał wizyty.
//
// ZASADA 39: panel warsztatu opisuje FIRMĘ, nie agenta. Model, głos, prompt,
// webhooki, parametry syntezy i uczenie są nasze — jedna zmiana jednego
// warsztatu nie może psuć konfiguracji pilnowanej złotym stanem.
//
// USUNIĘTE, nie ukryte (ukryte pole wraca przy pierwszym refaktorze):
//   „Trening agenta — 10/25 symulacji" — wydawał NASZE pieniądze i dopisywał
//     reguły do voice_agent_knowledge wstrzykiwane do promptu; jedno kliknięcie
//     przewracało wynik, który zbieraliśmy tydzień,
//   suwaki brzmienia i wybór głosu — nieczytane; podgląd dodatkowo syntezował
//     próbki na żywo za kredyty,
//   sample_text, inbound_mode, inbound_rings, calling_hours — nieczytane,
//   „Telefonia na żywo (ElevenLabs)" — nasze adresy webhooków pokazywane klientowi,
//   „Uczenie z rozmów" — decyzja o karmieniu wspólnej bazy wiedzy jest nasza,
//   czat testowy — warsztat testuje, dzwoniąc pod swój numer; to jest
//     prawdziwszy test i nie kosztuje nas tokenów.
// ============================================================================
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Save, Phone, Building2, ShieldCheck, Copy, AlertTriangle, Plane } from "lucide-react";

const LANGS = [
  { code: "pl", label: "Polski" },
  { code: "en", label: "English" },
  { code: "ua", label: "Українська" },
  { code: "ru", label: "Русский" },
];

/** Limit pola „Dodatkowe informacje". To jedyne miejsce, którym warsztat
 *  naprawdę może zepsuć agenta — jego treść idzie prosto do promptu. */
const LIMIT_DODATKOWE = 500;

/** Słowa, po których tekst przestaje opisywać firmę, a zaczyna sterować modelem. */
const SLOWA_STERUJACE = [
  "zawsze", "nigdy", "ignoruj", "pomiń", "nie mów", "musisz", "masz obowiązek",
  "od teraz", "zapomnij", "system", "prompt", "instrukcja",
];

// KODY PRZEKIEROWANIA — NIEZWERYFIKOWANE.
// `**21*numer#` i `**61*numer*11*15#` to składnia standardu GSM, a nie coś,
// co sprawdziliśmy u polskich operatorów. Dopóki `zweryfikowane` jest false,
// panel ich NIE POKAZUJE — instrukcja, która nie zadziała za pierwszym razem,
// kosztuje więcej zaufania, niż jest warta. Po testach na Orange, Play, Plus
// i T-Mobile wystarczy zmienić tę flagę.
const PRZEKIEROWANIE = {
  zweryfikowane: false,
  kody: (numer: string) => [
    { opis: "Przekierowanie po 15 sekundach (zalecane)", kod: `**61*${numer}*11*15#` },
    { opis: "Przekierowanie natychmiastowe — wszystkie połączenia", kod: `**21*${numer}#` },
    { opis: "Wyłączenie przekierowania", kod: "##21#" },
  ],
};

interface BusinessContext {
  company_name: string; description: string; hours: string; location: string;
  services: string; agent_intro: string; purpose: string; roadside: string; extra_info: string;
  urlop?: { od: string; do: string; zdanie: string };
}
interface VoiceConfig {
  persona_key: string; is_active: boolean; display_name: string;
  languages: string[]; business_context: BusinessContext;
  calendar_access: boolean; orders_access: boolean;
}
interface NumerWarsztatu { phone_number: string; status: string }

const emptyBC = (): BusinessContext => ({
  company_name: "", description: "", hours: "", location: "",
  services: "", agent_intro: "", purpose: "", roadside: "", extra_info: "",
});

const ladnyNumer = (n: string) => {
  const c = String(n || "").replace(/\D/g, "");
  const bez = c.startsWith("48") ? c.slice(2) : c;
  return bez.length === 9 ? `${bez.slice(0, 2)} ${bez.slice(2, 5)} ${bez.slice(5, 7)} ${bez.slice(7)}` : n;
};

export function VoiceAgentPanel({ providerId }: { providerId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [personaKey, setPersonaKey] = useState<string>("");
  const [cfg, setCfg] = useState<VoiceConfig | null>(null);
  const [numer, setNumer] = useState<NumerWarsztatu | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("voice_agent_personas").select("persona_key")
        .eq("enabled", true).order("priority", { ascending: false }).limit(1);
      setPersonaKey(data?.[0]?.persona_key ?? "workshop_secretary");
    })();
  }, []);

  useEffect(() => {
    if (!personaKey || !providerId) return;
    (async () => {
      setLoading(true);
      const [{ data }, { data: num }] = await Promise.all([
        (supabase as any).from("voice_agent_configs").select("*")
          .eq("provider_id", providerId).eq("persona_key", personaKey).maybeSingle(),
        (supabase as any).from("voice_numbers").select("phone_number, status")
          .eq("provider_id", providerId).eq("status", "aktywny").maybeSingle(),
      ]);
      setNumer((num as NumerWarsztatu) ?? null);
      if (data) {
        setCfg({
          persona_key: personaKey,
          is_active: !!data.is_active,
          display_name: data.display_name ?? "",
          languages: data.languages?.length ? data.languages : ["pl"],
          business_context: { ...emptyBC(), ...(data.business_context ?? {}) },
          calendar_access: !!data.calendar_access,
          orders_access: !!data.orders_access,
        });
      } else {
        const { data: sp } = await (supabase as any)
          .from("service_providers").select("company_name, description, address, city").eq("id", providerId).maybeSingle();
        const bc = emptyBC();
        if (sp) {
          bc.company_name = sp.company_name || "";
          bc.description = sp.description || "";
          bc.location = [sp.address, sp.city].filter(Boolean).join(", ");
        }
        setCfg({
          persona_key: personaKey, is_active: false, display_name: "",
          languages: ["pl"], business_context: bc, calendar_access: false, orders_access: false,
        });
      }
      setLoading(false);
    })();
  }, [personaKey, providerId]);

  const update = (patch: Partial<VoiceConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));
  const updateBC = (patch: Partial<BusinessContext>) =>
    setCfg((c) => (c ? { ...c, business_context: { ...c.business_context, ...patch } } : c));

  const save = async () => {
    if (!providerId || !cfg) return;
    setSaving(true);
    // Zapisujemy WYŁĄCZNIE kolumny, które ktoś czyta. Kolumny po usuniętych
    // polach zostają w bazie nietknięte i są oznaczone komentarzem NIEUŻYWANE.
    const { error } = await (supabase as any).from("voice_agent_configs").upsert(
      {
        provider_id: providerId, persona_key: cfg.persona_key,
        is_active: cfg.is_active,
        display_name: cfg.display_name || null,
        languages: cfg.languages,
        business_context: cfg.business_context,
        calendar_access: cfg.calendar_access,
        orders_access: cfg.orders_access,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_id,persona_key" },
    );
    if (error) toast.error("Błąd zapisu: " + error.message);
    else toast.success("Zapisano");
    setSaving(false);
  };

  if (!providerId) return <div className="py-12 text-center text-muted-foreground">Ładowanie konta usługodawcy…</div>;
  if (loading || !cfg) return <div className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  const dodatkowe = cfg.business_context.extra_info || "";
  const sterujace = SLOWA_STERUJACE.filter((s) => dodatkowe.toLowerCase().includes(s));
  const urlop = cfg.business_context.urlop;

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- 1. AGENT */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Asystent głosowy</CardTitle>
          <CardDescription>Odbiera telefony od Twoich klientów i umawia wizyty.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-base">{cfg.is_active ? "Włączony" : "Wyłączony"}</Label>
              <p className="text-xs text-muted-foreground">
                {cfg.is_active
                  ? "Agent odbiera połączenia przekierowane na Twój numer."
                  : "Agent nie odbiera. Dzwoniący usłyszy, że nie przyjmujesz zgłoszeń telefonicznych."}
              </p>
            </div>
            <Switch checked={cfg.is_active} onCheckedChange={(v) => update({ is_active: v })} />
          </div>

          {cfg.is_active && (
            numer ? (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Twój numer techniczny</Label>
                    <p className="text-xl font-semibold tabular-nums">{ladnyNumer(numer.phone_number)}</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(numer.phone_number); toast.success("Skopiowano"); }}>
                    <Copy className="h-3.5 w-3.5" /> Kopiuj
                  </Button>
                </div>
                <div className="text-sm space-y-1.5">
                  <p className="font-medium">Jak uruchomić przekierowanie</p>
                  <p className="text-muted-foreground">
                    Ustaw u swojego operatora przekierowanie połączeń z numeru firmowego na numer powyżej.
                    Zalecamy przekierowanie <strong>po 15 sekundach</strong> — telefon najpierw dzwoni u Ciebie,
                    a asystent odbiera dopiero wtedy, gdy nikt nie podniesie.
                  </p>
                  {PRZEKIEROWANIE.zweryfikowane ? (
                    <div className="space-y-1 pt-1">
                      {PRZEKIEROWANIE.kody(numer.phone_number.replace(/^48/, "")).map((k) => (
                        <div key={k.kod} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1">
                          <span className="text-xs text-muted-foreground">{k.opis}</span>
                          <code className="text-sm">{k.kod}</code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Kody przekierowania różnią się między operatorami — poproś o ustawienie
                      przekierowania na infolinii swojego operatora albo w jego aplikacji.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    Przekierowanie jest płatne u Twojego operatora według jego cennika — my za nie nie pobieramy opłat.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Nie masz jeszcze przypisanego numeru. Skontaktuj się z nami — przydzielimy go do Twojego konta.
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- 2. TWOJA FIRMA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Twoja firma</CardTitle>
          <CardDescription>To, co asystent wie o Twoim warsztacie i mówi klientom.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Jak asystent ma się przedstawiać</Label>
            <Input placeholder="np. Asystentka Kasia" value={cfg.display_name}
              onChange={(e) => update({ display_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Nazwa firmy</Label>
            <Input value={cfg.business_context.company_name} onChange={(e) => updateBC({ company_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Czym się zajmujecie</Label>
            <Textarea rows={2} value={cfg.business_context.description} onChange={(e) => updateBC({ description: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Godziny pracy</Label>
              <Input placeholder="np. pon–pt 8–18, sob 9–14" value={cfg.business_context.hours}
                onChange={(e) => updateBC({ hours: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Adres</Label>
              <Input value={cfg.business_context.location} onChange={(e) => updateBC({ location: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Oferowane usługi (po jednej w linii)</Label>
            <Textarea rows={3} value={cfg.business_context.services} onChange={(e) => updateBC({ services: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Cel rozmowy</Label>
            <Input placeholder="np. umawianie klientów na serwis" value={cfg.business_context.purpose}
              onChange={(e) => updateBC({ purpose: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Pomoc drogowa / laweta</Label>
            <Input placeholder="np. Tak — laweta na terenie miasta, 150 zł / Nie oferujemy"
              value={cfg.business_context.roadside} onChange={(e) => updateBC({ roadside: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Jak asystent ma otwierać rozmowę</Label>
            <Textarea rows={2} placeholder="np. Dzień dobry, tu Kasia z Auto-Serwis Kowalski."
              value={cfg.business_context.agent_intro} onChange={(e) => updateBC({ agent_intro: e.target.value })} />
          </div>

          {/* Jedyne pole, którym warsztat może zepsuć agenta — stąd limit,
              podgląd i ostrzeżenie o słowach sterujących. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Dodatkowe informacje (ceny, promocje, zasady)</Label>
              <span className={`text-xs tabular-nums ${dodatkowe.length > LIMIT_DODATKOWE ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                {dodatkowe.length} / {LIMIT_DODATKOWE}
              </span>
            </div>
            <Textarea rows={3} maxLength={LIMIT_DODATKOWE} value={dodatkowe}
              placeholder="np. Wymiana oleju od 150 zł. Nie umawiamy na niedziele."
              onChange={(e) => updateBC({ extra_info: e.target.value.slice(0, LIMIT_DODATKOWE) })} />
            {sterujace.length > 0 && (
              <div className="flex gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
                <span>
                  To pole opisuje <strong>firmę</strong>, nie zachowanie asystenta. Znaleźliśmy tu:{" "}
                  <strong>{sterujace.join(", ")}</strong>. Polecenia dla asystenta nie zadziałają stąd
                  i mogą pogorszyć rozmowy — napisz raczej, co oferujecie i na jakich zasadach.
                </span>
              </div>
            )}
            {dodatkowe.trim() && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Tak to zobaczy asystent</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-2">{dodatkowe.trim()}</pre>
              </details>
            )}
          </div>

          <div className="space-y-2">
            <Label>Języki rozmowy</Label>
            <div className="flex flex-wrap gap-3">
              {LANGS.map((l) => (
                <label key={l.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cfg.languages.includes(l.code)}
                    onCheckedChange={(v) =>
                      update({
                        languages: v
                          ? [...cfg.languages, l.code]
                          : cfg.languages.filter((c) => c !== l.code),
                      })
                    }
                  />
                  {l.label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- 3. UPRAWNIENIA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Co asystent może zrobić</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Sprawdzanie wolnych terminów</Label>
              <p className="text-xs text-muted-foreground">Asystent podaje godziny z Twojego kalendarza.</p>
            </div>
            <Switch checked={cfg.calendar_access} onCheckedChange={(v) => update({ calendar_access: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Zapisywanie zgłoszeń</Label>
              <p className="text-xs text-muted-foreground">Po rozmowie powstaje zlecenie w panelu.</p>
            </div>
            <Switch checked={cfg.orders_access} onCheckedChange={(v) => update({ orders_access: v })} />
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ 4. URLOP */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Plane className="h-5 w-5" /> Urlop / przerwa</CardTitle>
          <CardDescription>
            Asystent dalej odbiera i mówi, kiedy wracacie — nie umawia wizyt na czas przerwy.
            Telefon dzwoniący w pustkę jest dla klienta gorszy niż jedno zdanie o przerwie.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Od</Label>
              <Input type="date" value={urlop?.od ?? ""}
                onChange={(e) => updateBC({ urlop: { od: e.target.value, do: urlop?.do ?? "", zdanie: urlop?.zdanie ?? "" } })} />
            </div>
            <div className="space-y-2">
              <Label>Do</Label>
              <Input type="date" value={urlop?.do ?? ""}
                onChange={(e) => updateBC({ urlop: { od: urlop?.od ?? "", do: e.target.value, zdanie: urlop?.zdanie ?? "" } })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Co asystent ma powiedzieć</Label>
            <Input placeholder="np. Wracamy 28 sierpnia — proszę zadzwonić po tym terminie."
              value={urlop?.zdanie ?? ""}
              onChange={(e) => updateBC({ urlop: { od: urlop?.od ?? "", do: urlop?.do ?? "", zdanie: e.target.value } })} />
          </div>
          {urlop?.od && urlop?.do && (
            <Badge variant="secondary">Przerwa: {urlop.od} → {urlop.do}</Badge>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz
        </Button>
      </div>
    </div>
  );
}

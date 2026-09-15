// ============================================================================
// WorkshopCallsList — LISTA WSZYSTKICH ROZMÓW, także tych bez zlecenia.
//
// Powód powstania: panel rozmowy (OrderCallPanel) istnieje, ale jest kluczowany
// po `orderId` i osadzony wyłącznie w karcie zlecenia. Rozmowa, która NIE
// utworzyła zlecenia, była w panelu niewidoczna — a to 2 z 9 rozmów dziennie.
// Warsztat pytał „co, jak agent nie da rady?" i odpowiedź brzmiała „nikt się
// o tym nie dowie".
//
// ────────────────────────────────────────────────────────────────────────────
// 13.09.2026: LISTA PRZESTAJE BYĆ NIESKOŃCZONA
// ────────────────────────────────────────────────────────────────────────────
// Pobierała `limit(50)` bez stronicowania i bez wyszukiwania. Przy dziewięciu
// rozmowach dziennie pięćdziesiąt kończy się po tygodniu — a szóstego dnia
// warsztat, który chce znaleźć rozmowę sprzed dwóch tygodni, nie ma jak.
//
// Teraz: stronicowanie (20/50/100), szukanie po numerze, zakres dat i filtr
// statusu — WSZYSTKO po stronie bazy. Filtrowanie w przeglądarce po pobraniu
// pięćdziesięciu wierszy wyglądałoby tak samo, a szukałoby wyłącznie w tych
// pięćdziesięciu i milczało o reszcie.
//
// JEDEN KOMPONENT, DWA WEJŚCIA — kafelek „AI Agent" w menu warsztatu i zakładka
// „Asystent głosowy". Warsztat, który ma sam pakiet agenta, menu warsztatowego
// nie ma w ogóle, więc lista nie może mieszkać wyłącznie w kafelku.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Phone, AlertTriangle, ChevronDown, MessageSquare, FileText, FilePlus,
  ChevronLeft, ChevronRight, Search, X, Play,
} from "lucide-react";
import { toast } from "sonner";

type Tura = { role?: string; message?: string | null };

/** Co agent wyciągnął z rozmowy. Puste pola przychodzą jako „nieznane". */
type DaneKlienta = { name?: string; phone?: string; vehicle?: string; service?: string };

/** Klient rozpoznany po numerze — z kartoteki warsztatu, nie z rozmowy. */
type Znajomy = { imie: string; telefon: string };

type Rozmowa = {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  minutes_charged: number | null;
  from_number: string | null;
  status: string | null;
  outcome: string | null;
  summary: string | null;
  contact_name: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  elevenlabs_conversation_id: string | null;
  recording_path: string | null;
  turns: Tura[];
  dane: DaneKlienta;
  ustalenia: string | null;
};

/** „nieznane", puste i myślniki znaczą to samo: nic nie wiemy. */
const wartosc = (t: string | null | undefined): string => {
  const s = (t ?? '').trim();
  if (!s || /^(nieznane|nieznany|brak|n\/a|-)$/i.test(s)) return '—';
  return s;
};

/**
 * „3 dni temu". Przy liście zadań na dziś liczy się nie data, tylko ILE TO
 * CZEKA — połączenie sprzed trzech dni to zwykle stracony klient.
 */
const odKiedy = (iso: string): string => {
  const minuty = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minuty < 60) return `${Math.max(1, minuty)} min temu`;
  const godziny = Math.floor(minuty / 60);
  if (godziny < 24) return `${godziny} godz. temu`;
  const dni = Math.floor(godziny / 24);
  return dni === 1 ? 'wczoraj' : `${dni} dni temu`;
};

const czas = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const dlugosc = (s: number | null) => (s == null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`);

/** „+48 221 015 896" — numer czyta człowiek, nie parser. */
const numerCzytelnie = (n: string | null) => {
  if (!n) return "numer zastrzeżony";
  const c = n.replace(/\D/g, "");
  return c.length === 11 && c.startsWith("48")
    ? `+48 ${c.slice(2, 5)} ${c.slice(5, 8)} ${c.slice(8)}`
    : n;
};

const NA_STRONIE = [20, 50, 100];

/** Statusy, które rozmowa może mieć dziś w bazie. „Oddzwonić" jeszcze nie istnieje. */
const STATUSY: Array<{ wartosc: string; etykieta: string }> = [
  { wartosc: "wszystkie", etykieta: "Wszystkie" },
  { wartosc: "needs_review", etykieta: "Wymaga uwagi" },
  { wartosc: "completed", etykieta: "Domknięte" },
];

export function WorkshopCallsList({ providerId, onOpenOrder }: {
  providerId: string;
  onOpenOrder?: (orderId: string) => void;
}) {
  const [rozmowy, setRozmowy] = useState<Rozmowa[]>([]);
  const [ile, setIle] = useState(0);
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState<string | null>(null);
  const [alertAwarii, setAlertAwarii] = useState<{ title: string; description: string } | null>(null);
  const [domykana, setDomykana] = useState<string | null>(null);
  /** Numer (ostatnie 9 cyfr) → klient z kartoteki. */
  const [znajomi, setZnajomi] = useState<Map<string, Znajomy>>(new Map());
  /** Podpisane adresy nagrań — dociągane na żądanie, bo link wygasa. */
  const [nagrania, setNagrania] = useState<Record<string, string | 'brak' | 'laduje'>>({});

  // ── filtry ────────────────────────────────────────────────────────────────
  const [strona, setStrona] = useState(0);
  const [naStronie, setNaStronie] = useState(20);
  const [szukany, setSzukany] = useState("");
  const [odDaty, setOdDaty] = useState("");
  const [doDaty, setDoDaty] = useState("");
  const [status, setStatus] = useState("wszystkie");

  const wczytaj = useCallback(async () => {
    setLadowanie(true);
    setBlad(null);

    let zapytanie = (supabase as any)
      .from("voice_calls")
      .select(
        "id, created_at, duration_seconds, minutes_charged, from_number, status, outcome, summary, contact_name, linked_entity_type, linked_entity_id, elevenlabs_conversation_id, recording_path",
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .eq("direction", "inbound");

    // Szukamy po SAMYCH CYFRACH: warsztat wpisze „221 015" albo „+48221015",
    // a w bazie leży jeden ciąg. Porównanie tekstu jeden do jednego nie
    // znalazłoby nic i wyglądałoby jak „nie ma takiej rozmowy".
    const cyfry = szukany.replace(/\D/g, "");
    if (cyfry) zapytanie = zapytanie.ilike("from_number", `%${cyfry}%`);
    if (odDaty) zapytanie = zapytanie.gte("created_at", `${odDaty}T00:00:00`);
    if (doDaty) zapytanie = zapytanie.lte("created_at", `${doDaty}T23:59:59`);
    if (status !== "wszystkie") zapytanie = zapytanie.eq("status", status);

    const od = strona * naStronie;
    const { data, error, count } = await zapytanie
      .order("created_at", { ascending: false })
      .range(od, od + naStronie - 1);

    if (error) { setBlad(error.message); setLadowanie(false); return; }

    const lista: Rozmowa[] = (data || []).map((r: Rozmowa) => ({
      ...r, turns: [], dane: {}, ustalenia: null,
    }));
    // Transkrypty dociągamy JEDNYM zapytaniem, nie po jednym na rozmowę —
    // sto rozmów to byłoby sto zapytań na wejściu w widok.
    if (lista.length) {
      const { data: tr } = await (supabase as any)
        .from("voice_transcripts")
        .select("call_id, turns, summary")
        .in("call_id", lista.map((r) => r.id));
      const wgId = new Map((tr || []).map((t: { call_id: string }) => [t.call_id, t]));
      for (const r of lista) {
        const t = wgId.get(r.id) as { turns?: Tura[]; summary?: string } | undefined;
        r.turns = t?.turns || [];
        r.summary = r.summary || t?.summary || null;
      }

      // Dane, które agent wyciągnął z rozmowy — imię, telefon, auto, sprawa.
      // Jedno zapytanie na całą stronę, tak jak transkrypty.
      const { data: wyniki } = await (supabase as any)
        .from("voice_call_outcomes")
        .select("call_id, customer_data, next_step")
        .in("call_id", lista.map((r) => r.id));
      const wgWyniku = new Map((wyniki || []).map((w: { call_id: string }) => [w.call_id, w]));
      for (const r of lista) {
        const w = wgWyniku.get(r.id) as { customer_data?: DaneKlienta; next_step?: string } | undefined;
        r.dane = w?.customer_data ?? {};
        r.ustalenia = w?.next_step ?? null;
      }

      /**
       * ROZPOZNANY KLIENT — z KARTOTEKI, nie z rozmowy.
       *
       * „Jan Kowalski, ostatnia wizyta 12.08" mówi warsztatowi więcej niż
       * jedenaście cyfr. Numery z listy dopasowujemy po OSTATNICH DZIEWIĘCIU
       * cyfrach: w kartotece leżą w pięciu formatach („+48 601…", „601-234-567",
       * „48601234567"), a dziewięć ostatnich cyfr jest wspólne dla wszystkich.
       */
      const numery = lista.map((r) => (r.from_number || "").replace(/\D/g, "").slice(-9)).filter(Boolean);
      if (numery.length) {
        const { data: klienci } = await (supabase as any)
          .from("workshop_clients")
          .select("first_name, last_name, company_name, phone")
          .eq("provider_id", providerId);
        const wgNumeru = new Map<string, Znajomy>();
        for (const k of (klienci || []) as Array<Record<string, string>>) {
          const kluczNumeru = (k.phone || "").replace(/\D/g, "").slice(-9);
          if (!kluczNumeru) continue;
          const imie = [k.first_name, k.last_name].filter(Boolean).join(" ").trim() || k.company_name || "";
          if (imie) wgNumeru.set(kluczNumeru, { imie, telefon: k.phone });
        }
        setZnajomi(wgNumeru);
      }
    }
    setRozmowy(lista);
    setIle(count ?? 0);
    setLadowanie(false);
  }, [providerId, strona, naStronie, szukany, odDaty, doDaty, status]);

  useEffect(() => { void wczytaj(); }, [wczytaj]);

  // AWARIA ROZLICZENIOWA MA KRZYCZEC.
  // 16.08 skonczyly sie kredyty dostawcy modelu i o awarii dowiedzielismy sie
  // przypadkiem. voice-agent-chat zapisuje teraz alert do system_alerts —
  // ta lista jest miejscem, w ktore warsztat i tak patrzy.
  useEffect(() => {
    let anulowane = false;
    void (async () => {
      const { data } = await (supabase as any)
        .from("system_alerts")
        .select("title, description")
        .eq("category", "system")
        .eq("status", "pending")
        .eq("metadata->>zrodlo", "voice_agent_billing")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!anulowane && data?.[0]) setAlertAwarii(data[0]);
    })();
    return () => { anulowane = true; };
  }, [providerId]);

  // DOKONCZENIE ROZMOWY, KTORA NIE DOMKNELA SIE SAMA.
  //
  // Rozmowa ze statusem „Wymaga uwagi" ma komplet danych w transkrypcie —
  // brakowalo tylko sposobu, zeby je stamtad wyjac. Bez tego przycisku
  // 2 z 9 rozmow dziennie konczy sie tym, ze nikt nic z nimi nie robi.
  const utworzZlecenie = async (r: Rozmowa) => {
    setDomykana(r.id);
    try {
      const { data: sesja } = await supabase.auth.getSession();
      const token = sesja?.session?.access_token;
      if (!token) { toast.error("Sesja wygasła — zaloguj się ponownie."); return; }
      const odp = await fetch(
        "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/voice-call-commit",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: r.elevenlabs_conversation_id, provider_id: providerId }),
        },
      );
      const wynik = await odp.json().catch(() => ({}));
      if (!odp.ok || wynik?.error) {
        // Tresc bledu, nie sam status — inaczej warsztat widzi „nie udalo sie"
        // i nie wie, czego brakuje.
        toast.error(wynik?.error || `Nie udało się utworzyć zlecenia (${odp.status}).`);
        return;
      }
      if (wynik?.braki?.length) {
        toast.warning(`Brakuje danych: ${wynik.braki.join(", ")}. Uzupełnij w karcie zlecenia.`);
      } else {
        toast.success("Zlecenie utworzone z tej rozmowy.");
      }
      setRozmowy((poprz) => poprz.map((x) => x.id === r.id
        ? { ...x, status: "completed", linked_entity_type: "workshop_order", linked_entity_id: wynik?.order_id || x.linked_entity_id }
        : x));
    } finally {
      setDomykana(null);
    }
  };

  /**
   * ODSŁUCH BEZ WYCHODZENIA Z LISTY.
   *
   * Adres nagrania jest PODPISANY i wygasa, więc nie da się go trzymać w
   * wierszu — pobieramy go dopiero, gdy ktoś kliknie. `voice-call-audio`
   * odpowiada `available: false`, gdy nagranie zostało już usunięte zgodnie
   * z retencją; mówimy to wprost, zamiast pokazywać zepsuty odtwarzacz.
   */
  const pobierzNagranie = async (r: Rozmowa) => {
    if (nagrania[r.id]) return;
    setNagrania((p) => ({ ...p, [r.id]: 'laduje' }));
    try {
      const { data, error } = await supabase.functions.invoke('voice-call-audio', {
        body: { call_id: r.id, provider_id: providerId },
      });
      const url = (data as { available?: boolean; url?: string } | null)?.url;
      setNagrania((p) => ({ ...p, [r.id]: error || !url ? 'brak' : url }));
    } catch {
      setNagrania((p) => ({ ...p, [r.id]: 'brak' }));
    }
  };

  /** Zmiana filtra wraca na pierwszą stronę — inaczej wynik bywa pusty bez powodu. */
  const zFiltrem = (ustaw: () => void) => { ustaw(); setStrona(0); };

  /** Klient z kartoteki dopasowany po numerze — albo nic. */
  const znajomiKlient = (r: Rozmowa): Znajomy | undefined =>
    znajomi.get((r.from_number || '').replace(/\D/g, '').slice(-9));

  const stron = Math.max(1, Math.ceil(ile / naStronie));
  const filtryCzynne = !!(szukany || odDaty || doDaty || status !== "wszystkie");

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-primary" />
            Połączenia
            <span className="text-sm font-normal text-muted-foreground">
              ({ile}{filtryCzynne ? " po filtrach" : ""})
            </span>
          </CardTitle>
          {filtryCzynne && (
            <Button size="sm" variant="ghost" onClick={() => zFiltrem(() => {
              setSzukany(""); setOdDaty(""); setDoDaty(""); setStatus("wszystkie");
            })}>
              <X className="mr-1 h-4 w-4" />Wyczyść filtry
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Numer dzwoniącego</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="np. 221 015"
                value={szukany}
                onChange={(e) => zFiltrem(() => setSzukany(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Od dnia</Label>
            <Input type="date" value={odDaty} onChange={(e) => zFiltrem(() => setOdDaty(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Do dnia</Label>
            <Input type="date" value={doDaty} onChange={(e) => zFiltrem(() => setDoDaty(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <div className="flex flex-wrap gap-1">
              {STATUSY.map((s) => (
                <Button
                  key={s.wartosc}
                  size="sm"
                  variant={status === s.wartosc ? "default" : "outline"}
                  onClick={() => zFiltrem(() => setStatus(s.wartosc))}
                >
                  {s.etykieta}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {alertAwarii && (
          <div className="mb-3 rounded-lg border border-destructive bg-destructive/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />{alertAwarii.title}
            </p>
            <p className="mt-1 text-xs text-destructive/90">{alertAwarii.description}</p>
          </div>
        )}

        {blad && (
          <p className="py-6 text-center text-sm text-destructive">
            Nie udało się wczytać połączeń: {blad}
          </p>
        )}

        {ladowanie && (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}

        {!ladowanie && !blad && rozmowy.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filtryCzynne ? "Żadna rozmowa nie pasuje do filtrów." : "Brak połączeń."}
          </p>
        )}

        {!ladowanie && rozmowy.map((r) => {
          const uwaga = r.status === "needs_review";
          const maZlecenie = r.linked_entity_type === "workshop_order" && !!r.linked_entity_id;
          return (
            <Collapsible key={r.id} className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{czas(r.created_at)}</span>
                    {/* Ile to czeka — przy liście zadań ważniejsze niż sama data. */}
                    <span className="text-xs text-muted-foreground">{odKiedy(r.created_at)}</span>
                    {/* ROZPOZNANY KLIENT ZAMIAST CYFR. Numer zostaje klikalny —
                        przy oddzwanianiu to oszczędza przepisywanie. */}
                    {znajomiKlient(r)
                      ? (
                        <a
                          href={`tel:+${(r.from_number || '').replace(/\D/g, '')}`}
                          className="text-sm font-medium text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {znajomiKlient(r)!.imie}
                        </a>
                      )
                      : r.from_number
                        ? (
                          <a
                            href={`tel:+${r.from_number.replace(/\D/g, '')}`}
                            className="text-sm text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {numerCzytelnie(r.from_number)}
                          </a>
                        )
                        : <span className="text-sm text-muted-foreground">{numerCzytelnie(null)}</span>}
                    <span className="text-xs text-muted-foreground">{dlugosc(r.duration_seconds)}</span>
                    {/* Naliczone minuty obok długości, bo to DWIE różne liczby:
                        naliczanie zaokrągla w górę do pełnych minut, więc rozmowa
                        dwudziestosekundowa kosztuje całą minutę. Warsztat, który
                        widzi tylko jedną z nich, zgłasza to jako błąd. */}
                    {r.minutes_charged != null && (
                      <span className="text-xs text-muted-foreground">
                        · naliczono {r.minutes_charged} min
                      </span>
                    )}
                    {r.contact_name && <span className="text-xs text-muted-foreground">· {r.contact_name}</span>}
                    {uwaga
                      ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Wymaga uwagi</Badge>
                      : maZlecenie
                        ? <Badge variant="secondary">Zlecenie utworzone</Badge>
                        : <Badge variant="outline">Bez zlecenia</Badge>}
                  </div>
                  {/* Przy rozmowie do przeglądu `outcome` niesie POWÓD, dla ktorego
                      nie dało się jej domknąć — to najważniejsza informacja w wierszu. */}
                  {uwaga && r.outcome && (
                    <p className="mt-1 text-xs text-destructive">{r.outcome}</p>
                  )}
                  {!uwaga && r.summary && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{r.summary}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {uwaga && r.elevenlabs_conversation_id && (
                    <Button size="sm" variant="outline" disabled={domykana === r.id}
                      onClick={() => void utworzZlecenie(r)}>
                      {domykana === r.id
                        ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        : <FilePlus className="mr-1 h-4 w-4" />}
                      Utwórz zlecenie
                    </Button>
                  )}
                  {maZlecenie && onOpenOrder && (
                    <Button size="sm" variant="ghost" onClick={() => onOpenOrder(r.linked_entity_id!)}>
                      <FileText className="mr-1 h-4 w-4" />Zlecenie
                    </Button>
                  )}
                  <CollapsibleTrigger asChild>
                    <Button size="sm" variant="ghost"><ChevronDown className="h-4 w-4" /></Button>
                  </CollapsibleTrigger>
                </div>
              </div>
              {/* ═══════════════════════════════════════════════════════════
                  ROZWINIĘCIE: NAJPIERW TO, PO CO WARSZTAT TU WCHODZI
                  ═══════════════════════════════════════════════════════════
                  Dane klienta, sprawa, termin, odsłuch — a transkrypcja dopiero
                  za drugim kliknięciem. Wcześniej otwierało się dwanaście
                  pustych wierszy „Klient:" i surowa lista uwag w nawiasach
                  kwadratowych; żeby dowiedzieć się, kto dzwonił, trzeba było
                  to przeczytać w całości. */}
              <CollapsibleContent className="space-y-4 border-t border-border px-3 py-3">
                {/* a) DANE KLIENTA I AUTA — puste pola jako „—", nie ukryte.
                       Brak informacji jest informacją: warsztat widzi od razu,
                       czego agent nie ustalił, zamiast szukać tego w tekście. */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Klient i auto</p>
                  <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Imię</span>
                      <span className="text-right">
                        {znajomiKlient(r)?.imie ?? wartosc(r.contact_name ?? r.dane.name)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Telefon</span>
                      <span className="text-right">
                        {r.from_number
                          ? <a href={`tel:+${r.from_number.replace(/\D/g, "")}`} className="text-primary hover:underline">
                              {numerCzytelnie(r.from_number)}
                            </a>
                          : wartosc(r.dane.phone)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 sm:col-span-2">
                      <span className="text-muted-foreground">Auto</span>
                      <span className="text-right">{wartosc(r.dane.vehicle)}</span>
                    </div>
                  </div>
                </div>

                {/* b) CZEGO DOTYCZYŁA SPRAWA — jedno zdanie. */}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Czego dotyczyła sprawa</p>
                  <p className="text-sm">{wartosc(r.summary ?? r.dane.service)}</p>
                </div>

                {/* c) TERMIN — tylko gdy agent coś ustalił. Pusty nagłówek
                       „Termin: —" sugerowałby, że coś się nie zapisało. */}
                {r.ustalenia && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Ustalenia</p>
                    <p className="text-sm">{r.ustalenia}</p>
                  </div>
                )}

                {/* d) ODSŁUCH — odtwarzacz w wierszu, bez wychodzenia z listy. */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nagranie</p>
                  {nagrania[r.id] === 'laduje' && (
                    <p className="text-xs text-muted-foreground">
                      <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Pobieram…
                    </p>
                  )}
                  {nagrania[r.id] === 'brak' && (
                    <p className="text-xs text-muted-foreground">
                      Nagrania nie ma — albo nie zostało zapisane, albo minął okres przechowywania.
                    </p>
                  )}
                  {typeof nagrania[r.id] === 'string' && !['brak', 'laduje'].includes(nagrania[r.id] as string) && (
                    <audio controls src={nagrania[r.id] as string} className="h-9 w-full max-w-md" />
                  )}
                  {!nagrania[r.id] && (
                    <Button size="sm" variant="outline" onClick={() => void pobierzNagranie(r)}>
                      <Play className="mr-1 h-4 w-4" />Odsłuchaj
                    </Button>
                  )}
                </div>

                {/* e) TRANSKRYPCJA — ZWINIĘTA. Kto chce, rozwija.
                       Tury bez treści pomijamy: to są momenty ciszy, z których
                       powstawało dwanaście wierszy „Klient:" bez ani jednego
                       słowa. */}
                {r.turns.filter((t) => (t.message ?? '').trim()).length > 0 ? (
                  <details className="rounded-lg border border-border bg-muted/30 p-2">
                    <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      Transkrypcja ({r.turns.filter((t) => (t.message ?? '').trim()).length})
                    </summary>
                    <div className="mt-2 space-y-1">
                      {r.turns.filter((t) => (t.message ?? '').trim()).map((t, i) => (
                        <p key={i} className="text-sm">
                          <span className={t.role === "agent" ? "text-primary" : "text-foreground"}>
                            {t.role === "agent" ? "Agent: " : "Klient: "}
                          </span>
                          <span className="text-muted-foreground">{t.message}</span>
                        </p>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Transkrypcja pojawia się około pół minuty po rozłączeniu.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* ── STRONICOWANIE ──────────────────────────────────────────────── */}
        {!ladowanie && ile > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Na stronie:</span>
              {NA_STRONIE.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={naStronie === n ? "default" : "ghost"}
                  onClick={() => zFiltrem(() => setNaStronie(n))}
                >
                  {n}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={strona === 0}
                onClick={() => setStrona((s) => Math.max(0, s - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                Strona {strona + 1} z {stron}
              </span>
              <Button size="sm" variant="outline" disabled={strona + 1 >= stron}
                onClick={() => setStrona((s) => s + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

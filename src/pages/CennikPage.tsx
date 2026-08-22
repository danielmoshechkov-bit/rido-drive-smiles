import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  Sparkles,
  Car,
  Home,
  Wrench,
  Briefcase,
  ShoppingCart,
  FileText,
  Gift,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePublicPricing, type PublicPlan, type ProductLine } from "@/hooks/usePublicPricing";
import { planPriceLabels, planCtaLabel } from "@/lib/pricingCards";
import { useJestKlientemLinii } from "@/hooks/useJestKlientemLinii";
import { useZakup } from '@/components/billing/ZakupProvider';
import { useCenaOkresu, zl, type Okres } from '@/hooks/useCenaOkresu';
import { usePlanAction } from "@/hooks/usePlanAction";
import { AuthModal } from "@/components/auth/AuthModal";

type Plan = {
  name: string;
  price: string;
  period?: string;
  /** Cena po zakończeniu promocji — pokazywana przekreślona obok startowej. */
  targetPrice?: string;
  /** Druga linia pod ceną, np. kwota brutto. */
  priceNote?: string;
  description?: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  cta?: string;
};

type SubGroup = {
  heading?: string;
  plans: Plan[];
};

type Section = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  topNote?: string;
  bottomNote?: string;
  comparison?: string;
  groups: SubGroup[];
};

const sections: Section[] = [
  {
    id: "auta",
    label: "Auta",
    icon: Car,
    title: "Wystaw auto taniej",
    subtitle: "Trzy plany dla osób prywatnych i komisów. Bez ukrytych opłat.",
    comparison: "Już od 25 zł — taniej niż u konkurencji 💰",
    groups: [
      {
        plans: [
          {
            name: "Podstawowy",
            price: "25 zł",
            period: "/ 30 dni",
            features: [
              "Standardowe ogłoszenie",
              "Do 10 zdjęć",
              "Ocena AI ceny",
              "Mapa lokalizacji",
            ],
            cta: "Wystaw auto",
          },
          {
            name: "Standard",
            price: "45 zł",
            period: "/ 30 dni",
            features: [
              "Wszystko z Podstawowego",
              "Do 20 zdjęć",
              "Podbicie 1x w tygodniu",
              "Statystyki wyświetleń",
            ],
            highlighted: true,
            badge: "Najpopularniejszy",
            cta: "Wybieram Standard",
          },
          {
            name: "Premium",
            price: "79 zł",
            period: "/ 30 dni",
            features: [
              "Wszystko ze Standard",
              "Do 30 zdjęć",
              "Codzienne podbicie",
              "Wyróżnienie kolorem",
              "Top listy wyników",
              "AI obróbka zdjęć GRATIS",
            ],
            cta: "Wybieram Premium",
          },
        ],
      },
    ],
  },
  {
    id: "nieruchomosci",
    label: "Nieruchomości",
    icon: Home,
    title: "Nieruchomości — dla agencji",
    subtitle: "Plany agencyjne dopasowane do skali Twojego biura.",
    groups: [],
  },

  {
    id: "warsztat",
    label: "Warsztat i Detailing",
    icon: Wrench,
    title: "Cennik GetRido dla Serwisów Aut",
    subtitle:
      "Warsztaty, detailing, wulkanizacja, blacharnia, mechanika. Wybierz plan dopasowany do skali Twojego serwisu.",
    topNote:
      "System ERP dla warsztatów, detailingów i każdego serwisu aut – zarządzaj wszystkimi zleceniami (własnymi i z platformy GetRido) w jednym miejscu. Wdrożenie, migracja danych z obecnego programu, konfiguracja kasy fiskalnej i KSeF — 0 zł (wartość 690 zł).",
    bottomNote:
      "Ceny startowe obowiązują przy uruchomieniu konta do 31.12.2026 i są gwarantowane przez 12 miesięcy od aktywacji — o zmianie informujemy 30 dni wcześniej. Pakiety dokupowane: SMS · sprawdzenia VIN i nr rejestracyjnego · minuty Agenta AI (0,60 zł/min netto albo pakiet 100 / 250 / 500 minut). Funkcje AI bez podanego limitu działają w ramach uczciwego użycia. Agent nigdy nie przestaje odbierać telefonu — po wyczerpaniu minut przechodzi w tryb awaryjny i przekazuje wiadomość do warsztatu.",
    // Plany, ceny i zakres czyta WarsztatContent z billing_plans. W kodzie
    // zostają wyłącznie nagłówki, teksty marketingowe i przypisy.
    groups: [],
  },
  {
    id: "uslugi",
    label: "Usługi",
    icon: Briefcase,
    title: "Wystawiaj usługi — znajdź klientów",
    subtitle:
      "Bez abonamentu i bez limitu. Płacisz tylko gdy zrealizujesz zlecenie z platformy.",
    groups: [],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    icon: ShoppingCart,
    title: "Sprzedaj wszystko — od pralki po rower",
    subtitle: "Marketplace ogłoszeń lokalnych. Zacznij za darmo.",
    groups: [
      {
        plans: [
          {
            name: "Podstawowe",
            price: "0 zł",
            period: "darmowe",
            features: [
              "Do 5 ogłoszeń / mies.",
              "30 dni emisji",
              "Do 5 zdjęć",
            ],
            cta: "Wystaw za darmo",
          },
          {
            name: "Kolejne",
            price: "5 zł",
            period: "/ sztuka",
            features: [
              "Po przekroczeniu darmowego limitu",
              "Wszystko jak w Podstawowych",
            ],
            cta: "Dodaj ogłoszenie",
          },
          {
            name: "Wyróżnione",
            price: "9 zł",
            period: "/ 30 dni",
            features: [
              "Top kategorii",
              "Wyróżnienie kolorem",
              "Podwójne wyświetlenia",
            ],
            cta: "Wyróżnij",
          },
          {
            name: "Promowane",
            price: "19 zł",
            period: "/ 30 dni",
            features: [
              "Strona główna",
              "Codzienne podbicia",
              "Najwyższa widoczność",
            ],
            highlighted: true,
            badge: "Najpopularniejszy",
            cta: "Promuj",
          },
          {
            name: "Sprzedaj szybko",
            price: "29 zł",
            period: "/ 30 dni",
            features: [
              "Top + Strona główna",
              "AI sugestie ceny",
              "Automatyczne podbicia",
              'Etykieta „Polecane"',
            ],
            cta: "Sprzedaj szybko",
          },
        ],
      },
    ],
  },
  {
    id: "ksiegowosc",
    label: "Księgowość",
    icon: FileText,
    title: "Cennik modułu Księgowość i KSeF",
    subtitle: "Faktury VAT, KSeF FA(3), automatyczne księgowanie.",
    groups: [],
  },

  {
    id: "ai",
    label: "AI Pro",
    icon: Sparkles,
    title: "Cennik AI Pro i Asystentów AI",
    subtitle: "Dodatki AI do każdego planu portalu — bez limitu zapytań, generowanie treści, AI Voice.",
    groups: [],
  },
  {
    id: "polecenia",
    label: "Polecenia",
    icon: Gift,
    title: "Program poleceń GetRido",
    subtitle: "Polecaj GetRido znajomym i zyskuj realne nagrody.",
    groups: [],
  },
];

const businessSections: Section[] = [
  {
    id: "ai",
    label: "AI Pro / Asystenci",
    icon: Sparkles,
    title: "Cennik AI Pro i Asystentów AI",
    subtitle: "Dodatki AI do każdego planu portalu.",
    groups: [
      {
        plans: [
          {
            name: "RidoAI Lite",
            price: "29 zł",
            period: "/ mies.",
            description: "Podstawowy asystent AI w aplikacji.",
            features: [
              "Limit 100 zapytań / mies.",
              "Wsparcie po polsku",
              "Wbudowane skróty",
            ],
            cta: "Aktywuj",
          },
          {
            name: "AI Pro",
            price: "99 zł",
            period: "/ mies.",
            description: "Pełen pakiet AI dla profesjonalistów.",
            features: [
              "Bez limitu zapytań",
              "Generowanie opisów ogłoszeń",
              "AI SEO Agent",
              "Marketing ROI Dashboard",
            ],
            highlighted: true,
            cta: "Wybieram AI Pro",
          },
        ],
      },
    ],
  },
];


const aiExtras = [
  { icon: "🤖", name: "AI Wycena nieruchomości", price: "19 zł", note: "GRATIS w Premium nieruchomości" },
  { icon: "📊", name: "AI Raport dzielnicy", price: "25 zł" },
  { icon: "📸", name: "AI obróbka zdjęć", price: "9 zł" },
  { icon: "🚗", name: "Raport VIN — pełna historia pojazdu", price: "69 zł", note: "Stała cena (u innych 70–90 zł)" },
  { icon: "🏦", name: "Kalkulator kredytu", price: "DARMOWY" },
];

const PlanCard = ({ plan, onCta, planCode, okres }: {
  plan: Plan; onCta: () => void; planCode?: string; okres?: Okres;
}) => {
  /**
   * Cena na karcie idzie Z BAZY, gdy znamy kod planu i okres.
   *
   * Kusiło, żeby pomnożyć cenę miesięczną przez dziesięć tutaj — ale wtedy
   * rabat roczny istniałby w trzecim miejscu i cennik mógłby pokazywać coś
   * innego niż okno zakupu i niż kwota pobrana przez operatora.
   *
   * `providerId` jest `null`: cennik jest stroną publiczną, więc pokazuje cenę
   * startową. Klient po gwarancji zobaczy swoją w oknie zakupu, które zna jego
   * warsztat.
   */
  const { cena } = useCenaOkresu(planCode ?? null, null, okres ?? 'miesiac');
  const rok = okres === 'rok';

  return (
  <Card
    className={`p-6 flex flex-col relative transition-all duration-300 hover:shadow-purple hover:-translate-y-1 ${
      plan.highlighted ? "border-2 border-primary shadow-purple" : "border border-border"
    }`}
  >
    {plan.badge && (
      <Badge
        className={`absolute -top-3 left-1/2 -translate-x-1/2 ${
          plan.badge === "AI"
            ? "bg-gradient-hero text-primary-foreground"
            : plan.badge === "Wkrótce"
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground"
        }`}
      >
        {plan.badge === "Najpopularniejszy" && "⭐ "}
        {plan.badge}
      </Badge>
    )}
    <div className="mb-4">
      <h3 className="text-lg font-bold text-primary mb-2">{plan.name}</h3>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-3xl font-bold text-foreground">
          {cena ? zl(cena.netto) : plan.price}
        </span>
        <span className="text-sm text-muted-foreground">
          {cena ? (rok ? 'netto / rok' : 'netto / mies.') : plan.period}
        </span>
        {cena && rok ? (
          <span className="text-sm text-muted-foreground line-through">
            {zl(cena.bezRabatuNetto)}
          </span>
        ) : (
          plan.targetPrice && (
            <span className="text-sm text-muted-foreground line-through">{plan.targetPrice}</span>
          )
        )}
      </div>
      {plan.priceNote && (
        <p className="text-xs text-muted-foreground mt-1">{plan.priceNote}</p>
      )}
      {plan.description && (
        <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
      )}
    </div>
    <ul className="space-y-2 mb-6 flex-1">
      {plan.features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <span className="text-foreground">{f}</span>
        </li>
      ))}
    </ul>
    <Button
      variant={plan.highlighted ? "default" : "outline"}
      className="w-full"
      onClick={onCta}
    >
      {plan.cta || "Wybieram"}
    </Button>
  </Card>
  );
};

/**
 * Sekcja „Warsztat i Detailing" — jedyna karmiona z bazy.
 *
 * Ceny, nazwy, opisy, kolejność i lista funkcji pochodzą z `billing_plans`
 * i macierzy plan × funkcja, więc zmiana cennika to klik w panelu, nie deploy.
 * Karty grupują się po linii produktowej: Warsztat i Agent AI kupuje się
 * osobno, pakietów łączonych już nie sprzedajemy.
 */
const PRODUCT_GROUPS: Array<{ line: ProductLine; heading: string }> = [
  { line: "warsztat", heading: "GetRido Warsztat — program dla serwisu" },
  { line: "agent", heading: "GetRido Agent AI — odbiera telefon 24/7" },
];

/** Wyróżnienie karty — decyzja marketingowa, nie dana z cennika. */
const HIGHLIGHTED: Record<string, string> = {
  warsztat_standard: "Najpopularniejszy",
  agent_pro: "Najpopularniejszy",
};

const toCard = (plan: PublicPlan, jestKlientem = false): Plan => {
  const badge = HIGHLIGHTED[plan.code];
  const price = planPriceLabels(plan);
  return {
    name: plan.name,
    price: price.price,
    period: price.period,
    targetPrice: price.target,
    priceNote: price.note,
    description: plan.description ?? undefined,
    features: plan.features,
    highlighted: !!badge,
    badge,
    cta: planCtaLabel(plan, { jestKlientem }),
  };
};

const gridClass = (count: number) =>
  count === 1
    ? "md:grid-cols-1 max-w-md"
    : count === 2
    ? "md:grid-cols-2 max-w-3xl"
    : count === 3
    ? "md:grid-cols-3"
    : "md:grid-cols-2 lg:grid-cols-4";

const WarsztatContent = ({ section, onCta, onKontakt }: { section: Section; onCta: () => void; onKontakt: () => void }) => {
  const { plans, loading, error } = usePublicPricing();

  // Rejestracja odbywa się na miejscu, bez przerzucania na inną stronę:
  // klient kliknął konkretny plan i ma wrócić do niego, a nie szukać go od nowa.
  const [authOpen, setAuthOpen] = useState(false);
  const [wybranyPlan, setWybranyPlan] = useState<string | null>(null);
  // Napis na przyciskach zależy od tego, czy ten klient już korzysta
  // z warsztatu. Zapytanie leci wyłącznie przy istniejącej sesji — /cennik
  // jest stroną publiczną i większość wejść to niezalogowani.
  const { jestKlientem: jestKlientemWarsztatu } = useJestKlientemLinii("warsztat");

  const { klik: klikPlan, pending: planPending } = usePlanAction((plan) => {
    setWybranyPlan(plan.code);
    setAuthOpen(true);
  });

  const { otworzZakup } = useZakup();

  /**
   * Domyślnie ROK — to korzystniejsza opcja i chcemy ją pokazywać pierwszą.
   * Przełącznik steruje cenami na kartach i jedzie razem z wyborem do okna,
   * żeby klient nie wybierał okresu dwa razy.
   */
  const [okres, setOkres] = useState<Okres>('rok');

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">{section.title}</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">{section.subtitle}</p>
        {section.topNote && (
          <p className="mt-4 text-sm text-foreground bg-primary/5 border border-primary/20 rounded-lg p-4 max-w-3xl mx-auto">
            {section.topNote}
          </p>
        )}
      </div>

      {loading && (
        <div className="grid gap-6 max-w-6xl mx-auto md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-6 h-72 animate-pulse bg-muted/40 border-border" />
          ))}
        </div>
      )}

      {/* Przy błędzie NIE pokazujemy zapasowego cennika — zła cena na stronie
          ofertowej jest gorsza niż jej brak. Pusta lista leci tą samą ścieżką:
          RLS odcinający gościa nie zwraca błędu, tylko zero wierszy, a sekcja
          bez ani jednej karty wyglądałaby jak zwinięta oferta. */}
      {!loading && (error || plans.length === 0) && (
        <Card className="max-w-2xl mx-auto p-6 text-center">
          <p className="text-sm text-foreground mb-4">
            Nie udało się wczytać aktualnego cennika. Odśwież stronę albo napisz do nas —
            podamy ceny od ręki.
          </p>
          <Button variant="default" onClick={onKontakt}>
            Skontaktuj się z nami
          </Button>
        </Card>
      )}

      {!loading && !error && plans.length > 0 && (
        <div className="mb-8 flex justify-center">
          <div className="inline-flex rounded-full border border-border bg-muted p-1">
            {(['rok', 'miesiac'] as Okres[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOkres(o)}
                className={
                  'rounded-full px-4 py-1.5 text-sm font-medium transition ' +
                  (okres === o ? 'bg-background shadow text-foreground' : 'text-muted-foreground')
                }
              >
                {o === 'rok' ? 'Rok' : 'Miesiąc'}
                {o === 'rok' && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    2 miesiące gratis
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading &&
        !error &&
        plans.length > 0 &&
        PRODUCT_GROUPS.map(({ line, heading }) => {
          const group = plans.filter((p) => p.product_line === line);
          if (group.length === 0) return null;
          return (
            <div key={line} className="mb-10">
              <h3 className="text-xl font-semibold text-foreground text-center mb-6">{heading}</h3>
              <div className={`grid gap-6 mx-auto max-w-6xl ${gridClass(group.length)}`}>
                {group.map((plan) => (
                  <PlanCard
                    key={plan.code}
                    plan={{
                      ...toCard(plan, jestKlientemWarsztatu),
                      cta: planPending === plan.code
                        ? "Otwieram płatność…"
                        : toCard(plan, jestKlientemWarsztatu).cta,
                    }}
                    planCode={plan.code}
                    okres={okres}
                    onCta={() =>
                      // Plan indywidualny i darmowy nadal idą starą drogą:
                      // pierwszy do kontaktu, drugi do założenia konta. Okno
                      // zakupu obsługuje wyłącznie to, co da się kupić.
                      plan.is_custom || Number(plan.price_net) === 0
                        ? klikPlan(plan)
                        : otworzZakup({ planCode: plan.code, okres })
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}

      {section.bottomNote && (
        <p className="text-center text-sm text-foreground bg-accent/10 border border-accent/30 rounded-lg p-4 max-w-3xl mx-auto mt-6">
          {section.bottomNote}
        </p>
      )}

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        initialMode="register"
        redirectAfterLogin="/uslugi/panel"
        signupContext={{ module: "warsztat", plan: wybranyPlan ?? undefined }}
      />
    </div>
  );
};

const SectionContent = ({ section, onCta, onKontakt }: { section: Section; onCta: () => void; onKontakt: () => void }) => {
  if (section.id === "warsztat") return <WarsztatContent section={section} onCta={onCta} onKontakt={onKontakt} />;
  if (section.id === "uslugi") return <UslugiContent onCta={onCta} />;
  if (section.id === "ai") return <AiProContent onCta={onCta} />;
  if (section.id === "polecenia") return <PoleceniaContent />;
  if (section.id === "nieruchomosci") return <NieruchomosciContent onCta={onCta} />;
  if (section.id === "ksiegowosc") return <KsiegowoscContent onCta={onCta} />;

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">{section.title}</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">{section.subtitle}</p>
        {section.topNote && (
          <p className="mt-4 text-sm text-foreground bg-primary/5 border border-primary/20 rounded-lg p-4 max-w-3xl mx-auto">
            {section.topNote}
          </p>
        )}
      </div>

      {section.groups.map((group, gi) => (
        <div key={gi} className="mb-10">
          {group.heading && (
            <h3 className="text-xl font-semibold text-foreground text-center mb-6">
              {group.heading}
            </h3>
          )}
          <div
            className={`grid gap-6 max-w-6xl mx-auto ${
              group.plans.length === 2
                ? "md:grid-cols-2"
                : group.plans.length === 3
                ? "md:grid-cols-3"
                : group.plans.length === 4
                ? "md:grid-cols-2 lg:grid-cols-4"
                : "md:grid-cols-2 lg:grid-cols-5"
            }`}
          >
            {group.plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} onCta={onCta} />
            ))}
          </div>
        </div>
      ))}

      {section.comparison && (
        <div className="text-center mt-6 mb-4">
          <Badge className="bg-accent/20 text-accent-foreground border border-accent/40 text-sm py-2 px-4">
            {section.comparison}
          </Badge>
        </div>
      )}

      {section.bottomNote && (
        <p className="text-center text-sm text-foreground bg-accent/10 border border-accent/30 rounded-lg p-4 max-w-3xl mx-auto mt-6">
          {section.bottomNote}
        </p>
      )}
    </div>
  );
};

const UslugiContent = ({ onCta }: { onCta: () => void }) => (
  <div>
    <div className="text-center mb-8">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
        Wystawiaj usługi — znajdź klientów
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Bez abonamentu i bez limitu. Płacisz tylko gdy zrealizujesz zlecenie z platformy.
      </p>
    </div>

    {/* Big banner */}
    <Card className="max-w-3xl mx-auto p-8 mb-10 bg-gradient-hero text-primary-foreground text-center border-0">
      <h3 className="text-2xl md:text-3xl font-bold mb-3">Wystawienie usługi: DARMOWE ✓</h3>
      <p className="text-primary-foreground/90 mb-3">
        Bez limitów, bez abonamentu, bez ukrytych kosztów.
      </p>
      <p className="text-lg font-semibold">
        Płacisz tylko <span className="text-accent">5% od zarobku</span> gdy zrealizujesz
        zlecenie z platformy.
      </p>
    </Card>

    {/* How it works */}
    <div className="max-w-5xl mx-auto mb-10">
      <h3 className="text-xl font-bold text-center mb-6">Jak to działa</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {[
          {
            n: "1",
            t: "Wystawiasz usługę",
            d: "Dodaj swoją usługę (warsztat, fryzjer, hydraulik, sprzątanie itp.) — całkowicie za darmo.",
          },
          {
            n: "2",
            t: "Klient rezerwuje",
            d: "System automatycznie oznacza że klient przyszedł z GetRido. Zlecenie trafia do Twojego kalendarza.",
          },
          {
            n: "3",
            t: "Rozliczasz zlecenie",
            d: "Wpisujesz cenę zlecenia + koszty części/materiałów. System liczy Twój zarobek. Pobieramy 5% tylko od zarobku.",
          },
        ].map((s) => (
          <Card key={s.n} className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
              {s.n}
            </div>
            <h4 className="font-bold text-foreground mb-2">{s.t}</h4>
            <p className="text-sm text-muted-foreground">{s.d}</p>
          </Card>
        ))}
      </div>
    </div>

    {/* Calculation example */}
    <Card className="max-w-2xl mx-auto p-6 mb-10">
      <h4 className="font-bold text-foreground mb-4 text-center">Przykład kalkulacji</h4>
      <div className="space-y-2 text-sm">
        {[
          ["Przychód ze zlecenia", "800 zł"],
          ["Koszt części (opony)", "500 zł"],
          ["Twój zarobek", "300 zł", true],
          ["Prowizja GetRido (5% od zarobku)", "15 zł"],
          ["Twoja czysta wypłata", "285 zł", true, true],
        ].map(([label, val, bold, highlight], i) => (
          <div
            key={i}
            className={`flex justify-between py-2 border-b border-border last:border-0 ${
              highlight ? "text-primary font-bold text-base" : bold ? "font-semibold" : ""
            }`}
          >
            <span>{label}</span>
            <span>{val}</span>
          </div>
        ))}
      </div>
    </Card>

    {/* Comparison */}
    <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-4 mb-10">
      <Card className="p-5 bg-muted/40">
        <h4 className="font-bold text-foreground mb-2">Konkurencja (pay-per-lead)</h4>
        <p className="text-sm text-muted-foreground">
          Płacisz 5–15 zł za każdy kontakt — niezależnie czy klient się odezwie czy nie.
        </p>
      </Card>
      <Card className="p-5 border-2 border-primary bg-primary/5">
        <h4 className="font-bold text-primary mb-2">GetRido ✓</h4>
        <p className="text-sm text-foreground">
          Płacisz tylko gdy zrealizujesz zlecenie i faktycznie zarobisz. Bardziej fair.
        </p>
      </Card>
    </div>

    {/* Who can */}
    <div className="max-w-3xl mx-auto mb-10">
      <h4 className="font-bold text-center mb-4">Kto może wystawiać usługi</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        {[
          "🛠️ Warsztaty i mechanicy",
          "🏠 Hydraulicy, elektrycy",
          "✂️ Fryzjerzy, kosmetyczki",
          "🧹 Sprzątanie i serwis domowy",
          "🎨 Projektanci, freelancerzy",
          "👨‍🔧 Wszystkie inne usługi",
        ].map((t) => (
          <div key={t} className="bg-muted/40 rounded-lg p-3 text-center">
            {t}
          </div>
        ))}
      </div>
    </div>

    <div className="text-center">
      <Button size="lg" variant="default" onClick={onCta}>
        Zarejestruj się i wystaw usługę za darmo
      </Button>
    </div>
  </div>
);

const AiProContent = ({ onCta }: { onCta: () => void }) => {
  const aiPlans = businessSections[0].groups[0].plans;
  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
          Cennik AI Pro i Asystentów AI
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Dedykowane plany AI — bez limitu zapytań, generowanie treści, AI Voice.
        </p>
      </div>

      <div className="grid gap-6 max-w-3xl mx-auto md:grid-cols-2 mb-14">
        {aiPlans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} onCta={onCta} />
        ))}
      </div>

      <div className="max-w-5xl mx-auto">
        <h3 className="text-xl md:text-2xl font-bold text-center mb-2">
          Dodatkowe usługi z AI
        </h3>
        <p className="text-center text-muted-foreground mb-8">
          Dokup do każdego planu — wzmocnij ogłoszenie sztuczną inteligencją.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {aiExtras.map((e) => (
            <Card key={e.name} className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{e.icon}</span>
                <div>
                  <div className="font-semibold text-foreground">{e.name}</div>
                  {e.note && <div className="text-xs text-primary">{e.note}</div>}
                </div>
              </div>
              <span className="font-bold text-primary">{e.price}</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

type AgencyPlan = {
  name: string;
  oldPrice: string;
  promoPrice: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
};

const agencyPlans: AgencyPlan[] = [
  {
    name: "Starter",
    oldPrice: "399 zł/msc",
    promoPrice: "199 zł/msc",
    features: [
      "Do 20 ogłoszeń",
      "Dashboard agenta",
      "Statystyki podstawowe",
      "Email support",
    ],
  },
  {
    name: "Profesjonalny",
    oldPrice: "799 zł/msc",
    promoPrice: "399 zł/msc",
    highlighted: true,
    badge: "⭐ Najpopularniejszy",
    features: [
      "Do 100 ogłoszeń",
      "AI Wycena nieruchomości",
      "CRM dla agentów",
      "Zaawansowane statystyki",
      "Logo agencji na ogłoszeniach",
      "Priority support",
    ],
  },
  {
    name: "Agencyjny",
    oldPrice: "1399 zł/msc",
    promoPrice: "699 zł/msc",
    features: [
      "Unlimited ogłoszenia",
      "Własna podstrona agencji",
      "API integration",
      "Wirtualny agent AI 24/7",
      "Dedicated support",
    ],
  },
];

const NieruchomosciContent = ({ onCta }: { onCta: () => void }) => (
  <div>
    <div className="text-center mb-8">
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
        Nieruchomości — plany agencyjne
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Plany dopasowane do skali Twojego biura nieruchomości.
      </p>
    </div>

    {/* Promo banner */}
    <Card className="max-w-4xl mx-auto p-8 mb-10 bg-gradient-hero text-primary-foreground text-center border-0">
      <h3 className="text-2xl md:text-3xl font-bold mb-3">
        🎁 OFERTA WPROWADZAJĄCA: WSZYSTKIE AGENCJE ZA DARMO
      </h3>
      <p className="text-primary-foreground/90 mb-2">
        Pierwsi agenci dołączają <span className="font-bold">BEZPŁATNIE</span>.
      </p>
      <p className="text-primary-foreground/90">
        Po osiągnięciu masy krytycznej wprowadzimy ceny promocyjne (poniżej),
        które i tak będą dużo niższe niż u konkurencji.
      </p>
    </Card>

    <div className="grid gap-6 max-w-6xl mx-auto md:grid-cols-3 mb-8">
      {agencyPlans.map((p) => (
        <Card
          key={p.name}
          className={`p-6 flex flex-col relative transition-all duration-300 hover:shadow-purple hover:-translate-y-1 ${
            p.highlighted ? "border-2 border-primary shadow-purple" : "border border-border"
          }`}
        >
          {p.badge && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground">
              {p.badge}
            </Badge>
          )}
          <div className="mb-4">
            <h3 className="text-lg font-bold text-primary mb-2">{p.name}</h3>
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <span className="text-sm text-muted-foreground line-through">{p.oldPrice}</span>
              <span className="text-base font-semibold text-foreground">{p.promoPrice}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">cena promocyjna do odwołania</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-primary">Teraz: 0 zł</span>
            </div>
          </div>
          <ul className="space-y-2 mb-6 flex-1">
            {p.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-foreground">{f}</span>
              </li>
            ))}
          </ul>
          <Button
            variant={p.highlighted ? "default" : "outline"}
            className="w-full"
            onClick={onCta}
          >
            Dołącz teraz za darmo
          </Button>
        </Card>
      ))}
    </div>

    <Card className="max-w-3xl mx-auto p-5 bg-accent/10 border-accent/30 text-center">
      <p className="text-sm text-foreground">
        U konkurencji plany dla agencji: <span className="font-semibold">2.000–3.000 zł/msc</span>.
        GetRido docelowo: <span className="font-semibold">199–699 zł/msc</span>.
        <br />
        <span className="text-primary font-bold">→ Nawet 87% taniej, a teraz na start ZA DARMO 🎁</span>
      </p>
    </Card>
  </div>
);

const KsiegowoscContent = ({ onCta }: { onCta: () => void }) => {
  const plans: Plan[] = [
    {
      name: "Basic",
      price: "29 zł",
      period: "/ mies.",
      features: [
        "Program do faktur",
        "Bez limitu faktur",
        "Faktury VAT, pro forma, korygujące",
        "Numeracja automatyczna",
        "Wysyłka email",
        "Eksport PDF",
        "Integracja KSeF basic",
      ],
      cta: "Wypróbuj 14 dni za darmo",
    },
    {
      name: "Pro",
      price: "59 zł",
      period: "/ mies.",
      highlighted: true,
      badge: "Najpopularniejszy",
      features: [
        "Wszystko z Basic",
        "AI Asystent Księgowy",
        "Program magazynowy",
        "Auto-odczyt faktur (zdjęcie → dane) — 30 / mc",
        "Doradca podatkowy AI",
        "Wykrywanie błędów w fakturach",
        "KSeF pełny + wysyłka",
        "KSeF monitor + alerty",
        "Weryfikacja Białej Listy",
        "Zaawansowane raporty",
      ],
      cta: "Wypróbuj 14 dni za darmo",
    },
  ];

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
          Cennik modułu Księgowość i KSeF
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Faktury VAT, KSeF FA(3), automatyczne księgowanie z AI.
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl mx-auto md:grid-cols-2 mb-8">
        {plans.map((plan) => (
          <PlanCard key={plan.name} plan={plan} onCta={onCta} />
        ))}
      </div>

      <Card className="max-w-3xl mx-auto p-5 bg-accent/10 border-accent/30 text-center">
        <p className="text-sm text-foreground">
          U konkurencji programy fakturowe: <span className="font-semibold">49–69 zł/msc</span>.
          GetRido Basic: <span className="font-semibold">29 zł</span>, Pro z AI:{" "}
          <span className="font-semibold">59 zł</span>.
          <br />
          <span className="text-primary font-bold">→ Taniej i więcej funkcji.</span>
        </p>
      </Card>
    </div>
  );
};



const PoleceniaContent = () => (
  <div>
    <div className="text-center mb-10">
      <Users className="h-10 w-10 text-primary mx-auto mb-3" />
      <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
        Program poleceń GetRido
      </h2>
      <p className="text-muted-foreground max-w-2xl mx-auto">
        Polecaj GetRido znajomym i zyskuj realne nagrody.
      </p>
    </div>
    <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
      <Card className="p-6">
        <h3 className="font-bold text-foreground mb-3">👥 Poleć znajomego</h3>
        <p className="text-sm text-muted-foreground mb-2">
          <span className="font-semibold text-foreground">Twój znajomy:</span> 50 zł salda powitalnego
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Ty:</span> 50 zł salda na konto GetRido po pierwszym zakupie znajomego
        </p>
      </Card>
      <Card className="p-6 border-2 border-primary">
        <h3 className="font-bold text-primary mb-3">🔧 Warsztat poleca warsztat</h3>
        <p className="text-sm text-foreground">
          = <span className="font-bold">1 miesiąc systemu GRATIS</span> dla obu stron
        </p>
      </Card>
    </div>
  </div>
);

const CennikPage = () => {
  const [tab, setTab] = useState("auta");
  const navigate = useNavigate();
  /**
   * Duże przyciski cennika prowadzą do ZAKUPU, nie do formularza kontaktowego.
   *
   * Prowadziły do `/kontakt`, a napisy na nich brzmią „Zarejestruj się i wystaw
   * usługę za darmo" i „Dołącz teraz za darmo". Klient, który klika taki
   * przycisk i trafia na formularz kontaktowy, uznaje, że od ręki kupić się
   * nie da — i odchodzi.
   *
   * Kafelki planów warsztatowych mają własną drogę (`klikPlan` → `billing-checkout`)
   * i jej nie ruszamy. Tu chodzi o przyciski, które obiecują rejestrację.
   */
  const goCta = () => navigate("/auth");

  /** Wyłącznie awaryjna karta „nie udało się wczytać cennika" — tam kontakt jest na miejscu. */
  const goKontakt = () => navigate("/kontakt");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-hero py-14">
          <div className="container mx-auto px-4 text-center text-primary-foreground">
            <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Cennik GetRido
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              Przejrzysty cennik wszystkich naszych usług
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto">
              Wybierz portal, którego potrzebujesz — zapłacisz tylko za to, czego używasz.
            </p>
          </div>
        </section>


        {/* Tabs */}
        <section className="py-10">
          <div className="container mx-auto px-4">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <div className="relative mb-8">
                <div className="overflow-x-auto scrollbar-hide snap-x snap-mandatory">
                <TabsList className="w-max mx-auto grid grid-flow-col auto-cols-max gap-2 bg-muted p-1 h-auto">
                  {sections.map((s) => {
                    const Icon = s.icon;
                    return (
                      <TabsTrigger
                        key={s.id}
                        value={s.id}
                        className="whitespace-nowrap flex items-center gap-2 px-4 py-2"
                      >
                        <Icon className="h-4 w-4" />
                        {s.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                </div>
                <div className="pointer-events-none absolute top-0 right-0 h-full w-12 bg-gradient-to-l from-background to-transparent md:hidden" />
              </div>


              {sections.map((section) => (
                <TabsContent key={section.id} value={section.id} className="mt-0">
                  <SectionContent section={section} onCta={goCta} onKontakt={goKontakt} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>


        {/* CTA bottom */}
        <section className="bg-muted py-12">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-3">Masz pytania o cennik?</h3>
            <p className="text-muted-foreground mb-6">
              Skontaktuj się z nami — przygotujemy ofertę dopasowaną do Twojej firmy.
            </p>
            <Button variant="accent" size="lg" onClick={goCta}>
              Skontaktuj się z nami
            </Button>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground py-4">
          Ceny brutto. Dla planów firmowych z VAT zaznaczamy „netto".
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default CennikPage;

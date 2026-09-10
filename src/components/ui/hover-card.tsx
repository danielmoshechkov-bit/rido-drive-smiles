import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

/**
 * Podpowiedź, która działa też na telefonie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 POWÓD ISTNIENIA (10.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Karty pojazdu i klienta w liście zleceń otwierały się WYŁĄCZNIE na
 * najechanie myszą. Na telefonie nie ma najeżdżania, więc mechanik stojący
 * przy aucie nie miał do nich dostępu w ogóle — żeby odczytać VIN albo numer
 * klienta, musiał wejść w zlecenie, znaleźć pole i przepisać ręcznie.
 *
 * Rozwiązanie siedzi TUTAJ, w prymitywie, a nie w czterech miejscach użycia.
 * Gdyby każde miejsce naprawiać osobno, za miesiąc połowa działałaby na dotyk,
 * a połowa nie — i nikt by nie wiedział która.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * JAK
 * ═══════════════════════════════════════════════════════════════════════════
 * `(hover: none)` rozstrzyga, czy urządzenie umie najeżdżać. Nie szerokość
 * ekranu: tablet z rysikiem bywa szeroki i nie ma najeżdżania, a okno na
 * komputerze bywa wąskie i ma. Pytamy o zdolność, nie o rozmiar.
 *
 *   umie najeżdżać  → Radix HoverCard, bez zmian
 *   nie umie        → Radix Popover: dotknięcie otwiera, dotknięcie obok
 *                     zamyka (Popover robi to sam, bez osobnego przycisku)
 *
 * ⚠️ NA DOTYK WYŁĄCZAMY WŁASNY `onClick` WYZWALACZA. W liście zleceń kliknięcie
 * w pojazd otwiera edycję auta — na telefonie dotknięcie otwierałoby JEDNOCZEŚNIE
 * podpowiedź i to okno. Dlatego treść wyzwalacza dostaje `pointer-events: none`,
 * a dotknięcie trafia w sam wyzwalacz. Do dalszych czynności służą przyciski
 * WEWNĄTRZ karty („Otwórz", „Zmień") — i to jest cała różnica względem myszy,
 * gdzie kliknięcie i najechanie to dwa różne gesty.
 */

/** Czy urządzenie NIE umie najeżdżać (telefon, tablet). */
function useDotyk(): boolean {
  /**
   * Odczyt od razu, w wartości początkowej — NIE dopiero w `useEffect`.
   *
   * Przy odczycie w efekcie pierwsze renderowanie zawsze dawało wariant myszy
   * i dopiero po zamontowaniu przeskakiwało na dotykowy. Na telefonie znaczyło
   * to mignięcie kartą, której nie da się otworzyć. Złapała to kontrola
   * pozytywna w teście: oba warianty renderowały identyczny znacznik.
   */
  const [dotyk, setDotyk] = React.useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none)").matches
      : false,
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const zapytanie = window.matchMedia("(hover: none)");
    const ustaw = () => setDotyk(zapytanie.matches);
    ustaw();
    // Urządzenie potrafi zmienić zdolność w trakcie — podłączenie myszy do
    // tabletu albo tryb pulpitu. Starsze przeglądarki znają tylko `addListener`.
    if (zapytanie.addEventListener) {
      zapytanie.addEventListener("change", ustaw);
      return () => zapytanie.removeEventListener("change", ustaw);
    }
    zapytanie.addListener(ustaw);
    return () => zapytanie.removeListener(ustaw);
  }, []);

  return dotyk;
}

/** Który mechanizm obsługuje bieżącą kartę — czytany przez Trigger i Content. */
const KontekstDotyku = React.createContext(false);

type PropsRoot = React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Root>;

const HoverCard = ({ children, openDelay, closeDelay, ...props }: PropsRoot) => {
  const dotyk = useDotyk();

  return (
    <KontekstDotyku.Provider value={dotyk}>
      {dotyk ? (
        // `openDelay`/`closeDelay` są własnością najeżdżania — Popover ich nie
        // zna i przekazanie ich dalej byłoby nieznanym atrybutem w DOM.
        <PopoverPrimitive.Root {...props}>{children}</PopoverPrimitive.Root>
      ) : (
        <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} {...props}>
          {children}
        </HoverCardPrimitive.Root>
      )}
    </KontekstDotyku.Provider>
  );
};
HoverCard.displayName = "HoverCard";

const HoverCardTrigger = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger>
>(({ asChild, children, className, ...props }, ref) => {
  const dotyk = React.useContext(KontekstDotyku);

  if (!dotyk) {
    return (
      <HoverCardPrimitive.Trigger ref={ref} asChild={asChild} className={className} {...props}>
        {children}
      </HoverCardPrimitive.Trigger>
    );
  }

  /**
   * Na dotyk NIE używamy `asChild`: wyzwalaczem jest własny element, a treść
   * w środku przestaje łapać dotknięcia. Inaczej `onClick` wyzwalacza (np.
   * „otwórz edycję pojazdu") odpalałby się razem z otwarciem podpowiedzi.
   */
  return (
    <PopoverPrimitive.Trigger
      // Radix HoverCard.Trigger to kotwica, Popover.Trigger to przycisk —
      // typy referencji się nie pokrywają, a element jest jeden i ten sam.
      ref={ref as unknown as React.Ref<HTMLButtonElement>}
      className={cn("text-left", className)}
      {...(props as unknown as React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>)}
    >
      <span className="pointer-events-none contents">{children}</span>
    </PopoverPrimitive.Trigger>
  );
});
HoverCardTrigger.displayName = "HoverCardTrigger";

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => {
  const dotyk = React.useContext(KontekstDotyku);
  const styl = cn(
    "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className,
  );

  if (dotyk) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref as React.Ref<HTMLDivElement>}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={styl}
          {...props}
        />
      </PopoverPrimitive.Portal>
    );
  }

  return (
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={styl}
      {...props}
    />
  );
});
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardTrigger, HoverCardContent }

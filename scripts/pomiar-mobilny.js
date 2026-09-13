/**
 * POMIAR UKŁADU NA TELEFONIE — 360 px, na żywo, w prawdziwej przeglądarce.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * JAK URUCHOMIĆ
 * ═══════════════════════════════════════════════════════════════════════════
 *   1. `npm run dev`
 *   2. otwórz http://localhost:8080 i ZALOGUJ SIĘ (ramka dziedziczy sesję)
 *   3. wklej CAŁĄ zawartość tego pliku do konsoli
 *   4. `await pomiarMobilny.kontrola()`   ← najpierw to, patrz niżej
 *   5. `await pomiarMobilny.omiec(pomiarMobilny.TRASY)`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 DLACZEGO RAMKA, A NIE ZMIANA ROZMIARU OKNA
 * ═══════════════════════════════════════════════════════════════════════════
 * `resize_window` w tym środowisku ZGŁASZA POWODZENIE, a `innerWidth` się nie
 * zmienia — więc każdy pomiar punktów granicznych zrobiony w ten sposób jest
 * nieważny. `<iframe width=360>` ma WŁASNY viewport: zapytania `sm:`/`md:`
 * liczą się względem niego naprawdę. To jest różnica między pomiarem
 * a wróżeniem.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 W TEJ APLIKACJI STRONA NIGDY NIE PRZEWIJA SIĘ W POZIOMIE
 * ═══════════════════════════════════════════════════════════════════════════
 * `html` i `body` mają `overflow-x: hidden` (src/index.css). Skutek:
 * `scrollWidth` documentElement ZAWSZE równa się szerokości ekranu, także
 * wtedy, gdy pół panelu leży poza nim. Sprawdzanie `scrollWidth > clientWidth`
 * daje tu zielono zawsze i jest bezużyteczne — sprawdzone kontrolą pozytywną,
 * która przy tej metodzie NIE zapaliła się na elemencie 500 px.
 *
 * Objawem nie jest więc pasek przewijania, tylko **treść ucięta i niedostępna**
 * — przycisk „Rozwiąż", którego na telefonie nie da się kliknąć, bo leży poza
 * krawędzią. Dlatego mierzymy `getBoundingClientRect().right` każdego elementu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO ODSIEWAMY I DLACZEGO
 * ═══════════════════════════════════════════════════════════════════════════
 * • przodek z `overflow-x: auto/scroll` → treść DA SIĘ dosunąć, to nie usterka
 *   (tak działa opakowana tabela);
 * • przodek z `overflow: hidden` inny niż `html`/`body` → obcina KARTA, nie
 *   krawędź telefonu. To zwykle zamierzone (ozdobne kule rozmycia w rogach).
 *   Bez tego odsiewu bramka zgłaszała 27 dekoracji na 120 trafień;
 * • element, którego RODZIC też wystaje → zgłaszamy tylko najgłębszy element
 *   z rodzicem mieszczącym się w ekranie, żeby jedna usterka nie liczyła się
 *   dwadzieścia razy.
 *
 * Winowajcę wskazujemy przez `data-lov-id` (`plik:linia:kolumna`) — atrybut
 * wstawia `lovable-tagger` w trybie deweloperskim. Na produkcji go nie ma,
 * więc TEN POMIAR ROBI SIĘ NA `npm run dev`.
 */

window.pomiarMobilny = (() => {
  const SZEROKOSC = 360;

  function ramka() {
    let r = document.getElementById('__pomiar_ramka');
    if (!r) {
      r = document.createElement('iframe');
      r.id = '__pomiar_ramka';
      r.style.cssText = `position:fixed;left:-9999px;top:0;width:${SZEROKOSC}px;height:800px;border:0`;
      document.body.appendChild(r);
    }
    return r;
  }

  const idz = (url, ms = 1800) =>
    new Promise((res) => { const r = ramka(); r.onload = () => setTimeout(res, ms); r.src = url; });

  function szukaj() {
    const r = ramka(), d = r.contentDocument, szer = r.contentWindow.innerWidth;
    const stan = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') return 'przewijalne';
        if (ox === 'hidden' && p !== d.body && p !== d.documentElement) return 'przyciete';
      }
      return 'wystaje';
    };
    const zrodlo = (el) => {
      for (let p = el; p; p = p.parentElement) {
        const id = p.getAttribute && p.getAttribute('data-lov-id');
        if (id) return id;
      }
      return '?';
    };
    const winne = [];
    for (const el of d.body.querySelectorAll('*')) {
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 || rc.height === 0) continue;
      if (rc.right <= szer + 1 && rc.left >= -1) continue;
      const rodzic = el.parentElement?.getBoundingClientRect();
      if (rodzic && rodzic.right > szer + 1) continue;
      if (stan(el) !== 'wystaje') continue;
      winne.push({
        zrodlo: zrodlo(el),
        nadmiar: Math.round(rc.right - szer),
        tekst: (el.textContent || '').trim().slice(0, 40),
      });
    }
    return winne;
  }

  /**
   * KONTROLA POZYTYWNA — uruchamiaj ZAWSZE przed przeglądem i po nim.
   *
   * „Zero trafień" ma znaczyć „układ dobry", a nie „wykrywacz przestał
   * działać". W tym repozytorium zielony wynik z niedziałającego narzędzia
   * zdarzył się już sześć razy; ta funkcja jest tańsza niż siódmy.
   */
  async function kontrola() {
    await idz('/cennik', 2500);
    const d = ramka().contentDocument;
    const p = d.createElement('div');
    p.style.cssText = 'width:500px;height:8px';
    d.body.appendChild(p);
    const z = szukaj().length;
    p.remove();
    const bez = szukaj().length;
    const ok = z > 0 && z > bez;
    console.log(ok ? '✅ wykrywacz działa' : '❌ WYKRYWACZ NIE DZIAŁA — wynik przeglądu byłby bez wartości');
    return { zProbka: z, bezProbki: bez, dziala: ok };
  }

  async function omiec(trasy) {
    const wynik = {};
    for (const t of trasy) {
      await idz(t);
      try { wynik[t] = szukaj(); } catch { wynik[t] = []; }
    }
    const zebrane = new Map();
    for (const [t, lista] of Object.entries(wynik)) {
      for (const x of lista) {
        if (!zebrane.has(x.zrodlo)) zebrane.set(x.zrodlo, { n: 0, nadmiar: 0, trasy: [], tekst: x.tekst });
        const e = zebrane.get(x.zrodlo);
        e.n++; e.nadmiar = Math.max(e.nadmiar, x.nadmiar);
        if (!e.trasy.includes(t)) e.trasy.push(t);
      }
    }
    const lista = [...zebrane].sort((a, b) => b[1].nadmiar - a[1].nadmiar);
    console.log(`Tras: ${trasy.length}. Z trafieniami: ${Object.values(wynik).filter((v) => v.length).length}. Miejsc w kodzie: ${lista.length}.`);
    for (const [k, v] of lista) console.log(`+${v.nadmiar}px ${v.n}× ${k} „${v.tekst}" → ${v.trasy.slice(0, 3).join(' ')}`);
    return { wynik, lista };
  }

  /** Trasy bez parametrów w adresie — te da się odwiedzić wprost. */
  const TRASY = ['/', '/admin', '/admin/agenci-ai', '/admin/ai', '/admin/dashboard', '/admin/mapy',
    '/admin/marketing', '/admin/marketplace', '/admin/nieruchomosci', '/admin/platnosci', '/admin/portal',
    '/admin/ridomarket', '/admin/system-alerts', '/admin/uslugi', '/ai-pro', '/aktywacja', '/auth',
    '/buy-credits', '/cennik', '/cookies', '/dodaj', '/dodaj-ogloszenie', '/driver', '/driver/register',
    '/easy', '/easy/login', '/easy/register', '/email-confirmed', '/faktury', '/fleet', '/fleet/aktywacja',
    '/fleet/dashboard', '/fleet/rejestracja', '/fleet/rejestracja-sukces', '/gielda', '/gielda/dodaj-pojazd',
    '/gielda/logowanie', '/gielda/panel', '/gielda/porownaj', '/gielda/rejestracja', '/handlowiec', '/install',
    '/jak-zaczac', '/kierowca-info', '/kierowca/aktywacja', '/klient', '/kontakt', '/ksiegowosc',
    '/ksiegowosc-info', '/mail', '/mapa', '/mapy', '/marketplace', '/marketplace/cart', '/marketplace/compare',
    '/marketplace/dodaj', '/marketplace/wishlist', '/meetings', '/moje-ogladania', '/nieruchomosci',
    '/nieruchomosci/agent/panel', '/nieruchomosci/agent/rejestracja', '/nieruchomosci/porownaj', '/oferta',
    '/payment/cancel', '/payment/success', '/polityka-prywatnosci', '/pracownik-warsztat', '/prawne',
    '/register-success', '/regulamin', '/reset-password', '/rido-ai', '/rodo', '/sprzedaz',
    '/ubezpieczenia/panel', '/ubezpieczenia/rejestracja', '/uslugi', '/uslugi/panel', '/usuwanie-danych',
    '/warsztat-info', '/warsztat/sms', '/workflow', '/wynajem', '/wyniki'];

  return { kontrola, omiec, szukaj, idz, TRASY, SZEROKOSC };
})();

console.log('pomiarMobilny gotowy. Najpierw: await pomiarMobilny.kontrola()');

import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { FileText, Shield, ScrollText, Cookie, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Footer from "@/components/Footer";

type TabKey = "polityka" | "rodo" | "regulamin" | "cookies";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "polityka", label: "Polityka Prywatności", icon: <FileText className="w-4 h-4" /> },
  { key: "rodo", label: "RODO", icon: <Shield className="w-4 h-4" /> },
  { key: "regulamin", label: "Regulamin", icon: <ScrollText className="w-4 h-4" /> },
  { key: "cookies", label: "Cookies 🍪", icon: <Cookie className="w-4 h-4" /> },
];

const LegalPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>("polityka");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey;
    if (tab && tabs.some(t => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setIsOpen(false);
  };

  const activeTabData = tabs.find(t => t.key === activeTab);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="Get RIDO Logo" 
                className="h-10 w-10"
              />
              <span className="text-2xl font-bold">GetRido</span>
            </Link>
            <img 
              src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" 
              alt="RIDO Mascot" 
              className="h-16 w-16 object-contain"
            />
          </div>
        </div>

        {/* Tab Bar */}
        <div className="border-t border-primary-foreground/20">
          <div className="container mx-auto px-4">
            {/* Desktop tabs */}
            <div className="hidden md:flex gap-2 py-3">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-white text-primary shadow-md"
                      : "bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Mobile collapsible */}
            <div className="md:hidden py-3">
              <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 bg-white text-primary rounded-lg font-medium">
                  <span className="flex items-center gap-2">
                    {activeTabData?.icon}
                    {activeTabData?.label}
                  </span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-1">
                  {tabs.filter(t => t.key !== activeTab).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(tab.key)}
                      className="flex items-center gap-2 w-full px-4 py-3 bg-primary-foreground/10 text-primary-foreground rounded-lg font-medium hover:bg-primary-foreground/20 transition-all"
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto bg-card rounded-xl shadow-lg p-6 md:p-10">
          {activeTab === "polityka" && <PolitykaContent />}
          {activeTab === "rodo" && <RodoContent />}
          {activeTab === "regulamin" && <RegulaminContent />}
          {activeTab === "cookies" && <CookiesContent />}
        </div>
      </main>

      <Footer />
    </div>
  );
};

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-xl font-bold text-foreground mt-8 mb-4 border-b border-border pb-2">
    {children}
  </h2>
);

const SubSection = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="mb-4">
    {title && <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>}
    <div className="text-muted-foreground leading-relaxed">{children}</div>
  </div>
);

const AdminInfo = () => (
  <div className="bg-muted/50 rounded-lg p-4 my-4 text-sm">
    <p className="font-semibold text-foreground">CAR4RIDE SP. Z O.O.</p>
    <p>ul. Borsucza 13</p>
    <p>02-213 Warszawa</p>
    <p>NIP: 5223252793</p>
    <p>REGON: 524746171</p>
    <p>KRS: 0001025395</p>
    <p className="mt-2">
      Kontakt: <a href="mailto:rodo@getrido.pl" className="text-primary hover:underline">rodo@getrido.pl</a>
    </p>
  </div>
);

const PolitykaContent = () => (
  <div>
    <div className="text-center mb-8">
      <span className="text-4xl">🔐</span>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-2">POLITYKA PRYWATNOŚCI</h1>
      <p className="text-muted-foreground mt-1">Platforma GetRido</p>
    </div>

    <SectionTitle>1. Informacje ogólne</SectionTitle>
    <SubSection>
      <p>Niniejsza Polityka Prywatności określa zasady przetwarzania danych osobowych użytkowników platformy GetRido, w tym portalu motoryzacyjnego, giełdy pojazdów, aukcji, wynajmu, leasingu, cesji, portalu nieruchomości oraz usług powiązanych.</p>
      <p className="mt-2">Administratorem danych osobowych jest:</p>
      <AdminInfo />
    </SubSection>

    <SectionTitle>2. Jakie dane zbieramy</SectionTitle>
    <SubSection>
      <p>W zależności od sposobu korzystania z platformy możemy przetwarzać następujące dane:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>imię i nazwisko</li>
        <li>nazwa firmy</li>
        <li>adres e-mail</li>
        <li>numer telefonu</li>
        <li>adres korespondencyjny</li>
        <li>dane rozliczeniowe</li>
        <li>dane pojazdów (w tym VIN, numer rejestracyjny, zdjęcia, historia)</li>
        <li>dane nieruchomości (oferty, zdjęcia, dane właściciela lub pośrednika)</li>
        <li>dokumenty (prawo jazdy, dokumenty tożsamości, dokumenty umowne)</li>
        <li>dane dotyczące transakcji i płatności</li>
        <li>adres IP i dane techniczne</li>
        <li>historia aktywności w systemie</li>
      </ul>
    </SubSection>

    <SectionTitle>3. Cele przetwarzania danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe przetwarzane są w celu:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>korzystania z funkcjonalności platformy GetRido</li>
        <li>zawierania i realizacji umów sprzedaży, wynajmu, leasingu, cesji i usług</li>
        <li>obsługi aukcji pojazdów i nieruchomości</li>
        <li>weryfikacji użytkowników</li>
        <li>umożliwienia kontaktu pomiędzy stronami transakcji</li>
        <li>prowadzenia historii pojazdów, nieruchomości i kontrahentów</li>
        <li>realizacji obowiązków prawnych i księgowych</li>
        <li>poprawy jakości usług i bezpieczeństwa platformy</li>
        <li>prowadzenia komunikacji transakcyjnej</li>
        <li>działań marketingowych Administratora (po wyrażeniu zgody)</li>
      </ul>
    </SubSection>

    <SectionTitle>4. Podstawa prawna przetwarzania</SectionTitle>
    <SubSection>
      <p>Dane osobowe przetwarzane są zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO), w szczególności na podstawie:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>wykonania umowy</li>
        <li>obowiązków prawnych Administratora</li>
        <li>prawnie uzasadnionego interesu Administratora</li>
        <li>zgody użytkownika</li>
      </ul>
    </SubSection>

    <SectionTitle>5. Przekazywanie danych innym użytkownikom</SectionTitle>
    <SubSection>
      <p>W ramach korzystania z platformy dane użytkownika mogą być przekazywane innym użytkownikom wyłącznie w zakresie niezbędnym do realizacji konkretnej transakcji lub umowy, w szczególności pomiędzy kupującym i sprzedawcą, wynajmującym i najemcą, kierowcą i flotą, ubezpieczycielem i warsztatem.</p>
    </SubSection>

    <SectionTitle>6. Marketing i komunikacja</SectionTitle>
    <SubSection>
      <p>Administrator może kontaktować się z użytkownikiem w sprawach związanych z funkcjonowaniem platformy, realizacją umów i bezpieczeństwem.</p>
      <p className="mt-2">Działania marketingowe, w tym wysyłka informacji handlowych drogą elektroniczną lub SMS, odbywają się wyłącznie po wyrażeniu zgody przez użytkownika. Zgoda ta może być w każdej chwili cofnięta.</p>
    </SubSection>

    <SectionTitle>7. Okres przechowywania danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe przechowywane są:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>przez czas trwania umowy</li>
        <li>po jej zakończeniu przez okres wymagany przepisami prawa</li>
        <li>w przypadku danych marketingowych – do momentu cofnięcia zgody</li>
      </ul>
    </SubSection>

    <SectionTitle>8. Odbiorcy danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe mogą być przekazywane podmiotom współpracującym z Administratorem, w szczególności dostawcom usług IT, hostingowych, płatniczych, księgowych i prawnych, wyłącznie w zakresie niezbędnym do realizacji usług.</p>
    </SubSection>

    <SectionTitle>9. Bezpieczeństwo danych</SectionTitle>
    <SubSection>
      <p>Administrator stosuje odpowiednie środki techniczne i organizacyjne w celu ochrony danych osobowych, w tym zabezpieczenia serwerów, szyfrowanie danych, kontrolę dostępu oraz regularne kopie zapasowe.</p>
    </SubSection>

    <SectionTitle>10. Prawa użytkownika</SectionTitle>
    <SubSection>
      <p>Każdy użytkownik ma prawo do:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>dostępu do swoich danych</li>
        <li>ich sprostowania</li>
        <li>usunięcia</li>
        <li>ograniczenia przetwarzania</li>
        <li>przenoszenia danych</li>
        <li>wniesienia sprzeciwu</li>
        <li>cofnięcia zgody w dowolnym momencie</li>
        <li>złożenia skargi do Prezesa Urzędu Ochrony Danych Osobowych</li>
      </ul>
    </SubSection>

    <SectionTitle>11. Zmiany Polityki Prywatności</SectionTitle>
    <SubSection>
      <p>Administrator zastrzega sobie prawo do wprowadzania zmian w niniejszej Polityce Prywatności. Aktualna wersja dokumentu jest zawsze dostępna na platformie GetRido.</p>
    </SubSection>
  </div>
);

const RodoContent = () => (
  <div>
    <div className="text-center mb-8">
      <span className="text-4xl">🛡️</span>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-2">RODO</h1>
      <p className="text-muted-foreground mt-1">Informacje o przetwarzaniu danych osobowych</p>
    </div>

    <SectionTitle>1. Administrator danych osobowych</SectionTitle>
    <SubSection>
      <p>Administratorem danych osobowych jest:</p>
      <AdminInfo />
      <p className="mt-2">Spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, województwo mazowieckie, dzielnica Włochy.</p>
    </SubSection>

    <SectionTitle>2. Zakres przetwarzanych danych</SectionTitle>
    <SubSection>
      <p>Administrator przetwarza dane osobowe użytkowników platformy GetRido, w zależności od pełnionej roli (klient, sprzedawca, wynajmujący, kierowca, flota, partner biznesowy, warsztat, ubezpieczyciel, użytkownik portalu nieruchomości).</p>
    </SubSection>

    <SubSection title="2.1 Dane identyfikacyjne">
      <ul className="list-disc list-inside space-y-1">
        <li>imię i nazwisko</li>
        <li>nazwa firmy</li>
        <li>numer NIP, REGON, KRS</li>
        <li>data urodzenia</li>
      </ul>
    </SubSection>

    <SubSection title="2.2 Dane kontaktowe">
      <ul className="list-disc list-inside space-y-1">
        <li>adres e-mail</li>
        <li>numer telefonu</li>
        <li>adres korespondencyjny</li>
      </ul>
    </SubSection>

    <SubSection title="2.3 Dane dotyczące pojazdów">
      <ul className="list-disc list-inside space-y-1">
        <li>numer VIN</li>
        <li>numer rejestracyjny</li>
        <li>marka, model, rok produkcji</li>
        <li>historia pojazdu</li>
        <li>zdjęcia pojazdu</li>
        <li>informacje o szkodach, naprawach, aukcjach, wynajmach i sprzedaży</li>
      </ul>
    </SubSection>

    <SubSection title="2.4 Dane dotyczące nieruchomości">
      <ul className="list-disc list-inside space-y-1">
        <li>dane ofertowe nieruchomości</li>
        <li>dane właściciela lub pośrednika</li>
        <li>dokumentacja ofertowa i zdjęciowa</li>
        <li>historia transakcji i zapytań</li>
      </ul>
    </SubSection>

    <SubSection title="2.5 Dokumenty">
      <ul className="list-disc list-inside space-y-1">
        <li>prawo jazdy</li>
        <li>dowód osobisty lub paszport</li>
        <li>dokumenty flotowe</li>
        <li>dokumenty ubezpieczeniowe</li>
        <li>umowy i protokoły</li>
      </ul>
    </SubSection>

    <SubSection title="2.6 Dane finansowe">
      <ul className="list-disc list-inside space-y-1">
        <li>dane do fakturowania</li>
        <li>informacje o płatnościach</li>
        <li>harmonogramy rat, wykupu lub wynajmu</li>
      </ul>
    </SubSection>

    <SubSection title="2.7 Dane techniczne i systemowe">
      <ul className="list-disc list-inside space-y-1">
        <li>adres IP</li>
        <li>dane logowania</li>
        <li>logi aktywności</li>
        <li>historia zgód</li>
        <li>dane statystyczne i analityczne</li>
      </ul>
    </SubSection>

    <SectionTitle>3. Cele przetwarzania danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe są przetwarzane w celu:</p>
      <ol className="list-decimal list-inside mt-2 space-y-1">
        <li>zawarcia i realizacji umów sprzedaży, wynajmu, leasingu, cesji oraz usług</li>
        <li>obsługi aukcji pojazdów, w tym pojazdów uszkodzonych i powypadkowych</li>
        <li>prowadzenia giełdy pojazdów i nieruchomości</li>
        <li>weryfikacji tożsamości użytkowników</li>
        <li>umożliwienia wymiany danych pomiędzy stronami umów</li>
        <li>prowadzenia historii pojazdów, nieruchomości i kontrahentów</li>
        <li>realizacji obowiązków księgowych i podatkowych</li>
        <li>prowadzenia systemu ocen i reputacji użytkowników, pojazdów i usług</li>
        <li>zapewnienia bezpieczeństwa transakcji i przeciwdziałania nadużyciom</li>
        <li>komunikacji transakcyjnej</li>
        <li>marketingu własnych usług Administratora (po uzyskaniu zgody)</li>
        <li>marketingu usług spółek powiązanych (po uzyskaniu odrębnej zgody)</li>
      </ol>
    </SubSection>

    <SectionTitle>4. Podstawa prawna przetwarzania danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe przetwarzane są na podstawie:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>art. 6 ust. 1 lit. b RODO – wykonanie umowy</li>
        <li>art. 6 ust. 1 lit. c RODO – obowiązek prawny</li>
        <li>art. 6 ust. 1 lit. f RODO – prawnie uzasadniony interes Administratora</li>
        <li>art. 6 ust. 1 lit. a RODO – zgoda użytkownika</li>
      </ul>
      <p className="mt-2">W przypadku dokumentów tożsamości – na podstawie wyraźnej zgody użytkownika oraz w celu zabezpieczenia interesów stron umów.</p>
    </SubSection>

    <SectionTitle>5. Przekazywanie danych pomiędzy użytkownikami platformy</SectionTitle>
    <SubSection>
      <p>Użytkownik wyraża zgodę na przekazywanie jego danych innym użytkownikom platformy GetRido wyłącznie w zakresie niezbędnym do realizacji konkretnej transakcji lub umowy, w szczególności pomiędzy:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>kupującym a sprzedawcą</li>
        <li>wynajmującym a najemcą</li>
        <li>kierowcą a flotą</li>
        <li>ubezpieczycielem a warsztatem</li>
        <li>stronami aukcji pojazdów</li>
      </ul>
      <p className="mt-2">Zakres przekazywanych danych jest każdorazowo ograniczony do minimum niezbędnego do realizacji celu.</p>
    </SubSection>

    <SectionTitle>6. Marketing i komunikacja</SectionTitle>
    <SubSection title="6.1 Komunikacja transakcyjna">
      <p>Administrator może kontaktować się z użytkownikiem bez dodatkowej zgody w sprawach związanych z realizacją umów, bezpieczeństwem, płatnościami oraz funkcjonowaniem platformy.</p>
    </SubSection>
    <SubSection title="6.2 Marketing Administratora">
      <p>Po wyrażeniu zgody Administrator może prowadzić marketing własnych usług za pomocą:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>poczty elektronicznej</li>
        <li>wiadomości SMS</li>
        <li>powiadomień systemowych</li>
      </ul>
    </SubSection>
    <SubSection title="6.3 Marketing spółek powiązanych">
      <p>Marketing usług innych spółek powiązanych z Administratorem odbywa się wyłącznie po uzyskaniu odrębnej, dobrowolnej zgody użytkownika.</p>
      <p className="mt-2">Zgody marketingowe mogą być w każdej chwili cofnięte.</p>
    </SubSection>

    <SectionTitle>7. System ocen i reputacji</SectionTitle>
    <SubSection>
      <p>Administrator prowadzi system ocen użytkowników, pojazdów, nieruchomości i usług, obejmujący historię współpracy, rzetelność oraz terminowość realizacji zobowiązań. System ten stanowi prawnie uzasadniony interes Administratora i służy zwiększeniu bezpieczeństwa platformy.</p>
    </SubSection>

    <SectionTitle>8. Okres przechowywania danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe przechowywane są:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>przez okres trwania umowy</li>
        <li>po zakończeniu umowy przez okres wymagany przepisami prawa</li>
        <li>dane marketingowe do momentu cofnięcia zgody</li>
        <li>dokumenty identyfikacyjne nie dłużej niż jest to niezbędne do realizacji celu</li>
      </ul>
    </SubSection>

    <SectionTitle>9. Odbiorcy danych</SectionTitle>
    <SubSection>
      <p>Dane osobowe mogą być przekazywane:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>podmiotom świadczącym usługi hostingowe (serwery na terenie UE)</li>
        <li>operatorom płatności</li>
        <li>kancelariom prawnym i księgowym</li>
        <li>partnerom platformy w zakresie realizacji usług</li>
        <li>organom publicznym, jeżeli wymagają tego przepisy prawa</li>
      </ul>
    </SubSection>

    <SectionTitle>10. Bezpieczeństwo danych</SectionTitle>
    <SubSection>
      <p>Administrator stosuje odpowiednie środki techniczne i organizacyjne, w tym:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>szyfrowanie danych</li>
        <li>kontrolę dostępu opartą na rolach</li>
        <li>rejestrację dostępu do danych</li>
        <li>zabezpieczenia serwerowe</li>
        <li>regularne kopie zapasowe</li>
      </ul>
    </SubSection>

    <SectionTitle>11. Prawa użytkownika</SectionTitle>
    <SubSection>
      <p>Użytkownik ma prawo do:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>dostępu do swoich danych</li>
        <li>ich sprostowania</li>
        <li>usunięcia</li>
        <li>ograniczenia przetwarzania</li>
        <li>przenoszenia danych</li>
        <li>wniesienia sprzeciwu</li>
        <li>cofnięcia zgody w dowolnym momencie</li>
        <li>wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych</li>
      </ul>
    </SubSection>

    <SectionTitle>12. Zmiany polityki prywatności</SectionTitle>
    <SubSection>
      <p>Administrator zastrzega sobie prawo do wprowadzania zmian w niniejszej Polityce Prywatności. Aktualna wersja dokumentu będzie każdorazowo dostępna na platformie GetRido.</p>
    </SubSection>
  </div>
);

const RegulaminContent = () => (
  <div>
    <div className="text-center mb-8">
      <span className="text-4xl">📜</span>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-2">REGULAMIN PLATFORMY GETRIDO</h1>
    </div>

    <SectionTitle>§1. Informacje ogólne</SectionTitle>
    <SubSection>
      <p>Niniejszy Regulamin określa zasady korzystania z platformy internetowej GetRido, prowadzonej przez CAR4RIDE SP. Z O.O. z siedzibą przy ul. Borsucza 13, 02-213 Warszawa, NIP: 5223252793, REGON: 524746171, KRS: 0001025395.</p>
      <p className="mt-2">Platforma GetRido umożliwia w szczególności:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>publikowanie ogłoszeń pojazdów i nieruchomości,</li>
        <li>sprzedaż i zakup pojazdów,</li>
        <li>wynajem pojazdów (krótko- i długoterminowy, w tym pod taxi),</li>
        <li>wynajem z wykupem,</li>
        <li>cesje leasingu,</li>
        <li>aukcje pojazdów, w tym pojazdów uszkodzonych i powypadkowych,</li>
        <li>świadczenie i zamawianie usług motoryzacyjnych oraz innych usług,</li>
        <li>komunikację pomiędzy użytkownikami platformy.</li>
      </ul>
      <p className="mt-2">Regulamin jest wiążący dla wszystkich użytkowników platformy.</p>
    </SubSection>

    <SectionTitle>§2. Definicje</SectionTitle>
    <SubSection>
      <ul className="space-y-2">
        <li><strong>Administrator</strong> – CAR4RIDE SP. Z O.O.</li>
        <li><strong>Platforma</strong> – system internetowy GetRido.</li>
        <li><strong>Użytkownik</strong> – osoba fizyczna lub prawna korzystająca z Platformy.</li>
        <li><strong>Klient</strong> – użytkownik korzystający z ofert sprzedaży, wynajmu lub usług.</li>
        <li><strong>Sprzedawca / Wynajmujący</strong> – użytkownik publikujący ogłoszenia pojazdów, nieruchomości lub usług.</li>
        <li><strong>Flota</strong> – użytkownik prowadzący działalność w zakresie wynajmu lub zarządzania pojazdami.</li>
        <li><strong>Aukcja</strong> – tryb sprzedaży pojazdu, w którym cena ustalana jest w drodze licytacji.</li>
        <li><strong>Cena minimalna</strong> – minimalna cena ustalona przez wystawiającego, której osiągnięcie warunkuje sprzedaż pojazdu.</li>
        <li><strong>Umowa</strong> – umowa zawierana pomiędzy użytkownikami za pośrednictwem Platformy.</li>
      </ul>
    </SubSection>

    <SectionTitle>§3. Rejestracja i konto użytkownika</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Korzystanie z pełnej funkcjonalności Platformy wymaga rejestracji konta.</li>
        <li>Użytkownik zobowiązany jest do podania prawdziwych i aktualnych danych.</li>
        <li>Administrator może weryfikować tożsamość użytkowników, w tym żądać dokumentów potwierdzających dane.</li>
        <li>Każdy użytkownik ponosi odpowiedzialność za działania wykonane z użyciem swojego konta.</li>
      </ol>
    </SubSection>

    <SectionTitle>§4. Ogłoszenia i oferty</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Użytkownik może publikować ogłoszenia pojazdów, nieruchomości i usług zgodnie z profilem działalności.</li>
        <li>Ogłoszenia podstawowe są bezpłatne, o ile Platforma nie stanowi inaczej.</li>
        <li>Administrator może oferować płatne opcje dodatkowe, w szczególności wyróżnienia ogłoszeń lub aukcji.</li>
        <li>Użytkownik ponosi pełną odpowiedzialność za treść ogłoszeń, w tym ich zgodność z prawem i stanem faktycznym.</li>
        <li>Zabronione jest publikowanie treści nieprawdziwych, wprowadzających w błąd lub naruszających prawa osób trzecich.</li>
      </ol>
    </SubSection>

    <SectionTitle>§5. Aukcje pojazdów</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Aukcje mogą być organizowane przez sprzedawców, floty, ubezpieczycieli lub inne uprawnione podmioty.</li>
        <li>Wystawiający może ustalić cenę minimalną, która nie jest jawna dla licytujących.</li>
        <li>Jeżeli najwyższa oferta osiągnie lub przekroczy cenę minimalną, pojazd zostaje sprzedany.</li>
        <li>Jeżeli cena minimalna nie zostanie osiągnięta, aukcja kończy się bez sprzedaży.</li>
        <li>Oferty złożone w aukcji są wiążące.</li>
        <li>Administrator nie jest stroną umowy sprzedaży zawieranej w wyniku aukcji.</li>
      </ol>
    </SubSection>

    <SectionTitle>§6. Wynajem, leasing i cesje</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Platforma umożliwia zawieranie umów wynajmu, leasingu, wynajmu z wykupem oraz cesji leasingu.</li>
        <li>Warunki umów ustalane są pomiędzy użytkownikami.</li>
        <li>Administrator może udostępniać narzędzia do generowania dokumentów, podpisów i archiwizacji umów.</li>
        <li>Administrator nie ponosi odpowiedzialności za niewykonanie lub nienależyte wykonanie umów pomiędzy użytkownikami.</li>
      </ol>
    </SubSection>

    <SectionTitle>§7. Portal nieruchomości</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Platforma umożliwia publikację ofert nieruchomości w modelu zbliżonym do portali ogłoszeniowych.</li>
        <li>Administrator nie jest pośrednikiem w obrocie nieruchomościami.</li>
        <li>Odpowiedzialność za treść ofert ponosi użytkownik publikujący ogłoszenie.</li>
      </ol>
    </SubSection>

    <SectionTitle>§8. Usługi i marketplace</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Użytkownicy mogą oferować i zamawiać usługi za pośrednictwem Platformy.</li>
        <li>Administrator może umożliwiać sprzedaż produktów i usług w ramach marketplace.</li>
        <li>Umowy zawierane są bezpośrednio pomiędzy użytkownikami.</li>
      </ol>
    </SubSection>

    <SectionTitle>§9. Odpowiedzialność</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Administrator nie odpowiada za działania użytkowników ani za treść publikowanych ogłoszeń.</li>
        <li>Administrator nie ponosi odpowiedzialności za szkody wynikające z realizacji umów pomiędzy użytkownikami.</li>
        <li>Administrator może usuwać treści naruszające Regulamin lub prawo.</li>
      </ol>
    </SubSection>

    <SectionTitle>§10. Dane osobowe</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Dane osobowe przetwarzane są zgodnie z Polityką Prywatności Platformy.</li>
        <li>Użytkownik wyraża zgodę na przekazywanie danych innym użytkownikom w zakresie niezbędnym do realizacji transakcji.</li>
      </ol>
    </SubSection>

    <SectionTitle>§11. Zawieszenie i usunięcie konta</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Administrator może zawiesić lub usunąć konto użytkownika w przypadku naruszenia Regulaminu.</li>
        <li>Użytkownik może w każdej chwili usunąć konto, z zastrzeżeniem obowiązków wynikających z zawartych umów.</li>
      </ol>
    </SubSection>

    <SectionTitle>§12. Zmiany Regulaminu</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Administrator zastrzega sobie prawo do zmiany Regulaminu.</li>
        <li>Zmiany wchodzą w życie po ich opublikowaniu na Platformie.</li>
      </ol>
    </SubSection>

    <SectionTitle>§13. Postanowienia końcowe</SectionTitle>
    <SubSection>
      <ol className="list-decimal list-inside space-y-1">
        <li>Regulamin podlega prawu polskiemu.</li>
        <li>Wszelkie spory rozstrzygane będą przez sąd właściwy dla siedziby Administratora.</li>
        <li>Regulamin obowiązuje od dnia publikacji na Platformie GetRido.</li>
      </ol>
    </SubSection>
  </div>
);

const CookiesContent = () => (
  <div>
    <div className="text-center mb-8">
      <span className="text-4xl">🍪</span>
      <h1 className="text-2xl md:text-3xl font-bold text-foreground mt-2">POLITYKA COOKIES</h1>
      <p className="text-muted-foreground mt-1">Platforma GetRido</p>
    </div>

    <SectionTitle>1. Informacje ogólne</SectionTitle>
    <SubSection>
      <p>Niniejsza Polityka Cookies określa zasady wykorzystywania plików cookies oraz podobnych technologii na platformie internetowej GetRido, prowadzonej przez CAR4RIDE SP. Z O.O. z siedzibą przy ul. Borsucza 13, 02-213 Warszawa, NIP: 5223252793, REGON: 524746171, KRS: 0001025395.</p>
    </SubSection>

    <SectionTitle>2. Czym są pliki cookies</SectionTitle>
    <SubSection>
      <p>Pliki cookies to niewielkie pliki tekstowe zapisywane na urządzeniu końcowym użytkownika (komputer, tablet, smartfon) podczas korzystania z serwisów internetowych. Cookies umożliwiają prawidłowe działanie serwisu, jego optymalizację oraz analizę sposobu korzystania z platformy.</p>
    </SubSection>

    <SectionTitle>3. Rodzaje wykorzystywanych cookies</SectionTitle>
    <SubSection>
      <p>Platforma GetRido wykorzystuje następujące rodzaje plików cookies:</p>
    </SubSection>

    <SubSection title="3.1 Cookies niezbędne">
      <p>Pliki cookies niezbędne do prawidłowego funkcjonowania platformy, w szczególności do:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>logowania i utrzymania sesji użytkownika,</li>
        <li>zapewnienia bezpieczeństwa,</li>
        <li>realizacji podstawowych funkcji platformy.</li>
      </ul>
      <p className="mt-2">Te pliki cookies są wykorzystywane automatycznie i nie wymagają zgody użytkownika.</p>
    </SubSection>

    <SubSection title="3.2 Cookies funkcjonalne">
      <p>Pliki cookies umożliwiające zapamiętywanie preferencji użytkownika, takich jak:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>ustawienia języka,</li>
        <li>ustawienia konta,</li>
        <li>personalizacja interfejsu.</li>
      </ul>
    </SubSection>

    <SubSection title="3.3 Cookies analityczne">
      <p>Pliki cookies wykorzystywane w celu:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>analizowania statystyk korzystania z platformy,</li>
        <li>poprawy funkcjonalności i wydajności serwisu,</li>
        <li>optymalizacji treści.</li>
      </ul>
      <p className="mt-2">Dane zbierane w ramach cookies analitycznych mają charakter zbiorczy i anonimowy.</p>
    </SubSection>

    <SubSection title="3.4 Cookies marketingowe">
      <p>Pliki cookies wykorzystywane w celu:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>prowadzenia działań marketingowych Administratora,</li>
        <li>prezentowania dopasowanych treści i reklam,</li>
        <li>mierzenia skuteczności kampanii reklamowych.</li>
      </ul>
      <p className="mt-2">Cookies marketingowe są wykorzystywane wyłącznie po uzyskaniu zgody użytkownika.</p>
    </SubSection>

    <SectionTitle>4. Zgoda na cookies</SectionTitle>
    <SubSection>
      <p>Podczas pierwszej wizyty na platformie użytkownik jest informowany o wykorzystywaniu plików cookies oraz ma możliwość:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>zaakceptowania wszystkich cookies,</li>
        <li>odrzucenia cookies opcjonalnych,</li>
        <li>zarządzania ustawieniami cookies.</li>
      </ul>
      <p className="mt-2">Zgoda na cookies może być w każdej chwili cofnięta lub zmieniona poprzez ustawienia przeglądarki lub mechanizm zarządzania cookies dostępny na platformie.</p>
    </SubSection>

    <SectionTitle>5. Zarządzanie cookies</SectionTitle>
    <SubSection>
      <p>Użytkownik może samodzielnie zarządzać plikami cookies poprzez ustawienia swojej przeglądarki internetowej. Ograniczenie stosowania cookies może wpłynąć na niektóre funkcjonalności platformy GetRido.</p>
    </SubSection>

    <SectionTitle>6. Cookies podmiotów trzecich</SectionTitle>
    <SubSection>
      <p>Platforma GetRido może korzystać z plików cookies pochodzących od podmiotów trzecich, w szczególności dostawców narzędzi analitycznych, reklamowych oraz technologicznych, wyłącznie w zakresie zgodnym z obowiązującymi przepisami prawa.</p>
    </SubSection>

    <SectionTitle>7. Okres przechowywania cookies</SectionTitle>
    <SubSection>
      <p>Pliki cookies mogą być:</p>
      <ul className="list-disc list-inside mt-2 space-y-1">
        <li>sesyjne – usuwane po zamknięciu przeglądarki,</li>
        <li>trwałe – przechowywane przez określony czas lub do momentu ich usunięcia przez użytkownika.</li>
      </ul>
    </SubSection>

    <SectionTitle>8. Zmiany Polityki Cookies</SectionTitle>
    <SubSection>
      <p>Administrator zastrzega sobie prawo do zmiany niniejszej Polityki Cookies. Aktualna wersja dokumentu jest każdorazowo dostępna na platformie GetRido.</p>
    </SubSection>

    <SectionTitle>9. Kontakt</SectionTitle>
    <SubSection>
      <p>W sprawach związanych z plikami cookies oraz ochroną danych osobowych użytkownik może skontaktować się z Administratorem pod adresem e-mail:</p>
      <p className="mt-2">
        <a href="mailto:rodo@getrido.pl" className="text-primary font-semibold hover:underline">rodo@getrido.pl</a>
      </p>
    </SubSection>
  </div>
);

export default LegalPage;

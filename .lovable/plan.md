
# Plan naprawy zgłoszonych problemów

## Podsumowanie problemów

### 1. Wylogowanie nie działa poprawnie
Niektóre dashboardy (AdminDashboard, AdminRealEstate) mają funkcję `handleLogout` która tylko przekierowuje na stronę główną bez faktycznego wylogowania z Supabase (`supabase.auth.signOut()`).

**Pliki do naprawy:**
- `src/pages/AdminDashboard.tsx` - linia 124-126
- `src/pages/AdminRealEstate.tsx` - linia 205-207

### 2. Daniel Madziar nie widoczny w rozliczeniach
Sprawdziłem bazę danych i znalazłem przyczynę:
- W bazie są rozliczenia dla 30 kierowców za tydzień 19-25 stycznia
- Daniel Madziar NIE MA rekordu w tabeli `settlements` za ten tydzień
- Jego ostatnie rozliczenie jest za tydzień 12-18 stycznia

**Wniosek:** Dane Daniela Madziar nie zostały zaimportowane z pliku CSV za tydzień 19-25 stycznia. Sprawdź plik CSV - jego dane mogły zostać pominięte podczas importu (np. jego identyfikator/email mógł nie pasować).

### 3. Kalendarz dla handlowca - brak implementacji
Zakładka "Kalendarz" w `SalesPortal.tsx` pokazuje placeholder "w trakcie implementacji". Trzeba stworzyć komponent `SalesCalendar` z funkcjonalnością:
- Wyświetlanie zaplanowanych połączeń (z tabeli `sales_lead_callbacks`)
- Możliwość dodawania nowych wydarzeń/spotkań
- Widok dzień/tydzień/miesiąc

**Pliki do utworzenia:**
- `src/components/sales/SalesCalendar.tsx`

**Pliki do modyfikacji:**
- `src/pages/SalesPortal.tsx` - zamień placeholder na komponent kalendarza

### 4. Stylowanie portalu sprzedaży
Portal sprzedaży (`SalesPortal.tsx`) używa innych stylów niż portal kierowcy:

| Element | Portal Sprzedaży (obecnie) | Portal Kierowcy (docelowy) |
|---------|---------------------------|---------------------------|
| Tło strony | `bg-background` | `bg-gradient-subtle` |
| Header | `bg-gradient-hero` | `bg-white border-b shadow-sm` |
| Kontener | brak stylów | `container mx-auto px-4 py-4` |

**Plik do modyfikacji:**
- `src/pages/SalesPortal.tsx` - dostosować style do portalu kierowcy

### 5. Rozmowa z ChatGPT
Tak, możesz skopiować rozmowę z ChatGPT! Wklej ją w następnej wiadomości, a przeanalizuję szczegóły nowej funkcji i przygotuję plan implementacji.

---

## Szczegóły techniczne

### Naprawa wylogowania

```typescript
// AdminDashboard.tsx i AdminRealEstate.tsx
const handleLogout = async () => {
  await supabase.auth.signOut();
  navigate('/auth');
};
```

### Komponent SalesCalendar

Nowy komponent będzie zawierał:
- Widok kalendarza miesięcznego z zaznaczonymi dniami z zaplanowanymi połączeniami
- Listę wydarzeń na wybrany dzień
- Integrację z `sales_lead_callbacks` - automatyczne ładowanie zaplanowanych oddzwonień
- Możliwość dodawania notatek/spotkań

### Stylowanie SalesPortal

Zmiana nagłówka i kontenera aby pasowały do stylu Driver Portal:
- Biały nagłówek z cieniem
- Przycisk "Motoryzacja" jak w portalu kierowcy
- TabsPill zamiast standardowych Tabs

---

## Lista plików do modyfikacji

1. `src/pages/AdminDashboard.tsx` - poprawka logout
2. `src/pages/AdminRealEstate.tsx` - poprawka logout
3. `src/pages/SalesPortal.tsx` - style + kalendarz
4. `src/components/sales/SalesCalendar.tsx` - NOWY

## Czy zatwierdzasz ten plan?

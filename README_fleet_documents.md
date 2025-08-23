# RIDO - Moduły Floty i Dokumentów

## Przegląd

Zostały dodane dwa nowe moduły do panelu administratora RIDO:

### 🚗 Flota
- Zarządzanie pojazdami (CRUD)
- Śledzenie przeglądów i polis ubezpieczeniowych
- Historia przypisań kierowców
- Zarządzanie naprawami i szkodami
- Powiadomienia o zbliżających się terminach

### 📄 Dokumenty
- Biblioteka szablonów DOCX
- Generator dokumentów (umowy, protokoły, RODO)
- Automatyczne wypełnianie placeholderów
- Generowanie PDF z szablonów
- Historia wygenerowanych dokumentów

## Struktura bazy danych

### Nowe tabele:
- `vehicles` - pojazdy
- `assignments` - przypisania kierowców do pojazdów
- `vehicle_policies` - polisy ubezpieczeniowe
- `vehicle_inspections` - przeglądy techniczne
- `vehicle_services` - naprawy i serwis
- `vehicle_damages` - szkody
- `document_templates` - szablony dokumentów DOCX
- `documents` - wygenerowane dokumenty
- `reminders` - przypomnienia o terminach

### Rozszerzone tabele:
- `drivers` - dodane pola: pesel, dl_number, dl_valid_to, address_*

## API Endpoints

### Flota
- `GET/POST /api/vehicles` - lista/dodaj pojazd
- `GET/PATCH/DELETE /api/vehicles/:id` - szczegóły/edytuj/usuń pojazd
- `GET /api/vehicles/:id/history` - historia przypisań kierowców
- `POST /api/vehicles/:id/policies` - dodaj polisę
- `POST /api/vehicles/:id/inspections` - dodaj przegląd

### Dokumenty
- `GET/POST /api/document-templates` - szablony
- `GET /api/documents` - lista dokumentów
- `POST /api/documents/generate` - generuj dokumenty

### Przypomnienia
- `GET /api/reminders` - lista przypomnień
- `POST /api/reminders/cron` - uruchom sprawdzanie terminów

## Instalacja i uruchomienie

### 1. Migracje bazy danych

Migracje zostały automatycznie dodane do Supabase. Po zatwierdzeniu przez użytkownika:

```bash
# Migracje uruchomią się automatycznie w Lovable/Supabase
```

### 2. Konfiguracja SMTP (opcjonalna)

Dodaj do zmiennych środowiskowych w Supabase:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="RIDO <no-reply@twojadomena.pl>"
```

### 3. Uruchomienie

Aplikacja uruchomi się automatycznie. Nowe zakładki "Flota" i "Dokumenty" będą dostępne w panelu administratora.

## Funkcje

### Generator dokumentów

1. **Wybór kierowcy i pojazdu**: Auto-uzupełnianie na podstawie danych
2. **Warunki umowy**: Stawka, kaucja, daty, limity
3. **Szczegóły wydania**: Miejsca, paliwo, uwagi
4. **Wybór szablonów**: Checkboxy dla różnych typów dokumentów

### Placeholdery w szablonach DOCX

System obsługuje następujące placeholdery:

**Kierowca (driver.*)**:
- `{driver.firstName}` - imię
- `{driver.lastName}` - nazwisko
- `{driver.pesel}` - PESEL
- `{driver.dlNumber}` - numer prawa jazdy
- `{driver.dlValidTo}` - data ważności prawa jazdy
- `{driver.addressStreet}` - ulica
- `{driver.addressCity}` - miasto
- `{driver.addressZip}` - kod pocztowy
- `{driver.phone}` - telefon
- `{driver.email}` - email

**Pojazd (vehicle.*)**:
- `{vehicle.brand}` - marka
- `{vehicle.model}` - model
- `{vehicle.year}` - rok produkcji
- `{vehicle.color}` - kolor
- `{vehicle.plate}` - rejestracja
- `{vehicle.vin}` - numer VIN
- `{vehicle.odometer}` - przebieg

**Umowa (rent.*)**:
- `{rent.weeklyPrice}` - stawka tygodniowa
- `{rent.deposit}` - kaucja
- `{rent.startDate}` - data rozpoczęcia
- `{rent.startTime}` - godzina rozpoczęcia
- `{rent.endDate}` - data zakończenia
- `{rent.endTime}` - godzina zakończenia
- `{rent.indefinite}` - umowa bezterminowa (bool)
- `{rent.limitKm}` - limit kilometrów
- `{rent.overKmRate}` - stawka za przekroczenie

**Wydanie/zwrot (handover.*)**:
- `{handover.placeOut}` - miejsce wydania
- `{handover.placeIn}` - miejsce zwrotu
- `{handover.fuelLevel}` - poziom paliwa
- `{handover.remarks}` - uwagi

### Przypomnienia i powiadomienia

System automatycznie:
- Sprawdza daty ważności polis i przeglądów
- Wysyła powiadomienia e-mail na 30/7/3/1 dzień przed terminem
- Tworzy wpisy w tabeli `reminders`
- Uruchamia się codziennie o 8:00 (cron job)

## Testowanie

### Checklist testów:

1. **Flota**:
   - [ ] Dodaj pojazd z datą przeglądu i polisy
   - [ ] Wejdź w szczegóły pojazdu → sprawdź zakładki
   - [ ] Dodaj przegląd/polisę/naprawę/szkodę
   - [ ] Sprawdź kolorowanie terminów (czerwone <7 dni, żółte <30 dni)

2. **Dokumenty**:
   - [ ] Przejdź do zakładki "Dokumenty"
   - [ ] Sprawdź listę szablonów
   - [ ] Użyj generatora: wybierz kierowcę i pojazd
   - [ ] Zaznacz "Umowa najmu" + "Protokół wydania"
   - [ ] Kliknij "Generuj"
   - [ ] Sprawdź listę wygenerowanych dokumentów

3. **Przypomnienia**:
   - [ ] Ustaw daty polisy/przeglądu na +7 dni
   - [ ] Wywołaj `/api/reminders/cron`
   - [ ] Sprawdź logi e-mail
   - [ ] Sprawdź wpisy w `reminders`

## Pliki i ścieżki

### Nowe komponenty frontend:
- `src/components/FleetManagement.tsx`
- `src/components/DocumentsManagement.tsx`

### Edge Functions (API):
- `supabase/functions/vehicles/index.ts`
- `supabase/functions/documents/index.ts`
- `supabase/functions/document-templates/index.ts`
- `supabase/functions/reminders/index.ts`

### Migracje:
- `supabase/migrations/*_add_fleet_and_documents_system.sql`

### Konfiguracja:
- `supabase/config.toml` - dodane funkcje
- `.env.example` - przykład konfiguracji SMTP

### Zmodyfikowane:
- `src/pages/AdminDashboard.tsx` - dodane zakładki Flota i Dokumenty

## Kolejne kroki

1. **Szablony DOCX**: Dodaj pierwsze szablony przez panel administratora
2. **Generator PDF**: Zaimplementuj konwersję DOCX → PDF
3. **Powiadomienia**: Skonfiguruj SMTP dla powiadomień e-mail
4. **Autoryzacja**: Dodaj role i uprawnienia dla różnych typów użytkowników
5. **Raportowanie**: Rozszerz o raporty flotowe i dokumentowe

## Wsparcie

W przypadku problemów sprawdź:
- Logi Supabase Edge Functions
- Status migracji bazy danych
- Konfigurację SMTP
- Uprawnienia RLS w bazie danych
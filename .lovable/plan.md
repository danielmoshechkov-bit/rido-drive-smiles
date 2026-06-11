## Cel
Rozbudowa modułu warsztatowego o: historię zdarzeń (audit log), notatki wewnętrzne, stanowiska jako statusy, status "Naprawione" dla mechanika, wybór stanowiska przy nowym zleceniu oraz powiadomienia (in-app + SMS).

---

## 1. Historia zdarzeń + notatki (zakładka "Uwagi i historia")

**Zmiana nazwy:** Zakładka „Od pracowników" → **„Uwagi i historia"**.

**Nowa tabela `workshop_order_events`:**
- `order_id`, `event_type` (status_change / claimed / released / quote_done / repair_started / repair_done / note_added / workshop_assigned)
- `from_status`, `to_status`, `workshop_id`, `note`, `actor_user_id`, `actor_name`, `actor_role` (admin/employee), `created_at`

**Co się loguje automatycznie:**
- Przydzielenie pracownika (admin → kto, komu, kiedy)
- Wzięcie zlecenia z puli (pracownik claim)
- Zwrot zlecenia do puli
- Zmiana statusu (każda) z poprzedniego na nowy
- Wykonanie wyceny (przy zapisie findings)
- Rozpoczęcie naprawy (klient zaakceptował → status "W naprawie")
- Zakończenie naprawy (mechanik klika "Naprawione")
- Zmiana stanowiska
- Dodanie notatki

**UI zakładki:**
- Timeline chronologiczny (kto, co, kiedy, notatka jeśli była)
- Przycisk **„Dodaj uwagę"** u dołu — pracownik wpisuje notatkę wewnętrzną
- Notatki = wewnętrzne, klient nie widzi
- Jeśli są nieprzeczytane notatki → na karcie zlecenia w liście pulsuje **żółty wykrzyknik** ⚠️ obok numeru
- Pole `has_unread_notes` na zleceniu, czyszczone gdy admin otworzy zakładkę

---

## 2. Status „Naprawione" przez mechanika

- W karcie zlecenia pracownika (`EmployeeOrderCardDialog`) dodać przycisk **„Oznacz jako naprawione"** widoczny po akceptacji wyceny przez klienta.
- Klik → status zlecenia: `naprawione`, log w historii, powiadomienie do admina (in-app + opcjonalnie SMS).
- Admin widzi w liście zlecenia oznaczone jako naprawione (zielona plakietka „Gotowe do odbioru").

---

## 3. Stanowiska jako statusy + notatki przy zmianie statusu

**Nowa tabela `workshop_stations`** (per provider):
- `name` (np. „Myjnia", „Geometria", „Wulkanizacja", „Mechanika")
- `color`, `icon`, `is_active`, `sort_order`

**Tabela `workshop_station_employees`:** mapowanie pracownik ↔ stanowisko (n:m).

**Integracja ze statusami:**
- Każde stanowisko = automatyczny status do wyboru w dropdown statusów zlecenia.
- Zmiana statusu na nazwę stanowiska → zlecenie pojawia się w portalu pracowników tego stanowiska.
- Pracownik widzi te zlecenia w „Pula" (filtr po stanowiskach do których jest przypisany).
- Po wykonaniu pracy: pracownik klika „Zakończ" → status wraca do `do_odbioru` lub na poprzedni, log w historii.

**Notatka przy zmianie statusu:**
- Obok dropdown statusu mały **przycisk „+"** → modal „Notatka do zmiany statusu".
- Notatka zapisywana w `workshop_order_events` razem z eventem `status_change`.
- W liście zleceń dla danego stanowiska wyświetla się ikona notatki — klik pokazuje treść.
- Przykład: admin zmienia status na „Myjnia" + notatka „mycie po naprawie" → pracownicy myjni widzą zlecenie + notatkę.

---

## 4. Wybór stanowiska przy nowym zleceniu (foto 2)

W formularzu „Przyjęcie pojazdu" dodać sekcję na początku (obok Przebieg / Poziom paliwa / Uwagi klienta):
- **Pole „Stanowisko"** — select z listy aktywnych stanowisk warsztatu.
- Domyślnie zaznaczone **ostatnio użyte stanowisko** (zapisywane w `localStorage` per user lub w `user_preferences`).
- Wartość zapisywana jako początkowy `station_id` zlecenia i pierwszy status.

Układ: Pojazd | Klient (rząd 1) → Stanowisko | Przebieg | Paliwo | Uwagi (rząd 2).

---

## 5. „Akceptacja klienta" — bez zmian nazwy

Zostaje jak jest. Dodajemy tylko logikę:
- Gdy klient zaakceptuje wycenę → log eventu + powiadomienie do pracownika przypisanego (mechanika, który zrobił wycenę): „Możesz rozpocząć naprawę zlecenia #XXX" + link do karty zlecenia w jego portalu.

---

## 6. Powiadomienia (in-app + SMS)

**Nowa tabela `workshop_employee_notifications`:**
- `employee_user_id`, `order_id`, `type` (assigned / quote_accepted / station_assigned / note_added), `title`, `body`, `link`, `is_read`, `created_at`

**UI:** dzwoneczek 🔔 w nagłówku portalu pracownika z licznikiem nieprzeczytanych, dropdown z listą.

**Triggery (in-app + SMS równolegle):**
1. Admin przydziela zlecenie pracownikowi → powiadomienie + SMS: „GetRido: Przydzielono nowe zlecenie #XXX. Link: <portal>"
2. Klient akceptuje wycenę → powiadomienie + SMS do mechanika: „GetRido: Klient zaakceptował wycenę zlecenia #XXX, możesz rozpocząć naprawę. Link: <portal>"
3. Admin zmienia status na stanowisko (np. „Myjnia") → powiadomienie + SMS do wszystkich pracowników tego stanowiska
4. Pracownik dodaje notatkę → powiadomienie in-app do admina (bez SMS)

SMS używa istniejącego `workshop-send-sms` edge function.

---

## Szczegóły techniczne

**Migracje SQL (1 plik):**
- `workshop_order_events` (audit log) + RLS (provider widzi swoje, employee widzi przypisane)
- `workshop_stations` + RLS
- `workshop_station_employees` (junction) + RLS
- `workshop_employee_notifications` + RLS
- Dodać do `workshop_orders`: `station_id`, `has_unread_notes` (bool), `repaired_at`, `repaired_by_user_id`
- Triggery: po INSERT na findings → event `quote_done`; po UPDATE status → event `status_change`
- GRANTy dla każdej nowej tabeli

**Frontend:**
- Rename "Od pracowników" → "Uwagi i historia" w komponencie zakładek zlecenia (admin view)
- Nowy komponent `OrderHistoryTimeline.tsx` — timeline + dodawanie notatek
- `EmployeeOrderCardDialog.tsx` — przycisk „Oznacz jako naprawione"
- `WorkshopSettingsStations.tsx` — CRUD stanowisk + przypisywanie pracowników
- Form nowego zlecenia — dodać select „Stanowisko" + persist last choice
- Dropdown statusu — mały „+" obok do dodania notatki przy zmianie
- `EmployeeNotificationsBell.tsx` — dzwoneczek w portalu pracownika
- Lista zleceń admin — wykrzyknik dla nieprzeczytanych notatek

**Edge functions:**
- `workshop-notify-employee` — wspólny entry-point, wysyła in-app + SMS
- Hooki istniejących triggerów (assignment, quote acceptance, status change) wywołują tę funkcję

**Co zostaje nietknięte:**
- Istniejące statusy `nowe`, `przyjete`, `wycena`, `akceptacja_klienta`, `gotowe`, `zakonczone` — bez zmian w nazwie i logice
- Protokoły, linki klienta, SMS o wycenie i gotowości — bez zmian
- Logika `EmployeeOrderCardDialog` poza dodaniem przycisku „Naprawione"

---

## Kolejność implementacji

1. Migracja SQL (wszystkie tabele + triggery + grants)
2. Stanowiska — CRUD w ustawieniach + select w formularzu nowego zlecenia
3. Historia zdarzeń + notatki (timeline + przycisk dodaj uwagę + wykrzyknik)
4. Status „Naprawione" w karcie pracownika
5. Notatki przy zmianie statusu („+" obok dropdown)
6. Powiadomienia in-app (dzwoneczek) + edge function
7. Integracja SMS z istniejącymi triggerami

# Plan: Telegram Notifications Module

Dodaję nowy moduł powiadomień Telegram jako równoległy kanał do istniejących SMS/email/app. **Niczego nie zmieniam w istniejących funkcjach** — tylko dodaję infrastrukturę.

## Zakres tej iteracji (frontend + DB + helper)

### 1. Migracja bazy (Supabase)
3 nowe tabele + RPC:

- **`telegram_connections`** — powiązanie user ↔ chat Telegram (token startowy 15 min, status aktywne, licznik wiadomości).
- **`notification_preferences`** — preferencje per user. Zamiast ~60 kolumn boolean per kanał, użyję **`jsonb`** (`prefs jsonb`) z domyślnymi wartościami — łatwiej dodawać nowe typy bez migracji. Dodatkowo: `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`.
- **`notification_log`** — log wysyłek (user_id, typ, kanał, status, payload, error, sent_at). Tylko admin czyta.
- **`app_settings`** — tabela klucz/wartość (jeśli nie istnieje) na `telegram_bot_username`.
- RLS: user widzi tylko swoje connections/preferences; log — tylko admin (`has_role(auth.uid(),'admin')`).
- **RPC `generate_telegram_token()`** — tworzy/odświeża token + zwraca link `https://t.me/<bot_username>?start=<token>`.
- **RPC `disconnect_telegram()`** — set `is_active=false`.

### 2. Panel admina → Integracje → karta "Telegram Bot"
Nowy plik `src/components/admin/TelegramBotPanel.tsx`, dodany jako nowa zakładka (`telegram`) w `AdminApiKeysTab`. Karta:
- Pole **Bot Token** (password) → zapis do Supabase Secrets `TELEGRAM_BOT_TOKEN` (przez `add_secret`/instrukcja dla usera, bo Secrets nie da się zapisać z UI klienta).
- Pole **Bot Username** → `app_settings.telegram_bot_username`.
- **Webhook URL** (read-only) wygenerowany z project ref.
- Statystyki (z `telegram_connections` i `notification_log`).
- **Log ostatnich 20 powiadomień** z paginacją + filtrami (user/typ/status/data).

Sekret token — w UI tylko status "ustawiony/nieustawiony"; do wpisania używamy `add_secret`.

### 3. Panel klienta → Ustawienia → nowa zakładka "Powiadomienia"
Nowy plik `src/components/client-portal/NotificationsSettings.tsx`:
- **Kanały**: email (z auth), SMS (z profilu), Telegram (CTA połącz), App (push placeholder).
- **Tabele preferencji per moduł** (Warsztat/Nieruchomości/Giełda/Marketplace/Flota/KSeF) — checkbox per (typ × kanał). Typy zdefiniowane jako stała w `src/config/notificationTypes.ts`.
- "Zaznacz/odznacz wszystkie" per moduł.
- Sekcje pokazywane tylko gdy user ma aktywny moduł (sprawdzenie `useUserRole` / istniejące hooki).
- Cisza nocna (toggle + dwa pola time).
- "Zapisz" + "Wyślij test" (call do edge fn — zostawiam jako placeholder dispatch).

Dodaję jako nowy tab w istniejącym ustawieniach klienta (znajdę miejsce po przeglądnięciu `RentalClientPortal.tsx` lub odpowiednika).

### 4. Reusable `<TelegramConnectButton />`
`src/components/notifications/TelegramConnectButton.tsx`:
- Props: `variant: 'large' | 'compact' | 'minimal'`, `onConnect?`.
- Wywołuje RPC `generate_telegram_token`, otwiera deep link + pokazuje QR (`qrcode` lib jeśli zainstalowana, inaczej fallback).
- Subskrypcja Supabase Realtime na `telegram_connections` filtr `user_id=eq.<uid>`; gdy `is_active=true` → toast + callback.
- Timeout 5 min, "Rozłącz" button po połączeniu.

### 5. Helper `sendNotification()` (przygotowany, nie wywoływany)
`supabase/functions/_shared/notifications.ts`:
- Czyta preferences, sprawdza quiet hours (z wyjątkiem critical types), routuje na email/sms/telegram/app, loguje w `notification_log`.
- Stub'y dla telegram-notify (Claude Code dorobi później).

### 6. Lista typów powiadomień
`src/config/notificationTypes.ts` — pełna lista (warsztat/realestate/vehicle/marketplace/fleet/ksef) z metadanymi: kod, label, moduł, czy krytyczny, domyślne kanały.

## Czego nie robię (zostawione Claude Code)
- Edge functions `telegram-webhook` i `telegram-notify`.
- Wywołania `sendNotification()` w istniejących edge functions.
- Push (PWA) — tylko struktura.

## Pytanie
Token bota podaje admin przez **`add_secret` flow** (bezpiecznie), czy chcesz dodatkowo opcję wklejenia w UI (zapis do `app_settings`, mniej bezpieczne)? Domyślnie idę z `add_secret`.

Czy zatwierdzasz plan? Po akceptacji uruchamiam migrację i tworzę pliki.
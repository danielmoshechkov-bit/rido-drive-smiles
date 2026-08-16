# Zgłoszenie do SuperVoIP — numer docelowy przy przekierowaniu + warunki na pulę numerów

**Do wysłania przez formularz zgłoszeniowy.** Numer +48 22 101 58 96, trunk SIP.

Wersja po przeczytaniu Waszej dokumentacji — pytania, na które w niej
odpowiedzi znalazłem, zostały USUNIĘTE (API do zamawiania numerów,
instrukcja ElevenLabs, sposób uwierzytelniania, gdzie wygenerować klucz).

---

Dzień dobry,

numer **+48 22 101 58 96**, trunk SIP, integracja z ElevenLabs zestawiona
według Waszej instrukcji z bazy wiedzy (`pomoc.supervoip.pl/elevenlabs/`).
Odbieramy na nim połączenia przekierowane z numerów naszych klientów.

## 1. Numer docelowy przy przekierowaniu

W przychodzącym INVITE nie znajdujemy `Diversion`, `History-Info`
ani `P-Asserted-Identity` — nie mamy jak ustalić, na który numer klient
dzwonił pierwotnie. Sprawdziliśmy dziewięć połączeń z 17.08, w tym
przekierowane. Zestaw nagłówków jest **identyczny** dla bezpośrednich
i przekierowanych:

    Record-Route, Via, Max-Forwards, From, To, Contact, Call-ID, CSeq,
    User-Agent, Date, Allow, Supported, X-Callid, X-CallerID,
    Content-Type, Content-Length

`To` zawiera zawsze nasz numer techniczny, `From` — numer dzwoniącego.

**Pytania:**

1. Czy przy połączeniu przekierowanym z sieci obcej (np. z numeru Orange
   na nasz numer) przekazujecie gdziekolwiek numer, **z którego** nastąpiło
   przekierowanie? `Diversion`, `History-Info`, własny nagłówek `X-*`,
   parametr w `To` — cokolwiek. Jeśli nie przekazujecie domyślnie,
   czy da się to włączyć na naszym trunku?

2. W dokumentacji SIP trunk piszecie, że usługa pozwala „rozróżniać
   w urządzeniu na jaki numer telefonu przychodzi połączenie".
   **W którym polu SIP** ten numer jest, gdy na jednym trunku mamy wiele
   naszych numerów? `To`, Request-URI, czy jeszcze inne?

3. W API dla numeru jest `redirectPresentation` o wartościach
   `incoming` | `redirect`. Rozumiem, że to wybór **albo — albo**:
   albo widzimy numer dzwoniącego, albo numer przekierowujący.
   Czy jest konfiguracja, w której dostajemy **oba naraz** — numer
   dzwoniącego w `From` i numer przekierowujący w osobnym nagłówku?
   Bez tego przy przekierowaniu musimy wybrać: albo wiemy, kto dzwoni,
   albo wiemy, do którego klienta.

## 2. Pula numerów — warunki handlowe

Budujemy usługę, w której każdy klient (warsztat samochodowy) dostaje
własny numer obsługiwany przez agenta głosowego. Numer ma powstawać
automatycznie w chwili aktywacji usługi — przez `POST /api/voip_numbers`.

4. **Ile trwa aktywacja numeru** zamówionego przez API — jest gotowy
   od razu, czy przechodzi weryfikację?

5. Czy jest **limit numerów na jednym koncie** i limit numerów
   przypisanych do jednego konta SIP z usługą SIP trunk?

6. Jaki jest miesięczny koszt numeru stacjonarnego przy **kilkudziesięciu
   sztukach** — czy przy takiej liczbie obowiązuje inna stawka niż
   cennikowa? Ceny jednostkowe widzę w `GET /api/numbers`, pytam
   o warunki przy skali.

7. Domyślnie konto SIP ma jeden kanał wychodzący. Czy przy naszym
   scenariuszu (tylko połączenia PRZYCHODZĄCE, wiele numerów, wiele
   rozmów jednocześnie) trzeba coś dokupić, czy „połączenia przychodzące
   nie są limitowane na koncie SIP" obowiązuje bez zastrzeżeń?

## Przykładowe połączenia (17.08, przekierowane)

    Call-ID: 4dbac0b80005d554518b2fb36bf59a2c@213.199.246.213   (14:16)
    Call-ID: 2f9c412803523c034d3358005a500e67@213.199.246.213   (14:14)
    Call-ID: 67fe926f210310ba30987f1d5f264b11@213.199.246.213   (14:13)
    Call-ID: 295c134b36e1f373307ef5907611ca91@213.199.246.213   (14:12)

Pozdrawiam,
Daniel Moszeczkow, GetRido

# Zgłoszenie do SuperVoIP — nagłówek Diversion przy przekierowaniach

**Do wysłania przez formularz zgłoszeniowy.** Numer +48 22 101 58 96, trunk SIP.

---

Dzień dobry,

numer **+48 22 101 58 96**, trunk SIP. Odbieramy na nim połączenia
przekierowane z numerów naszych klientów.

W przychodzącym INVITE nie znajdujemy nagłówka `Diversion`, `History-Info`
ani `P-Asserted-Identity` — nie mamy jak ustalić, na który numer klient
dzwonił pierwotnie.

Sprawdziliśmy to na dziewięciu połączeniach z 17.08, w tym na kilku
przekierowanych. Zestaw nagłówków jest **identyczny** dla połączeń
bezpośrednich i przekierowanych:

    Record-Route, Via, Max-Forwards, From, To, Contact, Call-ID, CSeq,
    User-Agent, Date, Allow, Supported, X-Callid, X-CallerID,
    Content-Type, Content-Length

Pole `To` zawiera zawsze nasz numer techniczny, `From` — numer dzwoniącego.

## Pytania

1. Czy przekazujecie nagłówek `Diversion` przy połączeniach przekierowanych
   z sieci komórkowych? Jeśli nie — czy da się to włączyć na naszym trunku?
2. Czy jest inna droga ustalenia numeru docelowego przekierowania —
   nagłówek `X-*`, parametr w `To`, cokolwiek?
3. Jeśli nie — czy przy wielu numerach na jednym trunku pole `To` zawiera
   numer, **na który przyszło połączenie**?

## Pytania o API i numery

Budujemy usługę, w której wielu klientów przekierowuje swoje numery na nasz.
Bez rozpoznania numeru docelowego musimy kupować osobny numer dla każdego
klienta — stąd dodatkowe pytania:

4. Czy udostępniacie **API** do zamawiania numerów i przypisywania ich
   do konta SIP? Chcielibyśmy, żeby numer powstawał automatycznie
   po aktywacji usługi przez klienta, bez naszego udziału.
5. Ile trwa aktywacja numeru — natychmiast czy po weryfikacji?
6. Czy jest limit numerów na jednym koncie i na jednym trunku?
7. Jaki jest miesięczny koszt numeru stacjonarnego przy zamówieniu
   kilkudziesięciu sztuk?
8. Czy macie **API pozwalające kupić numer programowo**? W Waszej bazie
   wiedzy jest tag „API" — proszę o link do dokumentacji.
9. W Waszej bazie wiedzy jest tag **„ElevenLabs"**. Czy macie dokumentację
   integracji z tą platformą? Jeśli tak, proszę o link — być może opisuje
   dokładnie nasz przypadek.
10. W dokumentacji przekierowań piszecie, że można ustalić prezentację:
    „numer przychodzący lub numer przekierowywany". Czy to ustawienie
    dotyczy także połączeń **przychodzących na nasz trunk** z sieci obcych
    (np. przekierowanie z numeru Orange na nasz numer), czy tylko
    przekierowań wewnątrz Waszego systemu? Jeśli dotyczy — gdzie w panelu
    je znaleźć?

## Przykładowe połączenia (17.08, przekierowane)

    Call-ID: 4dbac0b80005d554518b2fb36bf59a2c@213.199.246.213   (14:16)
    Call-ID: 2f9c412803523c034d3358005a500e67@213.199.246.213   (14:14)
    Call-ID: 67fe926f210310ba30987f1d5f264b11@213.199.246.213   (14:13)
    Call-ID: 295c134b36e1f373307ef5907611ca91@213.199.246.213   (14:12)

Pozdrawiam,
Daniel Moszeczkow, GetRido

# Co, jeśli SuperVoIP odmówi usunięcia G.722

Odpowiedź na pytanie: czy zmiana operatora ma sens. **Nie ma.** Poniżej dowody
i cztery warianty w kolejności od najtańszego.

## Ustalenie 1: ElevenLabs ma WŁASNĄ preferencję kodeka

Dowód jest w SDP. Oferta SuperVoIP deklaruje kolejność preferencji operatora:

```
m=audio 16136 RTP/AVP  8  98  9  0  101
                       ↑   ↑  ↑
                    PCMA AMR G722
```

PCMA jest **pierwszy**. ElevenLabs w `200 OK` odpowiada **`9` = G722**, czyli
sięga po trzecią pozycję, pomijając dwie pierwsze. Odbierający ma prawo wybrać
dowolny kodek z oferty — ale wybranie trzeciego zamiast pierwszego dowodzi
własnego rankingu, a nie honorowania oferty.

Potwierdza to ich dokumentacja: *„ElevenLabs' SIP deployment outputs and receives
audio in G711 8kHz or G722 16kHz audio codecs"*, przy czym **nigdzie — ani w UI,
ani w API — nie ma pola wyboru kodeka.** Sprawdzone: `/v1/convai/phone-numbers/{id}`
ma `provider_config: null`, `livekit_stack: standard`, zero pól kodekowych.

**Wniosek: nowy operator dostanie dokładnie to samo, o ile zaoferuje G.722.**
Jedyny lewar po naszej stronie to TREŚĆ OFERTY — a to potrafi zmienić każdy
operator, w tym obecny.

## Ustalenie 2: trasa przez USA to w całości infrastruktura ElevenLabs

```
sip.rtc.elevenlabs.io   ->  136.112.48.140  (jeden adres, 144 ms z Warszawy)
```

Brak GeoDNS — z Polski nie da się trafić bliżej. Operator wysyła tam, gdzie każe
strona odbierająca; nie ma na to żadnego wpływu i żaden inny operator też nie
będzie miał. Jedyna droga to ich endpoint `sip-static.rtc.eu.residency…` (35 ms),
o który prosimy w zgłoszeniu.

**Oba problemy leżą po stronie ElevenLabs. Zmiana dostawcy telefonii kosztuje
numer i tygodnie konfiguracji, a nie rozwiązuje żadnego z nich.**

## Warianty, gdyby SuperVoIP odmówił

**A. Poprosić węziej — tylko ten jeden trunk, nie całe konto.**
Profil kodeków bywa ustawialny per trunk. Koszt: jeden mail. Zacząć od tego.

**B. Osobny trunk testowy z PCMA-only.**
Jeśli nie chcą ruszać produkcyjnego — poprosić o drugi trunk do testu.
Rozstrzyga hipotezę bez ryzyka dla numeru. Koszt: konfiguracja po ich stronie.

**C. Własny SBC w Warszawie (Kamailio + RTPengine albo FreeSWITCH).**
SuperVoIP → nasz SBC (dowolny kodek, 23 ms) → ElevenLabs z ofertą zawierającą
WYŁĄCZNIE PCMA. Działa niezależnie od tego, co zrobi operator.

Ważne: **odcinek transatlantycki jest tym wrażliwym i to on dostaje PCMA.**
Kodek bezstanowy na najdłuższej trasie to dokładnie to, o co nam chodzi.
Dodatkowo SBC daje metryki RTP (straty, jitter), których dziś nie widzimy znikąd.

Koszt: VPS w Warszawie ~30–60 zł/mies. + konfiguracja. Ryzyko: kolejny element,
który musi żyć; ~20 ms na transkodowanie.

**D. Zmiana operatora — ostatnia deska, i tylko z pisemną deklaracją.**
Ma sens WYŁĄCZNIE wtedy, gdy nowy operator potwierdzi NA PIŚMIE, jeszcze przed
migracją, że zaoferuje PCMA bez G.722. Inaczej tracimy numer i nie zyskujemy nic.

## Cena wyboru PCMA zamiast G.722 — uczciwie

To nie jest darmowa poprawa. Wymiana jest taka:

```
G.722   pasmo do 7 kHz    KRUCHY  — stanowy ADPCM, strata pakietu psuje dźwięk dalej
PCMA    pasmo do 3,4 kHz  ODPORNY — każda próbka niezależna, strata to krótka dziura
```

Przepustowość identyczna (64 kbps), więc nie oszczędzamy ani nie dopłacamy.
Tracimy **pasmo głosu agenta**: z 7 kHz na 3,4 kHz, czyli brzmienie „telefoniczne".
Głos rozmówcy i tak zwykle przychodzi wąskopasmowo — zmierzone w nagraniu:
jedna z tur klientki miała górną granicę 3828 Hz.

Przy objawie, który mamy — rozmówca nie rozumie słów — **odporność jest warta
więcej niż pasmo.** Ale to jest decyzja, nie oczywistość, i trzeba ją podjąć
świadomie.

AMR-WB (szerokopasmowy i odporniejszy od G.722) odpada: ElevenLabs go nie obsługuje.

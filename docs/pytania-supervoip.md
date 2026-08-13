# Pytania do SuperVoIP — jakość audio na trunku SIP

**Wysłać TYLKO jeśli nagranie z ElevenLabs okaże się czyste.** Jeśli bełkot jest już
w nagraniu, problem jest po stronie syntezy i SuperVoIP nie ma z nim nic wspólnego.

## Kontekst dla nich

Numer: **+48 22 101 58 96** (trunk SIP, ruch przychodzący).
Przykładowe rozmowy z problemem:

    13.08 21:59   call_id 4ce7158222a864d03f964ff279b21412@213.199.246.200
    13.08 16:01   call_id 40f8e18f51b7ddbd500ad5d131e50ebe@213.199.246.200

Objaw: fragmenty wypowiedzi bota docierają do rozmówcy jako nieczytelny dźwięk.
Po stronie dostawcy syntezy tekst jest kompletny i poprawny. Zdarza się losowo,
kilka razy na rozmowę, najczęściej przy czytaniu ciągów liter i cyfr
(numery rejestracyjne).

## Pytania

1. **Jaki kodek negocjujecie na tym trunku?** Nasz dostawca wysyła **PCM 16 kHz mono**
   (nieskompresowany). Czy przekodowujecie go po swojej stronie i na co?

2. **Czy da się wymusić G.711 (a-law/µ-law) bez dodatkowej kompresji?** Jeśli dziś
   idzie G.729 albo inny kodek niskopasmowy, prosimy o zmianę na czas diagnozy.

3. **Czy macie metryki jakości dla tych połączeń** — utrata pakietów, jitter, MOS?
   Prosimy o odczyt dla dwóch `call_id` powyżej.

4. **Którędy idzie ruch między nami a dostawcą syntezy?** Czy jest hop poza Europę?
   Interesuje nas trasa i ewentualne przeskoki międzykontynentalne.

5. Czy widzicie po swojej stronie **przerwy w strumieniu RTP** albo zmiany kodeka
   w trakcie połączenia (re-INVITE)?

## Czego NIE pytamy

Nie pytamy o jakość ASR ani o rozpoznawanie mowy — to jest po naszej stronie
i działa poprawnie.

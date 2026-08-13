# Do SuperVoIP — kodek G.722 na trunku i trasa RTP

**Status: PRZYGOTOWANE.** Wysyłane równolegle ze zgłoszeniem do ElevenLabs.

Wcześniejsza wersja tego pliku pytała o jakość transmisji „na wszelki wypadek".
Ta wersja pyta o dwie konkretne rzeczy, bo wiemy już, czego szukamy.

---

Dzień dobry,

numer **+48 22 101 58 96** (trunk SIP, ruch przychodzący, kierowany do
`sip.rtc.elevenlabs.io`). Diagnozujemy zniekształcenia dźwięku po stronie
rozmówcy i doszliśmy do warstwy kodeka. Trzy pytania.

## 1. Czy mogą Państwo usunąć G.722 z oferty na tym trunku?

W Państwa `INVITE` proponowane są cztery kodeki, w tej kolejności:

    m=audio 16136 RTP/AVP 8 98 9 0 101
      8   PCMA/8000      (a-law, nieskompresowany)
      98  AMR-WB/16000
      9   G722/8000
      0   PCMU/8000      (µ-law, nieskompresowany)

ElevenLabs w `200 OK` odpowiada **G722** — czyli sięga po trzecią pozycję,
pomijając Państwa dwie pierwsze preferencje. Wygląda na to, że mają własny
ranking i honorują G.722, kiedy tylko jest w ofercie.

G.722 to subpasmowy ADPCM z predyktorem, który ma stan: pojedynczy zgubiony
albo przestawiony pakiet rozjeżdża dekoder i dźwięk jest zniekształcony jeszcze
przez chwilę po stracie. PCMA takiego stanu nie ma.

**Prośba: czy da się skonfigurować ten trunk tak, żeby oferował wyłącznie
PCMA (ewentualnie PCMA + PCMU + telephone-event), bez G.722?** To najszybsza
droga do rozstrzygnięcia, czy kodek jest przyczyną — i jeśli tak, do naprawy.

## 2. Czy widzą Państwo straty pakietów na tym trunku?

Prosimy o metryki (utrata pakietów, jitter, MOS) dla dwóch połączeń:

    13.08.2026 21:59   call_id 4ce7158222a864d03f964ff279b21412@213.199.246.200
    13.08.2026 21:55   call_id 40f8e18f51b7ddbd500ad5d131e50ebe@213.199.246.213

## 3. Czy mają Państwo jakikolwiek wpływ na to, dokąd idzie RTP?

Serwer mediów wskazany przez ElevenLabs w SDP to `34.45.0.205`. Zmierzone
z Warszawy: **146 ms RTT**, wobec 23 ms do Państwa serwera mediów. Ruch
przechodzi przez Atlantyk w obie strony.

Rozumiemy, że adres podaje strona odbierająca i Państwo tylko się do niego
stosują — ale pytamy wprost: **czy jest po Państwa stronie jakikolwiek
mechanizm** (wybór punktu styku, routing, wymuszenie innego docelowego hosta),
który pozwoliłby skrócić tę trasę? Równolegle prosimy ElevenLabs o przepięcie
na ich endpoint europejski.

Pozdrawiamy

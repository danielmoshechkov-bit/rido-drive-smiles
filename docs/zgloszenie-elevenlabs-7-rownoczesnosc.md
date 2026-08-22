# Zgłoszenie do ElevenLabs — ile równoczesnych rozmów uniesie jeden agent

**Status: DO WYSŁANIA.** Pytanie blokujące sprzedaż, nie ciekawostka.

## Kontekst dla nich

Budujemy obsługę wielu warsztatów samochodowych na **jednym agencie**
ElevenLabs. Każdy warsztat ma własny numer telefoniczny (SIP trunk), wszystkie
numery wskazują na tego samego agenta, a rozróżnienie warsztatu robimy po
`called_number` w webhooku inicjującym. Planujemy dojść do ~100 warsztatów.

## Co widzimy w konfiguracji

```
agent_concurrency_limit: -1
daily_limit:             100000
bursting_enabled:        false
```

## Pytania

1. **Czy `agent_concurrency_limit: -1` znaczy „bez ograniczeń", czy „bez
   ograniczeń po stronie agenta, ale z ograniczeniem na poziomie konta lub
   planu"?** Jeśli to drugie — jaka jest ta granica dla naszego planu?

2. **Co się dzieje z 51. równoczesną rozmową**, jeśli granica wypada na 50:
   odrzucenie połączenia, kolejkowanie, czy degradacja opóźnienia dla
   wszystkich trwających rozmów?

3. **Czy `bursting_enabled: true` zmienia tę granicę**, a jeśli tak — czy
   wiąże się z dodatkowym kosztem?

4. **Czy webhook inicjujący (`conversation_initiation`) ma własny limit
   równoczesnych wywołań?** Nasz webhook ma budżet 800 ms; interesuje nas,
   czy przy 100 równoczesnych połączeniach wywołujecie go 100 razy równolegle,
   czy szeregujecie.

5. **Czy `daily_limit: 100000` liczy rozmowy, minuty, czy wywołania API?**

## Pytania o nadwyżki (drugi blok)

Jesteśmy na planie Creator (275 minut). Przy naszym modelu — jeden agent, wiele
numerów, ~200 minut miesięcznie na warsztat — nadwyżki będą regułą, nie
wyjątkiem. Zanim oprzemy na tym cennik, potrzebujemy trzech odpowiedzi:

6. **Czy minuty ponad plan mają górny limit?** Czy po przekroczeniu pewnej
   wielokrotności planu konto zostaje odcięte, czy naliczanie idzie dalej?

7. **Czy przy stałym przekraczaniu planu wymuszacie przejście na wyższy plan
   albo blokujecie konto?** Jeśli tak — przy jakim progu?

8. **Czy burst pricing włącza się automatycznie przy nadwyżkach?** Chcemy
   wiedzieć, kiedy stawka za minutę rośnie i czy da się to wyłączyć.

To dla nas główna pozycja kosztowa, więc wolimy poznać warunki z góry niż
z faktury.

## Dlaczego pytamy zamiast zmierzyć

Zmierzyć możemy wyłącznie własną stronę — nasz webhook. Zajęcie 100 linii
prawdziwymi rozmowami kosztuje kredyty i przy okazji blokuje warsztat, który
dziś odbiera telefony przez ten sam mechanizm.

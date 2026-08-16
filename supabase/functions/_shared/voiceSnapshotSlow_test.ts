import test from "node:test";
import assert from "node:assert/strict";
import {
  cenaDoWypowiedzeniaSlow, czasDoWypowiedzeniaSlow, doWypowiedzeniaSlow, powodSlow,
} from "./voiceSnapshotSlow.ts";

// ⚠️ Te asercje pilnuja MECHANIZMU (odmiana, forma mnoga, rodzaj), nie
// poprawnosci form jezykowych. Formy weryfikuje czlowiek znajacy jezyk —
// przy polskim „dziewietnascie sierpnia" przeszlo przez pomiar i wyszlo
// dopiero w prawdziwej rozmowie.

test("dzien tygodnia zgadza sie miedzy jezykami — ta sama data, ten sam dzien", () => {
  // 2026-08-18 to wtorek. Gdyby ktorykolwiek modul liczyl date inaczej,
  // agent podalby klientowi inny dzien niz zapisany w grafiku.
  assert.ok(doWypowiedzeniaSlow("2026-08-18", "ru").startsWith("вторник"));
  assert.ok(doWypowiedzeniaSlow("2026-08-18", "uk").startsWith("вівторок"));
  assert.ok(doWypowiedzeniaSlow("2026-01-01", "ru").startsWith("четверг"));
  assert.ok(doWypowiedzeniaSlow("2026-01-01", "uk").startsWith("четвер"));
});

test("dzien miesiaca w DOPELNIACZU, nie w mianowniku", () => {
  // Ta sama klasa bledu co polskie „dziewietnascie sierpnia".
  assert.equal(doWypowiedzeniaSlow("2026-08-18", "ru"), "вторник, восемнадцатого августа");
  assert.equal(doWypowiedzeniaSlow("2026-08-18", "uk"), "вівторок, вісімнадцятого серпня");
  assert.equal(doWypowiedzeniaSlow("2026-11-23", "ru"), "понедельник, двадцать третьего ноября");
  assert.equal(doWypowiedzeniaSlow("2026-11-23", "uk"), "понеділок, двадцять третього листопада");
});

test("kazdy dzien miesiaca ma forme — zadna dziura w tablicy 1..31", () => {
  for (const j of ["ru", "uk"] as const) {
    for (let d = 1; d <= 31; d++) {
      const iso = `2026-01-${String(d).padStart(2, "0")}`;
      const s = doWypowiedzeniaSlow(iso, j);
      assert.ok(!/undefined|,\s{2,}|,\s*$/.test(s), `${j} ${iso}: ${s}`);
    }
  }
});

test("forma mnoga tysiaca: 1 / 2-4 / 5+ z pulapka na 11-14", () => {
  assert.match(cenaDoWypowiedzeniaSlow(2000, null, "ru"), /две тысячи/);
  assert.match(cenaDoWypowiedzeniaSlow(5000, null, "ru"), /пять тысяч/);
  assert.match(cenaDoWypowiedzeniaSlow(12000, null, "ru"), /двенадцать тысяч/);
  assert.match(cenaDoWypowiedzeniaSlow(22000, null, "ru"), /двадцать две тысячи/);
  assert.match(cenaDoWypowiedzeniaSlow(2000, null, "uk"), /дві тисячі/);
  assert.match(cenaDoWypowiedzeniaSlow(5000, null, "uk"), /п'ять тисяч/);
  assert.match(cenaDoWypowiedzeniaSlow(12000, null, "uk"), /дванадцять тисяч/);
});

test("RODZAJ ZENSKI przy tysiacach: dwa w rodzaju zenskim, nie meskim", () => {
  // Roznica wobec polskiego, gdzie „tysiac" jest rodzaju meskiego.
  assert.ok(!cenaDoWypowiedzeniaSlow(2000, null, "ru").includes("два тысячи"));
  assert.ok(!cenaDoWypowiedzeniaSlow(2000, null, "uk").includes("два тисячі"));
});

test("widelki w dopelniaczu", () => {
  assert.equal(cenaDoWypowiedzeniaSlow(150, 250, "ru"),
    "от ста пятидесяти до двухсот пятидесяти злотых");
  assert.equal(cenaDoWypowiedzeniaSlow(150, 250, "uk"),
    "від ста п'ятдесяти до двохсот п'ятдесяти злотих");
});

test("waluta ZOSTAJE zlotowka w obu jezykach", () => {
  for (const j of ["ru", "uk"] as const) {
    assert.ok(/злот/.test(cenaDoWypowiedzeniaSlow(150, 250, j)));
    assert.ok(!/рубл|гривн|евро|euro|dollar/i.test(cenaDoWypowiedzeniaSlow(150, 250, j)));
  }
});

test("zadna kwota do 999999 nie wraca cyframi", () => {
  for (const j of ["ru", "uk"] as const) {
    for (const k of [150, 1000, 5000, 12000, 99000, 150000]) {
      assert.ok(!/\d/.test(cenaDoWypowiedzeniaSlow(k, null, j)), `${j} ${k}`);
    }
  }
});

test("czas trwania — siatka dokladna, poza nia zachowawczo", () => {
  assert.equal(czasDoWypowiedzeniaSlow(60, "ru"), "около часа");
  assert.equal(czasDoWypowiedzeniaSlow(60, "uk"), "близько години");
  assert.equal(czasDoWypowiedzeniaSlow(75, "ru"), "несколько часов");
  assert.equal(czasDoWypowiedzeniaSlow(480, "uk"), "цілий день");
});

test("powody zamkniecia maja odpowiedniki", () => {
  assert.equal(powodSlow("zamknięte", "ru"), "закрыто");
  assert.equal(powodSlow("zamknięte", "uk"), "зачинено");
  assert.equal(powodSlow("brak wolnych terminów", "ru"), "нет свободного времени");
});

test("okragly tysiac BEZ slowa jeden", () => {
  // Zweryfikowane przez uzytkownika: „тысяча злотых" brzmi naturalniej niz
  // „одна тысяча злотых". Przy 21000 „одна" ZOSTAJE, bo tam jest czescia
  // liczby zlozonej.
  assert.equal(cenaDoWypowiedzeniaSlow(1000, null, "ru"), "тысяча злотых");
  assert.equal(cenaDoWypowiedzeniaSlow(1000, null, "uk"), "тисяча злотих");
  assert.match(cenaDoWypowiedzeniaSlow(21000, null, "ru"), /двадцать одна тысяча/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const mapFiles = [
  "src/components/realestate/ResultsMapModal.tsx",
  "src/components/realestate/LocationMapModal.tsx",
  "src/components/realestate/FullscreenMapView.tsx",
  "src/components/marketplace/FullscreenVehicleMapView.tsx",
];

test("markery map nie interpolują danych ofert przez innerHTML", async () => {
  for (const path of mapFiles) {
    const source = await read(path);
    assert.doesNotMatch(source, /\.innerHTML\s*=/, `${path} nadal zapisuje HTML markera`);
    assert.match(source, /document\.createElement\(/, `${path} nie buduje markera przez DOM API`);
    assert.match(source, /\.textContent\s*=/, `${path} nie zapisuje treści jako tekstu`);
  }
});

test("InfoWindow otrzymuje węzeł DOM, nie interpolowany HTML oferty", async () => {
  for (const path of [
    "src/components/realestate/ResultsMapModal.tsx",
    "src/components/realestate/LocationMapModal.tsx",
  ]) {
    const source = await read(path);
    assert.match(source, /const content = document\.createElement\(["']div["']\)/);
    assert.match(source, /(?:infoWindow|iw)\.setContent\(content\)/);
    assert.doesNotMatch(source, /setContent\s*\(\s*`/, `${path} przekazuje template string do InfoWindow`);
    assert.match(source, /SAFE_MAP_IMAGE_URL/);
    assert.match(source, /image\.referrerPolicy\s*=\s*["']no-referrer["']/);
  }
});

test("generatory umów escapują pola użytkownika i ograniczają URL obrazów", async () => {
  const universal = await read("src/utils/rentalContractGenerator.ts");
  const rental = await read("src/components/rental/rentalLib.ts");

  assert.match(universal, /escapeHtmlText/);
  assert.match(universal, /safeContractImageUrl/);
  assert.ok(universal.includes("data:image\\/(?:png|jpe?g|gif|webp);base64,"));
  assert.doesNotMatch(universal.match(/SAFE_CONTRACT_IMAGE_URL\s*=.*;/)?.[0] || "", /svg|javascript|vbscript/i);

  assert.match(rental, /const safe = .*escapeHtmlText/);
  assert.doesNotMatch(rental, /\$\{fd\./, "rentalLib interpoluje surowe pole formularza");
});

test("wydruk umowy używa centralnej granicy sanitizacji", async () => {
  const source = await read("src/utils/rentalContractGenerator.ts");
  assert.match(source, /openSanitizedPrintWindow\(/);
  assert.doesNotMatch(source, /document\.write\(/);
  assert.doesNotMatch(source, /window\.open\(/);
});

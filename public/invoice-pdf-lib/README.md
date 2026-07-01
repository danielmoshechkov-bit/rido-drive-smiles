# invoice-pdf-lib — Dompdf dla `public/invoice-pdf.php`

Serwerowy render HTML→PDF (Dompdf) faktur/dokumentów. Czysty PHP, **bez `exec`** — działa na LH.pl (shared).

## Instalacja (raz, przy deployu)

W tym katalogu:

```bash
composer install --no-dev --optimize-autoloader
```

To utworzy `vendor/` (Dompdf + czcionki DejaVu z polskimi znakami). **Wgraj cały `vendor/` na serwer** razem z `public/` (FTP/deploy).

- Jeśli LH.pl nie ma `composer`/SSH: uruchom `composer install` lokalnie i wgraj `invoice-pdf-lib/vendor/` przez FTP.
- Wymogi PHP: 8.0+, rozszerzenia `mbstring`, `dom`, `gd` (standard na LH.pl).
- `vendor/` jest w `.gitignore` (nie trzymamy w repo).

## Jak to działa

`public/invoice-pdf.php` przyjmuje `POST { html }` i zwraca `{ pdf_base64 }`.
Frontend (`src/utils/renderInvoicePdf.ts`) woła go dla obu przycisków: „Pobierz" i „Wyślij mailem" → **ten sam plik**. Gdy endpoint niedostępny → fallback (druk przeglądarki / html2canvas).

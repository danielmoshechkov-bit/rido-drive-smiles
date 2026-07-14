import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2 } from 'lucide-react';

// Worker pdf.js serwowany lokalnie (self-hosted, bez usług zewnętrznych).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasPreviewProps {
  base64: string;
}

// Renderuje PDF (base64) do <canvas> przez pdf.js — pokazuje DOKŁADNIE ten sam plik
// co pobranie/mail, niezależnie od ustawień przeglądarki (np. „pobieraj PDF-y").
export function PdfCanvasPreview({ base64 }: PdfCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        container.innerHTML = '';
        // szerokość docelowa = szerokość kontenera (crispny render przy dużym ekranie)
        const targetWidth = Math.min(container.clientWidth || 820, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = targetWidth / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          canvas.style.background = 'white';
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          // Każda strona jako osobna „kartka" (jak w czytniku PDF) — biała karta
          // z cieniem i odstępem, żeby wielostronicowy dokument nie zlewał się w jeden ciąg.
          const pageCard = document.createElement('div');
          pageCard.style.background = 'white';
          pageCard.style.borderRadius = '8px';
          pageCard.style.boxShadow = '0 2px 12px rgba(0,0,0,0.18)';
          pageCard.style.overflow = 'hidden';
          pageCard.style.marginBottom = n < pdf.numPages ? '20px' : '0';
          pageCard.appendChild(canvas);
          container.appendChild(pageCard);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('Podgląd PDF (pdf.js) nieudany:', e);
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [base64]);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      {loading && (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Generowanie podglądu…
        </div>
      )}
      {error && (
        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
          Nie udało się wyświetlić podglądu. Użyj przycisku „PDF", aby pobrać.
        </div>
      )}
      {/* Kontener przezroczysty — białą kartę z cieniem dostaje każda strona z osobna. */}
      <div
        ref={containerRef}
        className="mx-auto w-full max-w-[900px]"
        style={{ display: loading || error ? 'none' : 'block' }}
      />
    </div>
  );
}

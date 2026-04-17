/**
 * Klient-side kompresja zdjęć z opcjonalnym wypaleniem watermarku z datą.
 * - Skala do max 1920px (długi bok), JPEG quality 0.85 → typowo 300–500 KB.
 * - Zachowuje proporcje, EXIF jest tracony (nie da się go nadpisać znacznikiem).
 * - Watermark: data + godzina w prawym dolnym rogu, półprzezroczyste tło.
 */

export interface CompressOptions {
  maxDimension?: number; // domyślnie 1920
  quality?: number; // 0..1, domyślnie 0.85
  watermarkText?: string; // jeśli podany, wypala go w obraz
  mimeType?: string; // domyślnie 'image/jpeg'
}

export async function compressImageWithWatermark(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxDimension = 1920,
    quality = 0.85,
    watermarkText,
    mimeType = 'image/jpeg',
  } = options;

  // Tylko obrazy są kompresowane – inne typy zwracamy bez zmian
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await loadBitmap(file);
  const { width: srcW, height: srcH } = bitmap;

  // Skalowanie z zachowaniem proporcji
  const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }
    return file;
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, dstW, dstH);
  if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close();
  }

  // Watermark
  if (watermarkText) {
    const padding = Math.max(8, Math.round(dstW * 0.012));
    const fontSize = Math.max(14, Math.round(dstW * 0.022));
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Arial, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';

    const metrics = ctx.measureText(watermarkText);
    const textW = metrics.width;
    const textH = fontSize * 1.2;

    // Półprzezroczyste tło dla czytelności
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(
      dstW - textW - padding * 2.4,
      dstH - textH - padding * 1.4,
      textW + padding * 2,
      textH + padding * 0.8
    );

    // Tekst
    ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
    ctx.fillText(watermarkText, dstW - padding * 1.2, dstH - padding * 0.6);
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      mimeType,
      quality
    );
  });

  // Zachowaj oryginalną nazwę, podmień rozszerzenie na .jpg jeśli kompresujemy do JPEG
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
  const newName = `${baseName}.${ext}`;

  return new File([blob], newName, { type: mimeType, lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallback
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  }) as unknown as ImageBitmap;
}

/**
 * Format znacznika czasu PL: "17.04.2026 08:35"
 */
export function formatTimestampPL(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

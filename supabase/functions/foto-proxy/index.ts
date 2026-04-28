import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const f = url.searchParams.get("f");
  const agency = url.searchParams.get("agency")?.replace(/[^a-zA-Z0-9_-]/g, "") || "";
  const path = url.searchParams.get("p")?.replace(/^\/+/, "") || "";
  if (!f || !/^[^/\\]+\.(jpg|jpeg|png|webp)$/i.test(f)) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const encodedFile = encodeURIComponent(f);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const sources = [
    // 1. Dokładna ścieżka FTP zapisana w XML/DB
    ...(path ? [{ url: `https://getrido.pl/${encodedPath}`, headers: {} }] : []),
    ...(agency ? [{ url: `https://getrido.pl/crm-import/${agency}/foto/${encodedFile}`, headers: {} }] : []),
    // 2. Nasz PHP proxy na LH.pl (lokalny plik / cache)
    {
      url: `https://getrido.pl/foto-proxy.php?f=${encodedFile}${agency ? `&agency=${agency}` : ""}${path ? `&p=${encodeURIComponent(path)}` : ""}`,
      headers: {}
    },
    // 3. ASARI CDN bezposrednio
    {
      url: `https://foto.asari.pl/${encodedFile}`,
      headers: {
        'Referer': 'https://asari.pl/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    },
    // 4. ASARI CDN wariant 2
    {
      url: `https://foto.asari.pl/foto/${encodedFile}`,
      headers: {
        'Referer': 'https://asari.pl/',
        'User-Agent': 'Mozilla/5.0',
      }
    },
    // 5. CDN ASARI
    {
      url: `https://cdn.asari.pl/foto/${encodedFile}`,
      headers: {
        'Referer': 'https://asari.pl/',
        'User-Agent': 'Mozilla/5.0',
      }
    },
  ];

  for (const source of sources) {
    try {
      const res = await fetch(source.url, { headers: source.headers });
      if (!res.ok) continue;
      
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) continue;
      
      const data = await res.arrayBuffer();
      const firstBytes = new Uint8Array(data.slice(0, 4));
      const isJpeg = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8;
      const isPng = firstBytes[0] === 0x89 && firstBytes[1] === 0x50;
      const isWebp = firstBytes[0] === 0x52 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46 && firstBytes[3] === 0x46;
      
      if (!isJpeg && !isPng && !isWebp) continue;

      return new Response(data, {
        headers: {
          ...corsHeaders,
          "Content-Type": isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp",
          "Cache-Control": "public, max-age=2592000",
        }
      });
    } catch {
      continue;
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});

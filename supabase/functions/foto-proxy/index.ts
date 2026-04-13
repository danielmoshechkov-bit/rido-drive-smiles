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
  if (!f || !/^\d+\.(jpg|jpeg|png)$/i.test(f)) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const sources = [
    // 1. Nasz PHP proxy na LH.pl (najszybszy - lokalny plik)
    {
      url: `https://getrido.pl/foto-proxy.php?f=${f}`,
      headers: {}
    },
    // 2. ASARI CDN bezposrednio
    {
      url: `https://foto.asari.pl/${f}`,
      headers: {
        'Referer': 'https://asari.pl/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    },
    // 3. ASARI CDN wariant 2
    {
      url: `https://foto.asari.pl/foto/${f}`,
      headers: {
        'Referer': 'https://asari.pl/',
        'User-Agent': 'Mozilla/5.0',
      }
    },
    // 4. CDN ASARI
    {
      url: `https://cdn.asari.pl/foto/${f}`,
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
      
      if (!isJpeg && !isPng) continue;

      return new Response(data, {
        headers: {
          ...corsHeaders,
          "Content-Type": isJpeg ? "image/jpeg" : "image/png",
          "Cache-Control": "public, max-age=2592000",
        }
      });
    } catch {
      continue;
    }
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
});

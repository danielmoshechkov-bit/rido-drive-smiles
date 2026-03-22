import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const f = url.searchParams.get("f");
  if (!f || !/^\d+\.(jpg|jpeg|png)$/i.test(f)) {
    return new Response("Not found", { status: 404 });
  }
  const res = await fetch("https://foto.asari.pl/" + f, {
    headers: { "Referer": "https://asari.pl/", "User-Agent": "Mozilla/5.0" }
  });
  if (!res.ok) return new Response("Not found", { status: 404 });
  const data = await res.arrayBuffer();
  return new Response(data, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=2592000",
      "Access-Control-Allow-Origin": "*"
    }
  });
});

UPDATE public.real_estate_listings
SET photos = array(
  SELECT REPLACE(unnested, 'https://getrido.pl/foto/index.php?f=', 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/foto-proxy?f=')
  FROM unnest(photos) AS unnested
)
WHERE array_to_string(photos, ',') LIKE '%getrido.pl/foto/index.php%';
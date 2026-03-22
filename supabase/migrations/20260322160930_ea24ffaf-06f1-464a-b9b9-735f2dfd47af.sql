UPDATE public.real_estate_listings
SET photos = array(
  SELECT REPLACE(unnested, 'https://getrido.pl/foto/?f=', 'https://getrido.pl/foto-proxy.php?f=')
  FROM unnest(photos) AS unnested
)
WHERE array_to_string(photos, ',') LIKE '%getrido.pl/foto/?f=%'
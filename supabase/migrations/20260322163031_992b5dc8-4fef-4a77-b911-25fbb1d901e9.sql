UPDATE real_estate_listings 
SET photos = (
  SELECT array_agg(
    replace(p, 'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/foto-proxy?f=', 'https://getrido.pl/foto-proxy.php?f=')
  )
  FROM unnest(photos) p
)
WHERE crm_source = 'asari' 
AND photos IS NOT NULL 
AND array_length(photos, 1) > 0;
-- flow: cena ukrycia tablic rejestracyjnych = 5 kredytow (ai_pricing)
insert into ai_pricing (feature_key, credits_per_use, description, is_enabled)
values ('hide_clp', 5, 'Ukrycie tablic rejestracyjnych na zdjeciu (API4AI)', true)
on conflict (feature_key) do update set credits_per_use = 5, is_enabled = true;

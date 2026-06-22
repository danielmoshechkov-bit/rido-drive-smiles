-- E-flow: cena decodera nr rej/VIN = 5 kredytów (źródło ai_pricing, jak reszta foto-AI).
insert into ai_pricing (feature_key, credits_per_use, description, is_enabled)
values ('vehicle_lookup', 5, 'Pobranie danych pojazdu po nr rej/VIN (RegCheck)', true)
on conflict (feature_key) do update set credits_per_use = 5, is_enabled = true;

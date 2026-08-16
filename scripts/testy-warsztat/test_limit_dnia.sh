#!/bin/bash
# KONIEC-DO-KOŃCA: dzienny limit aut. Zakłada rezerwacje, ustawia limit i pyta
# PUBLICZNY endpoint dokładnie tak, jak robi to strona klienta. Sprząta po sobie.
P=664ed87b-a20f-457b-a9fa-97ca13dcae7c
D=$(date -v+45d +%Y-%m-%d 2>/dev/null || date -d "+45 days" +%Y-%m-%d)
Q() { supabase db query --linked "$1" 2>/dev/null; }
SLOTY() { curl -s "https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/booking-available-slots?token=$1&date=$D" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); s=d.get('slots',[]); print(sum(1 for x in s if x['available']))" 2>/dev/null; }

Q "insert into workshop_client_bookings (provider_id, phone, appointment_date, appointment_time, duration_minutes, status, service_description) values ('$P','000000001','$D','09:00:00',60,'scheduled','AUTOTEST LIMITU')" >/dev/null
TOK=$(Q "select confirmation_token from workshop_client_bookings where service_description='AUTOTEST LIMITU' limit 1" | grep -o '"confirmation_token": "[^"]*"' | cut -d'"' -f4)

Q "delete from workshop_calendar_settings where provider_id='$P'" >/dev/null
BEZ=$(SLOTY "$TOK")
Q "insert into workshop_calendar_settings (provider_id, max_bookings_per_day) values ('$P',1) on conflict (provider_id) do update set max_bookings_per_day=1" >/dev/null
Z=$(SLOTY "$TOK")

Q "delete from workshop_calendar_settings where provider_id='$P'" >/dev/null
Q "delete from workshop_client_bookings where service_description='AUTOTEST LIMITU'" >/dev/null

echo "bez limitu: $BEZ wolnych, z limitem 1 (juz 1 rezerwacja): $Z wolnych"
[ "$BEZ" -gt 0 ] && [ "$Z" = "0" ] && echo "LIMIT DZIALA" || echo "LIMIT NIE DZIALA"

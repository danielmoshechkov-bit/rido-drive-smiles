import { supabase } from '@/integrations/supabase/client';
import { escapeHtmlText } from '@/security/htmlSanitizer';

// Stałe skopiowane ze starej Floty (AddVehicleModal).
export const BODY_TYPES = ['sedan', 'kombi', 'hatchback', 'suv', 'coupe', 'cabrio', 'minivan', 'pickup'];
export const FUEL_TYPES = [
  { v: 'benzyna', l: 'Benzyna' }, { v: 'diesel', l: 'Diesel' }, { v: 'hybryda', l: 'Hybryda' },
  { v: 'elektryczny', l: 'Elektryczny' }, { v: 'lpg', l: 'LPG' }, { v: 'hybryda_gaz', l: 'Hybryda+LPG' },
  { v: 'inne', l: 'Inne' },
];
export const DOC_TYPES = [
  { v: 'dowod', l: 'Dowód rejestracyjny' }, { v: 'oc', l: 'Polisa OC' },
  { v: 'przeglad', l: 'Przegląd' }, { v: 'inne', l: 'Inne' },
];

// Upload do publicznego bucketu driver-documents, prefiks rental/<key>/...
export async function uploadRentalFile(key: string, file: File): Promise<string> {
  const sb = supabase as any;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `rental/${key}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await sb.storage.from('driver-documents').upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from('driver-documents').getPublicUrl(path);
  return data.publicUrl as string;
}

// Kolor badge OC/przegląd wg liczby dni do końca (kopia logiki z ExpiryBadges).
export function expiryColor(dateStr?: string | null): string {
  if (!dateStr) return 'bg-destructive text-destructive-foreground';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  if (diff > 7) return 'bg-green-100 text-green-700';
  if (diff >= 1) return 'bg-yellow-100 text-yellow-700';
  return 'bg-destructive text-destructive-foreground';
}

export function daysLeft(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

export const noScroll = (e: React.WheelEvent<HTMLInputElement>) =>
  (e.currentTarget as HTMLInputElement).blur();

// Szablon umowy najmu (kod RENTAL_CONTRACT) — skopiowany ze starej Floty.
export const RENTAL_CONTRACT_CONTENT = `UMOWA NAJMU POJAZDU
Nr {{NR_UMOWY}}

zawarta w dniu {{DATA_UMOWY}} pomiędzy:

{{NAZWA_FIRMY}}
NIP: {{NIP_FIRMY}}
zwaną dalej „Wynajmującym"

a

{{IMIE_NAZWISKO_NAJEMCY}}
telefon: {{TELEFON_NAJEMCY}}
zwanym dalej „Najemcą"

§1 Przedmiot umowy
Wynajmujący oddaje Najemcy do używania pojazd:
Marka: {{MARKA_POJAZDU}}
Model: {{MODEL_POJAZDU}}
Numer VIN: {{NR_VIN}}
Nr rejestracyjny: {{NR_REJESTRACYJNY}}

§2 Okres najmu
Od {{OD}} do {{DO}}.

§3 Czynsz najmu i kaucja
1. Stawka: {{STAWKA}}.
2. Kaucja: {{KAUCJA}} zł.

§4 Postanowienia końcowe
1. W sprawach nieuregulowanych stosuje się przepisy Kodeksu cywilnego.
2. Umowę sporządzono w dwóch jednobrzmiących egzemplarzach.

______________________________          ______________________________
Wynajmujący                              Najemca`;

interface ContractFill {
  contract_number?: string; contract_date?: string;
  company_name?: string; company_nip?: string;
  renter_name?: string; renter_phone?: string;
  car_brand?: string; car_model?: string; car_vin?: string; car_registration?: string;
  period_from?: string; period_to?: string; rate?: string; deposit?: string;
}

// Generator HTML umowy (wzorowany na generateContractHtml z DocumentsManagement).
export function generateRentalContractHtml(fd: ContractFill): string {
  const safe = (value?: string) => escapeHtmlText(value || '—');
  const row = (key: string, value?: string) =>
    `<tr><td style="padding:6px 12px;border:1px solid #ddd;width:180px;background:#f5f5f5"><strong>${escapeHtmlText(key)}</strong></td><td style="padding:6px 12px;border:1px solid #ddd">${safe(value)}</td></tr>`;
  return `
<div style="font-family:'Times New Roman',Georgia,serif;max-width:700px;margin:0 auto;padding:30px;font-size:13px;line-height:1.8;color:#1a1a1a">
  <h1 style="text-align:center;font-size:18px;font-weight:bold;letter-spacing:2px">UMOWA NAJMU POJAZDU</h1>
  <p style="text-align:center;font-weight:bold">Nr ${safe(fd.contract_number)}</p>
  <p style="text-align:center;margin-bottom:25px">zawarta w dniu <strong>${safe(fd.contract_date)}</strong> pomiędzy:</p>
  <div style="margin-bottom:15px;padding:12px;border-left:3px solid #333">
    <p style="margin:0"><strong>${safe(fd.company_name)}</strong></p>
    <p style="margin:2px 0">NIP: ${safe(fd.company_nip)}</p>
    <p style="margin:5px 0 0;font-style:italic">zwaną dalej „Wynajmującym"</p>
  </div>
  <p style="text-align:center;margin:10px 0">a</p>
  <div style="margin-bottom:20px;padding:12px;border-left:3px solid #333">
    <p style="margin:0"><strong>${safe(fd.renter_name)}</strong></p>
    <p style="margin:2px 0">telefon: ${safe(fd.renter_phone)}</p>
    <p style="margin:5px 0 0;font-style:italic">zwanym dalej „Najemcą"</p>
  </div>
  <h2 style="text-align:center;font-size:14px">§1 Przedmiot umowy</h2>
  <table style="width:100%;border-collapse:collapse;margin:10px 0;border:1px solid #ddd">
    ${row('Marka', fd.car_brand)}${row('Model', fd.car_model)}${row('Numer VIN', fd.car_vin)}${row('Nr rejestracyjny', fd.car_registration)}
  </table>
  <h2 style="text-align:center;font-size:14px">§2 Okres najmu</h2>
  <p>Od <strong>${safe(fd.period_from)}</strong> do <strong>${safe(fd.period_to)}</strong>.</p>
  <h2 style="text-align:center;font-size:14px">§3 Czynsz i kaucja</h2>
  <p>Stawka: <strong>${safe(fd.rate)}</strong>. Kaucja: <strong>${safe(fd.deposit)} zł</strong>.</p>
  <div style="display:flex;justify-content:space-between;margin-top:60px;padding-top:20px;border-top:1px solid #eee">
    <div style="text-align:center;width:45%"><p style="font-weight:bold">Wynajmujący</p></div>
    <div style="text-align:center;width:45%"><p style="font-weight:bold">Najemca</p></div>
  </div>
</div>`;
}

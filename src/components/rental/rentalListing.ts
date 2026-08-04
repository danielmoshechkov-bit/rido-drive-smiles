import { supabase } from '@/integrations/supabase/client';

/** Publikacja auta z wynajmu do ŻYWEGO vehicle_listings (mapper) + mapa rental_listings. */
export interface PublishOpts {
  kind: 'rental' | 'sale';
  price: number | null;        // sprzedaż: cena; wynajem: stawka dzienna
  weeklyPrice: number | null;  // wynajem: stawka tygodniowa
  city?: string; contactName?: string; contactPhone?: string; contactEmail?: string;
  description?: string;
}

export async function publishRentalListing(companyId: string, subject: any, vehicle: any, opts: PublishOpts) {
  const sb = supabase as any;
  const { data: { user } } = await supabase.auth.getUser();
  const transaction_type = opts.kind === 'sale' ? 'sprzedaz' : 'wynajem-krotkoterminowy';
  const photos: string[] = Array.isArray(vehicle?.photos) ? vehicle.photos : [];
  const title = `${[vehicle?.brand, vehicle?.model].filter(Boolean).join(' ') || subject.title}${opts.kind === 'sale' ? ' (Sprzedaż)' : ' (Wynajem)'}`;

  const { data: listing, error } = await sb.from('vehicle_listings').insert({
    title, brand: vehicle?.brand || null, model: vehicle?.model || null, year: vehicle?.year || null,
    body_type: vehicle?.attributes?.body_type || null, fuel_type: vehicle?.fuel || null,
    price: opts.price ?? 0, weekly_price: opts.kind === 'rental' ? (opts.weeklyPrice ?? 0) : 0,
    transaction_type, photos, city: opts.city || null, location: opts.city || null,
    contact_name: opts.contactName || null, contact_phone: opts.contactPhone || null, contact_email: opts.contactEmail || null,
    description_long: opts.description || null, status: 'aktywne', is_available: true, created_by: user?.id || null,
  }).select('id').single();
  if (error) throw error;

  await sb.from('rental_listings').insert({ company_id: companyId, subject_id: subject.id, vehicle_listing_id: listing.id, kind: opts.kind, transaction_type, status: 'active', is_featured: false });
  if (opts.kind === 'rental') await sb.from('rental_vehicles').update({ is_listed: true }).eq('subject_id', subject.id);
  return listing.id as string;
}

export async function unpublishRentalListing(subjectId: string) {
  const sb = supabase as any;
  const { data: rls } = await sb.from('rental_listings').select('id, vehicle_listing_id').eq('subject_id', subjectId).eq('status', 'active');
  for (const rl of (rls || [])) {
    if (rl.vehicle_listing_id) await sb.from('vehicle_listings').update({ status: 'archiwum', is_available: false }).eq('id', rl.vehicle_listing_id);
    await sb.from('rental_listings').update({ status: 'archived' }).eq('id', rl.id);
  }
  await sb.from('rental_vehicles').update({ is_listed: false }).eq('subject_id', subjectId);
}

/** Wyróżnienie — lokalnie stub (płatność P24 + webhook = DEPLOY). */
export async function featureRentalListing(companyId: string, vehicleListingId: string, tier: any) {
  void companyId;
  void vehicleListingId;
  void tier;
  throw new Error('Wyróżnienie wymaga zweryfikowanej płatności i serwerowej aktywacji. Operacja została zablokowana.');
}

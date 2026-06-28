import { generateRentalContractHtml } from '@/components/rental/rentalLib';

/** Mapper booking → umowa (instancja rental_document_instances, status 'draft'). Zwraca id instancji. */
export async function generateBookingContract(sb: any, companyId: string, booking: any): Promise<string> {
  const { data: veh } = await sb.from('rental_vehicles').select('brand, model, vin, plate').eq('subject_id', booking.subject_id).maybeSingle();
  const { data: comp } = await sb.from('companies').select('name, nip').eq('id', companyId).maybeSingle();
  const filled = {
    contract_number: booking.booking_number, contract_date: new Date().toLocaleDateString('pl-PL'),
    company_name: comp?.name, company_nip: comp?.nip,
    renter_name: booking.renter_name, renter_phone: booking.renter_phone,
    car_brand: veh?.brand, car_model: veh?.model, car_vin: veh?.vin, car_registration: veh?.plate,
    period_from: booking.period_start ? new Date(booking.period_start).toLocaleString('pl-PL') : '',
    period_to: booking.period_end ? new Date(booking.period_end).toLocaleString('pl-PL') : '',
    rate: booking.rate_amount != null ? `${booking.rate_amount} zł / ${booking.rate_basis || ''}` : '',
    deposit: booking.deposit_amount != null ? String(booking.deposit_amount) : '',
  };
  const html = generateRentalContractHtml(filled);
  const { data: inst, error } = await sb.from('rental_document_instances').insert({
    company_id: companyId, booking_id: booking.id, subject_id: booking.subject_id,
    template_name: 'Umowa najmu pojazdu', contract_number: booking.booking_number,
    status: 'draft', filled_data: filled, filled_content: html,
  }).select('id').single();
  if (error) throw error;
  return inst.id as string;
}

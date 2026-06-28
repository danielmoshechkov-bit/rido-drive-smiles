import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { expiryColor } from '@/components/rental/rentalLib';
import { RentalDatePickerModal } from '@/components/rental/rentalDatePicker';

/**
 * Klikalne badge OC / Przegląd / Wypow. — daty podawane PROPSAMI (kontrolowane),
 * żeby uniknąć N+1 (lista ładuje je zbiorczo). Po edycji → onSaved (rodzic odświeża).
 */
export function RentalExpiryBadges({ companyId, subjectId, ocTo, inspTo, termTo, onSaved }: {
  companyId: string; subjectId: string; ocTo?: string | null; inspTo?: string | null; termTo?: string | null; onSaved?: () => void;
}) {
  const sb = supabase as any;
  const [policyOpen, setPolicyOpen] = useState(false);
  const [inspOpen, setInspOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const fmt = (s?: string | null) => { if (!s) return 'brak'; try { return format(new Date(s), 'yyyy-MM-dd'); } catch { return s; } };

  const saveOc = async (date: Date) => {
    const value = format(date, 'yyyy-MM-dd');
    const { error } = await sb.from('rental_vehicle_policies').insert({ company_id: companyId, subject_id: subjectId, ptype: 'OC', policy_no: 'TBA', provider: 'TBA', valid_from: new Date().toISOString().slice(0, 10), valid_to: value });
    if (error) return toast.error(error.message);
    setPolicyOpen(false); toast.success('Zapisano datę OC'); onSaved?.();
  };
  const saveInsp = async (date: Date) => {
    const value = format(date, 'yyyy-MM-dd');
    const { error } = await sb.from('rental_vehicle_inspections').insert({ company_id: companyId, subject_id: subjectId, inspection_date: new Date().toISOString().slice(0, 10), valid_to: value, result: 'pozytywny' });
    if (error) return toast.error(error.message);
    setInspOpen(false); toast.success('Zapisano datę przeglądu'); onSaved?.();
  };
  const saveTerm = async (date: Date) => {
    const value = format(date, 'yyyy-MM-dd');
    const { error } = await sb.from('rental_vehicles').update({ contract_termination_date: value }).eq('subject_id', subjectId);
    if (error) return toast.error(error.message);
    setTermOpen(false); toast.success('Zapisano datę wypowiedzenia'); onSaved?.();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
      <Badge className={`rounded-full cursor-pointer hover:opacity-80 ${expiryColor(ocTo)}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setPolicyOpen(true); }}>OC: {fmt(ocTo)}</Badge>
      <Badge className={`rounded-full cursor-pointer hover:opacity-80 ${expiryColor(inspTo)}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setInspOpen(true); }}>Przegląd: {fmt(inspTo)}</Badge>
      {termTo
        ? <Badge className={`rounded-full cursor-pointer hover:opacity-80 ${expiryColor(termTo)}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTermOpen(true); }}>Wypow.: {fmt(termTo)}</Badge>
        : <Badge className="rounded-full cursor-pointer hover:opacity-80 bg-muted text-muted-foreground" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setTermOpen(true); }}>+ Wypow.</Badge>}

      <RentalDatePickerModal isOpen={policyOpen} onClose={() => setPolicyOpen(false)} selected={ocTo ? new Date(ocTo) : undefined} onSelect={saveOc} title="Data ważności OC" />
      <RentalDatePickerModal isOpen={inspOpen} onClose={() => setInspOpen(false)} selected={inspTo ? new Date(inspTo) : undefined} onSelect={saveInsp} title="Data ważności przeglądu" />
      <RentalDatePickerModal isOpen={termOpen} onClose={() => setTermOpen(false)} selected={termTo ? new Date(termTo) : undefined} onSelect={saveTerm} title="Data wypowiedzenia umowy" />
    </div>
  );
}

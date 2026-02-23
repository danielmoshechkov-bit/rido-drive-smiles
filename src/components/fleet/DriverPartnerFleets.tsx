import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building, Plus, Trash2, FileText, Settings } from 'lucide-react';
import { AddPartnerFleetModal } from './AddPartnerFleetModal';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Partnership {
  id: string;
  partner_fleet_id: string;
  settled_by: string;
  is_b2b: boolean;
  invoice_frequency: string;
  transfer_title_template: string | null;
  is_active: boolean;
  partner_fleet: {
    id: string;
    name: string;
    nip: string | null;
    city: string | null;
    email: string | null;
  };
}

interface DriverPartnerFleetsProps {
  driverId: string;
  managingFleetId: string;
  onUpdate?: () => void;
}

export function DriverPartnerFleets({ driverId, managingFleetId, onUpdate }: DriverPartnerFleetsProps) {
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadPartnerships();
  }, [driverId]);

  const loadPartnerships = async () => {
    const { data, error } = await supabase
      .from('driver_fleet_partnerships')
      .select(`
        id, partner_fleet_id, settled_by, is_b2b, invoice_frequency,
        transfer_title_template, is_active,
        partner_fleet:fleets!driver_fleet_partnerships_partner_fleet_id_fkey(id, name, nip, city, email)
      `)
      .eq('driver_id', driverId)
      .eq('managing_fleet_id', managingFleetId)
      .eq('is_active', true);

    if (!error && data) {
      setPartnerships(data as unknown as Partnership[]);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from('driver_fleet_partnerships')
      .update({ is_active: false })
      .eq('id', deleteId);

    if (error) {
      toast.error('Błąd usuwania');
    } else {
      toast.success('Partnerstwo usunięte');
      loadPartnerships();
      onUpdate?.();
    }
    setDeleteId(null);
  };

  const frequencyLabel = (f: string) => {
    switch (f) {
      case 'weekly': return 'Co tydzień';
      case 'biweekly': return 'Co 2 tyg.';
      case 'monthly': return 'Co miesiąc';
      default: return f;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <Building className="h-4 w-4" />
          Floty partnerskie
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); setShowAddModal(true); }}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Dodaj flotę
        </Button>
      </div>

      {partnerships.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Brak przypisanych flot partnerskich</p>
      ) : (
        <div className="space-y-2">
          {partnerships.map(p => (
            <Card key={p.id} className="p-3 bg-muted/30">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{p.partner_fleet?.name}</span>
                    {p.partner_fleet?.nip && (
                      <span className="text-xs text-muted-foreground">NIP: {p.partner_fleet.nip}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {p.settled_by === 'managing' ? 'Rozlicza: my' : 'Rozlicza: partner'}
                    </Badge>
                    {p.is_b2b && (
                      <>
                        <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20 text-xs" variant="outline">
                          <FileText className="h-3 w-3 mr-1" />
                          B2B
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          <Settings className="h-3 w-3 mr-1" />
                          {frequencyLabel(p.invoice_frequency)}
                        </Badge>
                      </>
                    )}
                  </div>
                  {p.partner_fleet?.city && (
                    <p className="text-xs text-muted-foreground">{p.partner_fleet.city}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
                  className="text-destructive hover:text-destructive/80 h-7 w-7 p-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddPartnerFleetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        driverId={driverId}
        managingFleetId={managingFleetId}
        onAdded={() => { loadPartnerships(); onUpdate?.(); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć partnerstwo?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Flota partnerska zostanie odłączona od tego kierowcy.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete}>Usuń</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

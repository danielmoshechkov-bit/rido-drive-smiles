import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Mail, RotateCw, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { WorkshopInviteEmployeeDialog } from './WorkshopInviteEmployeeDialog';

const ROLE_LABEL: Record<string, string> = {
  mechanic: 'Mechanik', reception: 'Recepcja', manager: 'Kierownik', owner: 'Właściciel',
};
const STATUS: Record<string, { label: string; variant: any }> = {
  pending: { label: 'Oczekuje', variant: 'secondary' },
  accepted: { label: 'Zaakceptowano', variant: 'default' },
  rejected: { label: 'Odrzucono', variant: 'destructive' },
  revoked: { label: 'Cofnięto', variant: 'outline' },
};

export const WorkshopInvitationsList = ({ providerId }: { providerId: string }) => {
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetch = async () => {
    const { data, error } = await (supabase.from('workshop_employee_invitations') as any)
      .select('*')
      .eq('provider_id', providerId)
      .order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setInvites(data || []);
    setLoading(false);
  };

  useEffect(() => { if (providerId) fetch(); }, [providerId]);

  const resend = async (inv: any) => {
    setBusyId(inv.id);
    try {
      const { error } = await supabase.functions.invoke('workshop-invite-employee', {
        body: { email: inv.invited_email, provider_id: providerId, role: inv.role, language_preference: inv.language_preference },
      });
      if (error) throw error;
      toast.success('Zaproszenie wysłane ponownie');
      fetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusyId(null); }
  };

  const revoke = async (inv: any) => {
    if (!confirm(`Cofnąć zaproszenie dla ${inv.invited_email}?`)) return;
    setBusyId(inv.id);
    try {
      const { error } = await (supabase.from('workshop_employee_invitations') as any)
        .update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', inv.id);
      if (error) throw error;
      toast.success('Zaproszenie cofnięte');
      fetch();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Zaproszenia ({invites.length})</h3>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" /> Zaproś pracownika</Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Język</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Wysłano</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Brak zaproszeń</TableCell></TableRow>
              )}
              {invites.map(inv => {
                const st = STATUS[inv.status] || STATUS.pending;
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invited_email}</TableCell>
                    <TableCell>{ROLE_LABEL[inv.role] || inv.role}</TableCell>
                    <TableCell className="uppercase text-xs">{inv.language_preference || 'pl'}</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(inv.created_at), { locale: pl, addSuffix: true })}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {inv.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="icon" title="Wyślij ponownie" disabled={busyId === inv.id} onClick={() => resend(inv)}>
                            {busyId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" title="Cofnij" disabled={busyId === inv.id} onClick={() => revoke(inv)}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <WorkshopInviteEmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} providerId={providerId} onSent={fetch} />
    </div>
  );
};

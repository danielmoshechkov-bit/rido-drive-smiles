import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { UserPlus, Send, Loader2, Mail, Clock, Shield } from 'lucide-react';

export function MarketingTeamTab() {
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('marketing_manager');
  const [sending, setSending] = useState(false);

  useEffect(() => { loadInvitations(); }, []);

  const loadInvitations = async () => {
    const { data } = await supabase.from('agency_invitations').select('*').order('created_at', { ascending: false });
    setInvitations(data || []);
    setLoading(false);
  };

  const sendInvite = async () => {
    if (!email.trim()) { toast.error('Podaj email'); return; }
    setSending(true);
    await supabase.from('agency_invitations').insert({ email, role });
    toast.success(`Zaproszenie wysłane na ${email}`);
    setEmail('');
    setSending(false);
    loadInvitations();
  };

  const cancelInvite = async (id: string) => {
    await supabase.from('agency_invitations').update({ status: 'cancelled' }).eq('id', id);
    toast.success('Zaproszenie anulowane');
    loadInvitations();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dostępy & Zespół</h2>

      {/* Invite form */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><UserPlus className="h-4 w-4" /> Zaproś do zespołu</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@firma.pl" type="email" />
            </div>
            <div className="w-[200px]">
              <Label className="text-xs">Rola</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing_manager">Marketing Manager</SelectItem>
                  <SelectItem value="client_viewer">Client Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={sendInvite} disabled={sending} className="gap-1.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Wyślij
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invitations table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Zaproszenia</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : invitations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Brak zaproszeń</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rola</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" />{inv.role === 'marketing_manager' ? 'Manager' : 'Viewer'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'accepted' ? 'default' : inv.status === 'cancelled' ? 'destructive' : 'secondary'}>
                        {inv.status === 'pending' ? 'Oczekuje' : inv.status === 'accepted' ? 'Zaakceptowane' : 'Anulowane'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString('pl-PL')}</TableCell>
                    <TableCell>
                      {inv.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => cancelInvite(inv.id)}>Anuluj</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
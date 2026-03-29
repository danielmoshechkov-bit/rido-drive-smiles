import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Users, Building2, Mail, Loader2 } from 'lucide-react';

export function MarketingClientsTab() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ company_name: '', contact_email: '', contact_name: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    const { data } = await supabase.from('agency_clients').select('*').order('created_at', { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  const addClient = async () => {
    if (!form.company_name.trim()) { toast.error('Podaj nazwę firmy'); return; }
    setSaving(true);
    await supabase.from('agency_clients').insert(form);
    toast.success('Klient dodany');
    setShowAdd(false);
    setForm({ company_name: '', contact_email: '', contact_name: '', notes: '' });
    setSaving(false);
    loadClients();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Klienci Agencji</h2>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Dodaj klienta
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Brak klientów agencji</p>
            <p className="text-xs mt-1">Dodaj pierwszego klienta, aby zarządzać jego kampaniami</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Card key={client.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{client.company_name}</h3>
                    {client.contact_name && <p className="text-sm text-muted-foreground">{client.contact_name}</p>}
                    {client.contact_email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Mail className="h-3 w-3" /> {client.contact_email}
                      </p>
                    )}
                    <div className="flex gap-1.5 mt-3">
                      <Badge variant="secondary">Meta: —</Badge>
                      <Badge variant="secondary">Google: —</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dodaj klienta agencji</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nazwa firmy *</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
            <div><Label>Osoba kontaktowa</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            <div><Label>Email kontaktowy</Label><Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} /></div>
            <div><Label>Notatki</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
            <Button onClick={addClient} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
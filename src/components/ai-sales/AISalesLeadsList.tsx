import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAISalesLeads, useAISalesConversations } from '@/hooks/useAISalesAgents';
import { Search, Users, Phone, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'Nowy', color: 'bg-blue-100 text-blue-800' },
  contacted: { label: 'Kontaktowany', color: 'bg-yellow-100 text-yellow-800' },
  in_conversation: { label: 'W rozmowie', color: 'bg-purple-100 text-purple-800' },
  meeting_booked: { label: 'Spotkanie', color: 'bg-green-100 text-green-800' },
  converted: { label: 'Skonwertowany', color: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Odrzucony', color: 'bg-red-100 text-red-800' },
  no_answer: { label: 'Brak odpowiedzi', color: 'bg-gray-100 text-gray-800' },
  opted_out: { label: 'Wypisany', color: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_MAP: Record<string, string> = {
  hot: '🔥 Gorący',
  warm: '🌡️ Ciepły',
  normal: '📋 Normalny',
  cold: '❄️ Zimny',
};

export function AISalesLeadsList() {
  const { data: leads = [], isLoading } = useAISalesLeads();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const filtered = leads.filter((l: any) => {
    const matchSearch = !search || 
      `${l.first_name} ${l.last_name} ${l.phone} ${l.email}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Szukaj leadów..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['all', 'new', 'contacted', 'in_conversation', 'meeting_booked', 'converted', 'rejected'].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Wszystkie' : STATUS_MAP[s]?.label || s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Brak leadów</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priorytet</TableHead>
                  <TableHead className="text-right">AI Score</TableHead>
                  <TableHead>Ostatni kontakt</TableHead>
                  <TableHead>Próby</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead: any) => {
                  const st = STATUS_MAP[lead.status] || STATUS_MAP.new;
                  return (
                    <TableRow key={lead.id} className="cursor-pointer" onClick={() => setSelectedLead(lead)}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{lead.first_name} {lead.last_name}</span>
                          {lead.city && <span className="text-sm text-muted-foreground ml-2">({lead.city})</span>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{lead.phone || '—'}</TableCell>
                      <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span></TableCell>
                      <TableCell className="text-sm">{PRIORITY_MAP[lead.priority] || lead.priority}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${lead.ai_lead_score >= 70 ? 'text-green-600' : lead.ai_lead_score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {lead.ai_lead_score}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.last_contact_at ? format(new Date(lead.last_contact_at), 'dd.MM HH:mm') : '—'}
                      </TableCell>
                      <TableCell className="text-center">{lead.contact_attempts || 0}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Phone className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MessageSquare className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Lead detail dialog */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedLead?.first_name} {selectedLead?.last_name}</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-sm text-muted-foreground">Telefon</span><p className="font-mono">{selectedLead.phone}</p></div>
                <div><span className="text-sm text-muted-foreground">Email</span><p>{selectedLead.email || '—'}</p></div>
                <div><span className="text-sm text-muted-foreground">Miasto</span><p>{selectedLead.city || '—'}</p></div>
                <div><span className="text-sm text-muted-foreground">AI Score</span><p className="text-xl font-bold">{selectedLead.ai_lead_score}</p></div>
              </div>
              {selectedLead.ai_intent_analysis && (
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-1">Analiza AI</h4>
                  <p className="text-sm">{selectedLead.ai_intent_analysis}</p>
                </div>
              )}
              {selectedLead.ai_recommended_approach && (
                <div className="bg-primary/5 rounded-lg p-4">
                  <h4 className="font-medium mb-1">Rekomendowane podejście</h4>
                  <p className="text-sm">{selectedLead.ai_recommended_approach}</p>
                </div>
              )}
              {selectedLead.notes && (
                <div><span className="text-sm text-muted-foreground">Notatki</span><p className="text-sm">{selectedLead.notes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

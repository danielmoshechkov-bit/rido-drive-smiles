import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, TicketCheck, Plus, Trash2, Copy, CheckCircle, XCircle, Sparkles, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Ticket {
  id: string;
  submitted_by_email: string;
  description: string;
  screenshot_urls: string[];
  status: string;
  ai_repair_prompt: string | null;
  admin_notes: string | null;
  created_at: string;
}

interface WhitelistEntry {
  id: string;
  email: string;
  created_at: string;
}

export function SupportTicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'whitelist'>('tickets');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [ticketsRes, whitelistRes] = await Promise.all([
      supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
      supabase.from('ticket_chat_whitelist').select('*').order('created_at', { ascending: false }),
    ]);
    setTickets((ticketsRes.data as any[]) || []);
    setWhitelist((whitelistRes.data as any[]) || []);
    setLoading(false);
  };

  const addToWhitelist = async () => {
    if (!newEmail.trim()) return;
    const { error } = await supabase.from('ticket_chat_whitelist').insert({ email: newEmail.trim().toLowerCase() });
    if (error) {
      toast.error('Nie udało się dodać emaila');
    } else {
      toast.success('Dodano do whitelisty');
      setNewEmail('');
      fetchAll();
    }
  };

  const removeFromWhitelist = async (id: string) => {
    await supabase.from('ticket_chat_whitelist').delete().eq('id', id);
    toast.success('Usunięto z whitelisty');
    fetchAll();
  };

  const generateRepairPrompt = async (ticketId: string) => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/generate-repair-prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      toast.success('Prompt naprawczy wygenerowany!');
      fetchAll();
      setSelectedTicket(null);
    } catch (e: any) {
      toast.error(e.message || 'Błąd generowania');
    } finally {
      setGenerating(false);
    }
  };

  const rejectTicket = async (ticketId: string) => {
    await supabase.from('support_tickets').update({ status: 'rejected' }).eq('id', ticketId);
    toast.success('Zgłoszenie odrzucone');
    fetchAll();
    setSelectedTicket(null);
  };

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    toast.success('Prompt skopiowany do schowka!');
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      new: { label: 'Nowe', variant: 'default' },
      approved: { label: 'Zaakceptowane', variant: 'secondary' },
      rejected: { label: 'Odrzucone', variant: 'destructive' },
      completed: { label: 'Ukończone', variant: 'outline' },
    };
    const s = map[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'tickets' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('tickets')}
        >
          <TicketCheck className="h-4 w-4 mr-1" /> Zgłoszenia ({tickets.length})
        </Button>
        <Button
          variant={activeTab === 'whitelist' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('whitelist')}
        >
          Whitelist ({whitelist.length})
        </Button>
      </div>

      {activeTab === 'whitelist' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dostęp do czatu zgłoszeń</CardTitle>
            <CardDescription>Maile użytkowników, którzy mogą wysyłać zgłoszenia przez czat</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToWhitelist()}
              />
              <Button onClick={addToWhitelist} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Dodaj
              </Button>
            </div>
            <div className="space-y-2">
              {whitelist.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <span className="text-sm">{entry.email}</span>
                  <Button variant="ghost" size="sm" onClick={() => removeFromWhitelist(entry.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {whitelist.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Brak wpisów</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'tickets' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Brak zgłoszeń</p>
              </CardContent>
            </Card>
          ) : (
            tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTicket(ticket)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getStatusBadge(ticket.status)}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(ticket.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{ticket.submitted_by_email}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ticket.description}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {ticket.screenshot_urls?.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {ticket.screenshot_urls.length}
                        </Badge>
                      )}
                      {ticket.ai_repair_prompt && (
                        <Badge variant="secondary" className="text-[10px]">
                          <Sparkles className="h-3 w-3 mr-1" /> Prompt
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Ticket Detail Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Zgłoszenie {getStatusBadge(selectedTicket.status)}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Od: {selectedTicket.submitted_by_email}</p>
                  <p className="text-sm text-muted-foreground">
                    Data: {format(new Date(selectedTicket.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                  </p>
                </div>

                <div>
                  <h4 className="font-medium mb-1">Opis problemu</h4>
                  <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>

                {selectedTicket.screenshot_urls?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Screenshoty ({selectedTicket.screenshot_urls.length})</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedTicket.screenshot_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Screenshot ${i + 1}`} className="rounded-md border w-full h-auto" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTicket.ai_repair_prompt && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium flex items-center gap-1">
                        <Sparkles className="h-4 w-4" /> Prompt naprawczy AI
                      </h4>
                      <Button size="sm" variant="outline" onClick={() => copyPrompt(selectedTicket.ai_repair_prompt!)}>
                        <Copy className="h-3 w-3 mr-1" /> Kopiuj
                      </Button>
                    </div>
                    <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                      {selectedTicket.ai_repair_prompt}
                    </pre>
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2">
                {selectedTicket.status === 'new' && (
                  <>
                    <Button variant="destructive" size="sm" onClick={() => rejectTicket(selectedTicket.id)}>
                      <XCircle className="h-4 w-4 mr-1" /> Odrzuć
                    </Button>
                    <Button size="sm" onClick={() => generateRepairPrompt(selectedTicket.id)} disabled={generating}>
                      {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Akceptuj i generuj prompt
                    </Button>
                  </>
                )}
                {selectedTicket.status === 'approved' && !selectedTicket.ai_repair_prompt && (
                  <Button size="sm" onClick={() => generateRepairPrompt(selectedTicket.id)} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Generuj prompt
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

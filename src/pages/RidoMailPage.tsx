import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Mail, Plus, ArrowLeft, Loader2, Sparkles, RefreshCw,
  Inbox, Star, Trash2, Send, AlertTriangle, Clock,
  FileText, MessageSquare, ChevronRight, Eye, Bot,
  Shield, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

const RIDO_AVATAR = '/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png';

interface EmailAccount {
  id: string;
  email: string;
  display_name: string;
  provider: string;
  is_connected: boolean;
  last_sync_at: string | null;
  unread_count: number;
  auto_reply_enabled: boolean;
}

interface Email {
  id: string;
  account_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  body_text: string | null;
  received_at: string | null;
  is_read: boolean;
  is_important: boolean;
  folder: string;
  ai_summary: string | null;
  ai_priority: string | null;
  ai_category: string | null;
  ai_action_items: any;
  ai_suggested_replies: any;
  ai_analyzed_at: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-600 border-red-200',
  normal: 'bg-blue-500/10 text-blue-600 border-blue-200',
  low: 'bg-muted text-muted-foreground',
};

const CATEGORY_ICONS: Record<string, string> = {
  faktura: '💰', zapytanie: '❓', spotkanie: '📅', newsletter: '📰', spam: '🗑️', inne: '📧',
};

export default function RidoMailPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [generatedReply, setGeneratedReply] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'detail'>('list');

  // Add account form
  const [newEmail, setNewEmail] = useState('');
  const [newImapHost, setNewImapHost] = useState('');
  const [newImapPort, setNewImapPort] = useState('993');
  const [newSmtpHost, setNewSmtpHost] = useState('');
  const [newSmtpPort, setNewSmtpPort] = useState('587');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    const { data } = await supabase.from('email_accounts').select('*').order('created_at');
    setAccounts((data || []) as any);
    if (data && data.length > 0 && !selectedAccount) {
      setSelectedAccount(data[0].id);
      loadEmails(data[0].id);
    }
    setLoading(false);
  };

  const loadEmails = async (accountId: string) => {
    const { data } = await supabase
      .from('emails')
      .select('*')
      .eq('account_id', accountId)
      .order('received_at', { ascending: false })
      .limit(50);
    setEmails((data || []) as any);
  };

  const handleAddAccount = async () => {
    if (!newEmail || !newImapHost || !newPassword) {
      toast.error('Wypełnij wymagane pola');
      return;
    }
    setAddingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('rido-mail', {
        body: {
          action: 'add_account',
          email: newEmail,
          imap_host: newImapHost,
          imap_port: parseInt(newImapPort),
          smtp_host: newSmtpHost || newImapHost.replace('imap', 'smtp'),
          smtp_port: parseInt(newSmtpPort),
          password: newPassword,
          display_name: newDisplayName || newEmail,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Skrzynka dodana!');
      setShowAddDialog(false);
      setNewEmail(''); setNewImapHost(''); setNewPassword(''); setNewDisplayName('');
      loadAccounts();
    } catch (err: any) {
      toast.error(err.message || 'Błąd dodawania konta');
    } finally {
      setAddingAccount(false);
    }
  };

  const handleSync = async () => {
    if (!selectedAccount) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('rido-mail', {
        body: { action: 'sync_emails', account_id: selectedAccount },
      });
      if (error) throw error;
      toast.success('Synchronizacja zakończona');
      loadEmails(selectedAccount);
      loadAccounts();
    } catch (err: any) {
      toast.error(err.message || 'Błąd synchronizacji');
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async (emailId: string) => {
    setAnalyzing(emailId);
    try {
      const { data, error } = await supabase.functions.invoke('rido-mail', {
        body: { action: 'analyze_email', email_id: emailId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Email przeanalizowany');
      loadEmails(selectedAccount!);
      // Update selected email if it matches
      if (selectedEmail?.id === emailId) {
        const { data: updated } = await supabase.from('emails').select('*').eq('id', emailId).single();
        if (updated) setSelectedEmail(updated as any);
      }
    } catch (err: any) {
      toast.error(err.message || 'Błąd analizy');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleGenerateReply = async (style: string) => {
    if (!selectedEmail) return;
    setGeneratingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke('rido-mail', {
        body: { action: 'generate_reply', email_id: selectedEmail.id, style },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedReply(data.reply);
    } catch (err: any) {
      toast.error(err.message || 'Błąd generowania');
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę skrzynkę?')) return;
    try {
      const { error } = await supabase.functions.invoke('rido-mail', {
        body: { action: 'delete_account', account_id: accountId },
      });
      if (error) throw error;
      toast.success('Skrzynka usunięta');
      if (selectedAccount === accountId) {
        setSelectedAccount(null);
        setEmails([]);
      }
      loadAccounts();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const autoDetectServers = (email: string) => {
    setNewEmail(email);
    const domain = email.split('@')[1];
    if (!domain) return;
    if (domain.includes('gmail')) {
      setNewImapHost('imap.gmail.com');
      setNewSmtpHost('smtp.gmail.com');
    } else if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
      setNewImapHost('outlook.office365.com');
      setNewSmtpHost('smtp.office365.com');
      setNewSmtpPort('587');
    } else if (domain.includes('yahoo')) {
      setNewImapHost('imap.mail.yahoo.com');
      setNewSmtpHost('smtp.mail.yahoo.com');
    } else if (domain.includes('wp.pl')) {
      setNewImapHost('imap.wp.pl');
      setNewSmtpHost('smtp.wp.pl');
    } else if (domain.includes('o2.pl')) {
      setNewImapHost('poczta.o2.pl');
      setNewSmtpHost('poczta.o2.pl');
    } else if (domain.includes('onet.pl')) {
      setNewImapHost('imap.poczta.onet.pl');
      setNewSmtpHost('smtp.poczta.onet.pl');
    } else {
      setNewImapHost(`imap.${domain}`);
      setNewSmtpHost(`smtp.${domain}`);
    }
  };

  const currentAccount = accounts.find(a => a.id === selectedAccount);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => activeView === 'detail' ? setActiveView('list') : navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <img src={RIDO_AVATAR} alt="RidoAI" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <h1 className="font-bold text-sm flex items-center gap-1.5">
              Rido Mail <Sparkles className="h-3.5 w-3.5 text-primary" />
            </h1>
            <p className="text-[11px] text-muted-foreground">Asystent poczty</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || !selectedAccount}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1", syncing && "animate-spin")} />
              Sync
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Dodaj skrzynkę</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Dodaj skrzynkę pocztową</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Email *</Label>
                    <Input
                      value={newEmail}
                      onChange={e => autoDetectServers(e.target.value)}
                      placeholder="jan@gmail.com"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nazwa wyświetlana</Label>
                    <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Jan Kowalski" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Serwer IMAP *</Label>
                      <Input value={newImapHost} onChange={e => setNewImapHost(e.target.value)} placeholder="imap.gmail.com" />
                    </div>
                    <div>
                      <Label className="text-xs">Port IMAP</Label>
                      <Input value={newImapPort} onChange={e => setNewImapPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Serwer SMTP</Label>
                      <Input value={newSmtpHost} onChange={e => setNewSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
                    </div>
                    <div>
                      <Label className="text-xs">Port SMTP</Label>
                      <Input value={newSmtpPort} onChange={e => setNewSmtpPort(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Hasło / Hasło aplikacji *</Label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Dla Gmail użyj hasła aplikacji (2FA → Hasła aplikacji)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                    <Shield className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Hasło jest szyfrowane i przechowywane bezpiecznie. Nigdy nie jest widoczne w postaci jawnej.
                    </p>
                  </div>
                  <Button onClick={handleAddAccount} disabled={addingAccount} className="w-full">
                    {addingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Połącz skrzynkę
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {accounts.length === 0 ? (
          /* Empty state */
          <Card className="p-12 text-center">
            <Mail className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-bold mb-2">Witaj w Rido Mail</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Podłącz swoją skrzynkę pocztową, a Rido AI pomoże Ci zarządzać mailami – podsumowania, priorytety i sugerowane odpowiedzi.
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Dodaj pierwszą skrzynkę
            </Button>
          </Card>
        ) : (
          <div className="flex gap-4">
            {/* Sidebar - account list */}
            <div className="w-64 flex-shrink-0 hidden md:block space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">Skrzynki</p>
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedAccount(acc.id); loadEmails(acc.id); setActiveView('list'); setSelectedEmail(null); }}
                  className={cn(
                    "w-full text-left p-3 rounded-xl text-sm transition group",
                    selectedAccount === acc.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-[13px]">{acc.display_name}</p>
                      <p className={cn("text-[10px] truncate", selectedAccount === acc.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {acc.email}
                      </p>
                    </div>
                    {acc.unread_count > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">{acc.unread_count}</Badge>
                    )}
                  </div>
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs mt-2"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-2" /> Dodaj skrzynkę
              </Button>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {activeView === 'list' && (
                <div className="space-y-2">
                  {emails.length === 0 ? (
                    <Card className="p-8 text-center text-muted-foreground">
                      <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Brak maili. Kliknij Sync aby pobrać.</p>
                      <p className="text-[10px] mt-1">Lub skrzynka jest pusta.</p>
                    </Card>
                  ) : emails.map(email => (
                    <Card
                      key={email.id}
                      className={cn(
                        "p-3 cursor-pointer hover:shadow-md transition group",
                        !email.is_read && "border-l-4 border-l-primary"
                      )}
                      onClick={() => { setSelectedEmail(email); setActiveView('detail'); setGeneratedReply(''); }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className={cn("text-sm truncate", !email.is_read && "font-bold")}>
                              {email.from_name || email.from_address || 'Nieznany'}
                            </p>
                            {email.ai_priority && (
                              <Badge variant="outline" className={cn("text-[9px] px-1", PRIORITY_COLORS[email.ai_priority])}>
                                {email.ai_priority === 'high' ? '⚡ Ważne' : email.ai_priority === 'low' ? 'Niski' : 'Normalny'}
                              </Badge>
                            )}
                            {email.ai_category && (
                              <span className="text-[10px]">{CATEGORY_ICONS[email.ai_category] || '📧'}</span>
                            )}
                          </div>
                          <p className="text-[13px] truncate">{email.subject || '(Brak tematu)'}</p>
                          {email.ai_summary && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{email.ai_summary}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {email.received_at ? new Date(email.received_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : ''}
                          </span>
                          {!email.ai_analyzed_at && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={(e) => { e.stopPropagation(); handleAnalyze(email.id); }}
                              disabled={analyzing === email.id}
                            >
                              {analyzing === email.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                            </Button>
                          )}
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {activeView === 'detail' && selectedEmail && (
                <div className="space-y-4">
                  {/* Email header */}
                  <Card className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h2 className="font-bold text-lg">{selectedEmail.subject || '(Brak tematu)'}</h2>
                        <p className="text-sm text-muted-foreground">
                          Od: {selectedEmail.from_name || selectedEmail.from_address}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {selectedEmail.received_at ? new Date(selectedEmail.received_at).toLocaleString('pl-PL') : ''}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {selectedEmail.ai_priority && (
                          <Badge variant="outline" className={PRIORITY_COLORS[selectedEmail.ai_priority]}>
                            {selectedEmail.ai_priority}
                          </Badge>
                        )}
                        {selectedEmail.ai_category && (
                          <Badge variant="outline">{CATEGORY_ICONS[selectedEmail.ai_category]} {selectedEmail.ai_category}</Badge>
                        )}
                      </div>
                    </div>

                    {/* AI Summary */}
                    {selectedEmail.ai_summary && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 mb-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          <span className="text-[11px] font-semibold text-primary">Podsumowanie RidoAI</span>
                        </div>
                        <p className="text-sm">{selectedEmail.ai_summary}</p>
                      </div>
                    )}

                    {/* Email body */}
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm mt-3 max-h-[300px] overflow-y-auto">
                      {selectedEmail.body_text || '(Brak treści)'}
                    </div>
                  </Card>

                  {/* Action Items */}
                  {selectedEmail.ai_action_items && (selectedEmail.ai_action_items as any[]).length > 0 && (
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-primary" /> Zadania z maila
                      </h3>
                      <div className="space-y-1.5">
                        {(selectedEmail.ai_action_items as any[]).map((item: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded-lg">
                            <span className="text-primary font-bold">{i + 1}.</span>
                            <div>
                              <p>{item.task}</p>
                              {item.deadline && <p className="text-[11px] text-muted-foreground">⏰ {item.deadline}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Suggested Replies */}
                  {selectedEmail.ai_suggested_replies && (selectedEmail.ai_suggested_replies as any[]).length > 0 && (
                    <Card className="p-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
                        <MessageSquare className="h-4 w-4 text-primary" /> Sugestie odpowiedzi
                      </h3>
                      <div className="space-y-2">
                        {(selectedEmail.ai_suggested_replies as string[]).map((reply, i) => (
                          <div
                            key={i}
                            className="p-3 border rounded-lg text-sm cursor-pointer hover:bg-accent transition"
                            onClick={() => setGeneratedReply(reply)}
                          >
                            {reply}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Generate reply */}
                  <Card className="p-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                      <Send className="h-4 w-4 text-primary" /> Odpowiedz z RidoAI
                    </h3>
                    <div className="flex gap-2 mb-3">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => handleGenerateReply('formal')}
                        disabled={generatingReply}
                      >
                        {generatingReply ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Formalna
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleGenerateReply('friendly')} disabled={generatingReply}>
                        Przyjazna
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleGenerateReply('short')} disabled={generatingReply}>
                        Krótka
                      </Button>
                    </div>

                    {!selectedEmail.ai_analyzed_at && (
                      <Button
                        variant="secondary" size="sm" className="mb-3"
                        onClick={() => handleAnalyze(selectedEmail.id)}
                        disabled={analyzing === selectedEmail.id}
                      >
                        {analyzing === selectedEmail.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Bot className="h-3 w-3 mr-1" />}
                        Analizuj najpierw
                      </Button>
                    )}

                    {generatedReply && (
                      <div className="space-y-2">
                        <Textarea
                          value={generatedReply}
                          onChange={e => setGeneratedReply(e.target.value)}
                          rows={6}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled>
                            <Send className="h-3 w-3 mr-1" /> Wyślij
                          </Button>
                          <p className="text-[10px] text-muted-foreground self-center">
                            Wysyłanie SMTP będzie dostępne po podłączeniu serwera
                          </p>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

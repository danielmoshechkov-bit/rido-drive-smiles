import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Users, Search, Download, Mail, Phone, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { AddUserDialog } from './AddUserDialog';

interface UserProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  created_at: string;
  source?: string;
}

interface AdminUsersPanelProps {
  title?: string;
  description?: string;
  source?: 'marketplace' | 'services' | 'realestate' | 'all';
}

export function AdminUsersPanel({ 
  title = 'Użytkownicy',
  description = 'Lista zarejestrowanych użytkowników',
  source = 'all'
}: AdminUsersPanelProps) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [source]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      let data: UserProfile[] = [];

      if (source === 'marketplace' || source === 'all') {
        const { data: marketplaceUsers } = await supabase
          .from('marketplace_user_profiles')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (marketplaceUsers) {
          data = [...data, ...marketplaceUsers.map(u => ({ ...u, source: 'Giełda' }))];
        }
      }

      if (source === 'services' || source === 'all') {
        const { data: serviceProviders } = await supabase
          .from('service_providers')
          .select('id, user_id, company_name, owner_first_name, owner_last_name, owner_email, owner_phone, created_at')
          .order('created_at', { ascending: false });
        
        if (serviceProviders) {
          data = [...data, ...serviceProviders.map(u => ({
            id: u.id,
            user_id: u.user_id || '',
            first_name: u.owner_first_name,
            last_name: u.owner_last_name,
            email: u.owner_email,
            phone: u.owner_phone,
            company_name: u.company_name,
            created_at: u.created_at,
            source: 'Usługi'
          }))];
        }
      }

      if (source === 'realestate' || source === 'all') {
        const { data: agents } = await supabase
          .from('real_estate_agents')
          .select('id, user_id, agent_name, email, phone, company_name, created_at')
          .order('created_at', { ascending: false });
        
        if (agents) {
          data = [...data, ...agents.map((u: any) => ({
            id: u.id,
            user_id: u.user_id || '',
            first_name: u.agent_name?.split(' ')[0] || null,
            last_name: u.agent_name?.split(' ').slice(1).join(' ') || null,
            email: u.email,
            phone: u.phone,
            company_name: u.company_name,
            created_at: u.created_at,
            source: 'Nieruchomości'
          }))];
        }
      }

      // Sort by created_at descending
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Błąd wczytywania użytkowników');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.first_name?.toLowerCase().includes(query) ||
      user.last_name?.toLowerCase().includes(query) ||
      user.phone?.includes(query) ||
      user.company_name?.toLowerCase().includes(query)
    );
  });

  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Email', 'Imię', 'Nazwisko', 'Telefon', 'Firma', 'Źródło', 'Data rejestracji'];
      const rows = filteredUsers.map(u => [
        u.email || '',
        u.first_name || '',
        u.last_name || '',
        u.phone || '',
        u.company_name || '',
        u.source || '',
        new Date(u.created_at).toLocaleDateString('pl-PL')
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(c => `"${c}"`).join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `uzytkownicy_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Wyeksportowano do CSV');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Błąd eksportu');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" onClick={exportToCSV} disabled={exporting || filteredUsers.length === 0}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Eksport CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj po email, imieniu, nazwisku, telefonie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Brak użytkowników</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Użytkownik</TableHead>
                  <TableHead>Kontakt</TableHead>
                  {source === 'all' && <TableHead>Źródło</TableHead>}
                  <TableHead>Data rejestracji</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {user.first_name || user.last_name 
                            ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                            : 'Brak danych'
                          }
                        </p>
                        {user.company_name && (
                          <p className="text-sm text-muted-foreground">{user.company_name}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {user.email && (
                          <div className="flex items-center text-sm">
                            <Mail className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            <a href={`mailto:${user.email}`} className="hover:text-primary">
                              {user.email}
                            </a>
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center text-sm">
                            <Phone className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                            <a href={`tel:${user.phone}`} className="hover:text-primary">
                              {user.phone}
                            </a>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    {source === 'all' && (
                      <TableCell>
                        <Badge variant="outline">{user.source}</Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 mr-1" />
                        {new Date(user.created_at).toLocaleDateString('pl-PL')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-4">
          Łącznie: {filteredUsers.length} użytkowników
        </p>
      </CardContent>
    </Card>
  );
}

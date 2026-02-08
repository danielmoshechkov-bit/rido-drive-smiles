import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Users, Search, Trash2, CheckCircle, XCircle, RefreshCw, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  has_profile: boolean;
  account_type: string;
}

export function AdminAuthUsersPanel() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list' },
      });

      if (error) {
        throw new Error(error.message);
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }

      setUsers(data?.users || []);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error('Błąd wczytywania użytkowników: ' + (error.message || 'Nieznany błąd'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', user_id: deleteUserId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Użytkownik usunięty');
      setUsers(users.filter(u => u.id !== deleteUserId));
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Błąd usuwania: ' + (error.message || 'Nieznany błąd'));
    } finally {
      setDeleting(false);
      setDeleteUserId(null);
    }
  };

  const handleConfirmEmail = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'confirm-email', user_id: userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Email potwierdzony');
      // Update local state
      setUsers(users.map(u => 
        u.id === userId ? { ...u, email_confirmed_at: new Date().toISOString() } : u
      ));
    } catch (error: any) {
      console.error('Confirm email error:', error);
      toast.error('Błąd: ' + (error.message || 'Nieznany błąd'));
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.first_name?.toLowerCase().includes(query) ||
      user.last_name?.toLowerCase().includes(query) ||
      user.phone?.includes(query)
    );
  });

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Wszyscy użytkownicy (Auth)
              </CardTitle>
              <CardDescription>
                Lista wszystkich zarejestrowanych użytkowników w systemie autoryzacji
              </CardDescription>
            </div>
            <Button variant="outline" onClick={loadUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Odśwież
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj po email, imieniu, nazwisku..."
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
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Typ konta</TableHead>
                    <TableHead>Data rejestracji</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map(user => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{user.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.first_name || user.last_name 
                          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                          : <span className="text-muted-foreground">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {user.email_confirmed_at ? (
                            <Badge variant="default" className="w-fit bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Zweryfikowany
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="w-fit">
                              <XCircle className="h-3 w-3 mr-1" />
                              Niezweryfikowany
                            </Badge>
                          )}
                          {user.has_profile ? (
                            <Badge variant="outline" className="w-fit text-green-600 border-green-600">
                              Ma profil
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit text-yellow-600 border-yellow-600">
                              Brak profilu
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {user.account_type === 'marketplace' ? 'Giełda' : user.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(user.created_at).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {!user.email_confirmed_at && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleConfirmEmail(user.id)}
                              title="Potwierdź email ręcznie"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteUserId(user.id)}
                            title="Usuń użytkownika"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Czy na pewno chcesz usunąć tego użytkownika?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta operacja jest nieodwracalna. Użytkownik zostanie całkowicie usunięty z systemu 
              wraz ze wszystkimi powiązanymi danymi (profil, role, itp.).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Usuwanie...
                </>
              ) : (
                'Usuń użytkownika'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

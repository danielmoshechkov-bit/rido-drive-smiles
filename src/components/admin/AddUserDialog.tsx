import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

interface AddUserDialogProps {
  onUserCreated?: () => void;
}

export function AddUserDialog({ onUserCreated }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Musisz być zalogowany');
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: { email, password },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Utworzono konto: ${email}`);
      setEmail('');
      setPassword('');
      setOpen(false);
      onUserCreated?.();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(error.message || 'Błąd tworzenia konta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="h-4 w-4 mr-2" />
          Dodaj użytkownika
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dodaj użytkownika</DialogTitle>
          <DialogDescription>Utwórz nowe konto z automatyczną aktywacją email.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Hasło</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 znaków"
              required
              minLength={6}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Utwórz konto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

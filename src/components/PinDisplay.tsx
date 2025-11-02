import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export function PinDisplay({ pin }: { pin: string }) {
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    setShowPasswordPrompt(true);
  };

  const handlePasswordSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast.error("Nie można zweryfikować użytkownika");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    });

    if (error) {
      toast.error("Nieprawidłowe hasło");
      setPassword("");
      return;
    }

    setRevealed(true);
    setShowPasswordPrompt(false);
    setPassword("");
    
    // Auto-hide after 30 seconds
    setTimeout(() => setRevealed(false), 30000);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-primary">
          {revealed ? pin : "••••"}
        </p>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleReveal}
          className="h-6 w-6 p-0"
        >
          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      </div>

      <Dialog open={showPasswordPrompt} onOpenChange={setShowPasswordPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdź swoją tożsamość</DialogTitle>
            <DialogDescription>
              Wprowadź hasło do konta, aby wyświetlić PIN karty paliwowej
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordPrompt(false)}>
              Anuluj
            </Button>
            <Button onClick={handlePasswordSubmit}>Potwierdź</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MyViewingsPanel } from '@/components/realestate/MyViewingsPanel';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';

export default function MyViewingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/auth?redirect=/moje-ogladania');
      else setUser(user);
    });
  }, [navigate]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <UniversalHomeButton />
          <Button variant="ghost" size="sm" onClick={() => navigate('/nieruchomosci')} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Nieruchomości
          </Button>
          <span className="font-bold text-lg text-primary flex items-center gap-2">
            <Eye className="h-5 w-5" /> Moje oglądania
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <MyViewingsPanel />
      </main>
    </div>
  );
}

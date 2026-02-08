import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Owner emails with full access to all features
export const OWNER_EMAILS = [
  'daniel.moshechkov@gmail.com',
  'anastasiia.shapovalova1991@gmail.com'
];

export function useOwnerAccess() {
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || null;
      setUserEmail(email);
      setIsOwner(email ? OWNER_EMAILS.includes(email) : false);
      setLoading(false);
    };
    
    checkAccess();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const email = session?.user?.email || null;
      setUserEmail(email);
      setIsOwner(email ? OWNER_EMAILS.includes(email) : false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isOwner, loading, userEmail };
}

// Helper to check if email is owner
export function isOwnerEmail(email: string | null | undefined): boolean {
  return email ? OWNER_EMAILS.includes(email) : false;
}

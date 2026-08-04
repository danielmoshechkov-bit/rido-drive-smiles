import './i18n'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { supabase } from '@/integrations/supabase/client'
import {
  bootstrapPrincipalIsolation,
  principalFingerprint,
} from '@/security/sessionIsolation'

async function bootstrapApplication() {
  let principal = "anonymous";
  try {
    const { data } = await supabase.auth.getSession();
    principal = principalFingerprint(data.session);
  } catch {
    // Brak dostępnej sesji nie może ominąć czyszczenia historycznego cache.
  }

  await bootstrapPrincipalIsolation(principal);
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrapApplication();

import './i18n'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { enableAuthCache } from '@/lib/authCache';

// Sklejanie zapytan "kim jest zalogowany" — patrz src/lib/authCache.ts
enableAuthCache();

createRoot(document.getElementById("root")!).render(<App />);

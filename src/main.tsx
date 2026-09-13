import './i18n'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { enableAuthCache } from '@/lib/authCache';
import { zapamietajKlikniecieReklamy } from '@/lib/ciasteczkaMeta';

// Sklejanie zapytan "kim jest zalogowany" — patrz src/lib/authCache.ts
enableAuthCache();

/**
 * `fbclid` zapamiętujemy TU, przed `createRoot`.
 *
 * Router zdejmuje nieznane parametry przy pierwszej nawigacji, a piksel nie
 * startuje przed zgodą marketingową — czyli w chwili, gdy klient klika
 * „Akceptuję", parametru z reklamy zwykle już nie ma. Bez tego zapisu
 * konwersja od klienta, który PRZYSZEDŁ Z REKLAMY, nie da się z nią powiązać.
 * Patrz src/lib/ciasteczkaMeta.ts — sam zapis nie jest jeszcze śledzeniem.
 */
zapamietajKlikniecieReklamy();

createRoot(document.getElementById("root")!).render(<App />);

// Front używa DOKŁADNIE tego samego kodu, co funkcje brzegowe.
//
// Ten sam wzorzec co `src/utils/invoiceNumbering.ts`: jedno źródło prawdy leży
// w `supabase/functions/_shared/`, bo stamtąd biorą je Deno i przeglądarka.
// Kopia wzoru w komponencie to prosta droga do dwóch różnych podatków na dwóch
// ekranach — dokładnie to naprawiamy.
export * from '../../supabase/functions/_shared/rozliczenia';

// Numeracja faktur — re-eksport kanonicznej implementacji z modułu wspólnego.
//
// Ta sama logika musi działać we froncie (podgląd numeru w kreatorze faktury)
// i w edge function (faktura sprzedażowa GetRido z webhooka Stripe). Dwie kopie
// rozjechałyby się przy pierwszej zmianie wzoru, a skutkiem byłyby dwie faktury
// o tym samym numerze — nieodwracalne po wysyłce do KSeF.
export * from '../../supabase/functions/_shared/invoiceNumbering';

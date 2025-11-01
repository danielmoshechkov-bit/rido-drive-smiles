import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface FuelTransaction {
  card_number: string;
  transaction_date: string;
  transaction_time: string;
  vehicle_number: string | null;
  driver_name: string | null;
  brand: string;
  liters: number;
  price_per_liter: number;
  total_amount: number;
  fuel_type: string;
  period_from: string;
  period_to: string;
}

const convertDate = (dateStr: string): string => {
  // Convert DD.MM.YYYY to YYYY-MM-DD
  const [day, month, year] = dateStr.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const parseNumber = (numStr: string): number => {
  // Convert "36,08" to 36.08
  return parseFloat(numStr.replace(',', '.'));
};

const parseCSV = (csvText: string, periodFrom: string, periodTo: string): FuelTransaction[] => {
  // Remove BOM if exists
  const cleanText = csvText.replace(/^\uFEFF/, '');
  
  // Split into lines
  const lines = cleanText.split('\n').filter(line => line.trim());
  
  // Skip header (first line)
  const dataLines = lines.slice(1);
  
  return dataLines.map(line => {
    const columns = line.split(';').map(col => col.trim());
    
    return {
      card_number: columns[0],
      transaction_date: convertDate(columns[1]),
      transaction_time: columns[2],
      vehicle_number: columns[3] || null,
      driver_name: columns[4] || null,
      brand: columns[5],
      liters: parseNumber(columns[6]),
      price_per_liter: parseNumber(columns[7]),
      total_amount: parseNumber(columns[8]),
      fuel_type: columns[9],
      period_from: periodFrom,
      period_to: periodTo
    };
  });
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { csv_text, period_from, period_to } = await req.json();

    if (!csv_text || !period_from || !period_to) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: csv_text, period_from, period_to' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting fuel import for period ${period_from} to ${period_to}`);

    // Parse CSV
    const transactions = parseCSV(csv_text, period_from, period_to);
    
    console.log(`Parsed ${transactions.length} transactions`);

    // Insert transactions in batches
    const batchSize = 100;
    let imported = 0;
    let errors = 0;

    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('fuel_transactions')
        .insert(batch);

      if (error) {
        console.error('Batch insert error:', error);
        errors += batch.length;
      } else {
        imported += batch.length;
      }
    }

    // Calculate statistics
    const uniqueCards = new Set(transactions.map(t => t.card_number)).size;
    const totalAmount = transactions.reduce((sum, t) => sum + t.total_amount, 0);
    const totalLiters = transactions.reduce((sum, t) => sum + t.liters, 0);

    const stats = {
      total: transactions.length,
      imported,
      errors,
      unique_cards: uniqueCards,
      total_amount: Math.round(totalAmount * 100) / 100,
      total_liters: Math.round(totalLiters * 100) / 100
    };

    console.log('Import completed:', stats);

    return new Response(
      JSON.stringify({ success: true, stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

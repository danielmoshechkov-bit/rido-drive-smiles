import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { q } = await req.json();

    if (!q || q.trim().length === 0) {
      return new Response(
        JSON.stringify({ drivers: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const query = q.trim();
    console.log('🔍 Searching for driver:', query);

    // Normalize phone numbers (multiple variants)
    const normalizePhone = (phone: string) => {
      const variants: string[] = [];
      const cleaned = phone.replace(/[\s\-\(\)]/g, '');
      
      variants.push(cleaned);
      
      // Add +48 prefix if missing
      if (!cleaned.startsWith('+')) {
        variants.push(`+${cleaned}`);
        if (!cleaned.startsWith('48')) {
          variants.push(`+48${cleaned}`);
        }
      }
      
      // Remove +48 prefix
      if (cleaned.startsWith('+48')) {
        variants.push(cleaned.substring(3));
      } else if (cleaned.startsWith('48')) {
        variants.push(cleaned.substring(2));
      }
      
      return variants;
    };

    const phoneVariants = normalizePhone(query);
    console.log('📱 Phone variants:', phoneVariants);

    // Search in drivers table
    const { data: driverMatches, error: driversError } = await supabase
      .from('drivers')
      .select('id, first_name, last_name, email, phone, getrido_id')
      .or(`getrido_id.ilike.%${query}%,email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.in.(${phoneVariants.map(v => `"${v}"`).join(',')})`);

    if (driversError) {
      console.error('Error searching drivers:', driversError);
      throw driversError;
    }

    console.log('👥 Found drivers:', driverMatches?.length || 0);

    // Search in platform IDs
    const { data: platformMatches, error: platformError } = await supabase
      .from('driver_platform_ids')
      .select('driver_id, platform, platform_id')
      .ilike('platform_id', `%${query}%`);

    if (platformError) {
      console.error('Error searching platform IDs:', platformError);
      throw platformError;
    }

    console.log('🏢 Found platform matches:', platformMatches?.length || 0);

    // Get driver IDs from platform matches
    const platformDriverIds = [...new Set(platformMatches?.map(p => p.driver_id) || [])];
    
    // Fetch full driver data for platform matches
    let additionalDrivers: any[] = [];
    if (platformDriverIds.length > 0) {
      const { data: platformDrivers } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, email, phone, getrido_id')
        .in('id', platformDriverIds);
      
      additionalDrivers = platformDrivers || [];
    }

    // Merge results and remove duplicates
    const allDriverIds = new Set<string>();
    const allDrivers: any[] = [];

    [...(driverMatches || []), ...additionalDrivers].forEach(driver => {
      if (!allDriverIds.has(driver.id)) {
        allDriverIds.add(driver.id);
        allDrivers.push(driver);
      }
    });

    // Fetch platform IDs for all found drivers
    const { data: allPlatformIds } = await supabase
      .from('driver_platform_ids')
      .select('driver_id, platform, platform_id')
      .in('driver_id', Array.from(allDriverIds));

    // Attach platform IDs to drivers
    const driversWithPlatforms = allDrivers.map(driver => ({
      ...driver,
      platform_ids: (allPlatformIds || [])
        .filter(p => p.driver_id === driver.id)
        .map(p => ({ platform: p.platform, platform_id: p.platform_id }))
    }));

    console.log('✅ Returning', driversWithPlatforms.length, 'drivers');

    return new Response(
      JSON.stringify({ drivers: driversWithPlatforms }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

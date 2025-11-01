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
    const { 
      q,  // fallback for simple search
      first_name, 
      last_name, 
      email, 
      phone, 
      getrido_id, 
      uber_id, 
      bolt_id, 
      freenow_id 
    } = await req.json();

    console.log('🔍 Search params:', { q, first_name, last_name, email, phone, getrido_id, uber_id, bolt_id, freenow_id });

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

    // Build OR conditions based on provided fields
    const conditions: string[] = [];

    if (first_name) conditions.push(`first_name.ilike.%${first_name}%`);
    if (last_name) conditions.push(`last_name.ilike.%${last_name}%`);
    if (email) conditions.push(`email.ilike.%${email}%`);
    if (getrido_id) conditions.push(`getrido_id.ilike.%${getrido_id}%`);

    // Handle phone with variants
    if (phone) {
      const phoneVariants = normalizePhone(phone);
      conditions.push(`phone.in.(${phoneVariants.map(v => `"${v}"`).join(',')})`);
      console.log('📱 Phone variants:', phoneVariants);
    }

    // If no specific fields, use q for general search (fallback)
    if (conditions.length === 0 && q && q.trim().length > 0) {
      const query = q.trim();
      const phoneVariants = normalizePhone(query);
      const orCondition = `getrido_id.ilike.%${query}%,email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.in.(${phoneVariants.map(v => `"${v}"`).join(',')})`;
      console.log('🔍 Fallback search with q:', query);
      
      const { data: driverMatches, error: driversError } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, email, phone, getrido_id')
        .or(orCondition);

      if (driversError) {
        console.error('Error searching drivers:', driversError);
        throw driversError;
      }

      console.log('👥 Found drivers (fallback):', driverMatches?.length || 0);

      // Continue with platform search for fallback
      const { data: platformMatches, error: platformError } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, platform, platform_id')
        .ilike('platform_id', `%${query}%`);

      if (platformError) {
        console.error('Error searching platform IDs:', platformError);
        throw platformError;
      }

      const platformDriverIds = [...new Set(platformMatches?.map(p => p.driver_id) || [])];
      
      let additionalDrivers: any[] = [];
      if (platformDriverIds.length > 0) {
        const { data: platformDrivers } = await supabase
          .from('drivers')
          .select('id, first_name, last_name, email, phone, getrido_id')
          .in('id', platformDriverIds);
        
        additionalDrivers = platformDrivers || [];
      }

      const allDriverIds = new Set<string>();
      const allDrivers: any[] = [];

      [...(driverMatches || []), ...additionalDrivers].forEach(driver => {
        if (!allDriverIds.has(driver.id)) {
          allDriverIds.add(driver.id);
          allDrivers.push(driver);
        }
      });

      const { data: allPlatformIds } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, platform, platform_id')
        .in('driver_id', Array.from(allDriverIds));

      const driversWithPlatforms = allDrivers.map(driver => ({
        ...driver,
        platform_ids: (allPlatformIds || [])
          .filter(p => p.driver_id === driver.id)
          .map(p => ({ platform: p.platform, platform_id: p.platform_id }))
      }));

      console.log('✅ Returning', driversWithPlatforms.length, 'drivers (fallback)');

      return new Response(
        JSON.stringify({ drivers: driversWithPlatforms }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // If no conditions and no q, return empty
    if (conditions.length === 0) {
      return new Response(
        JSON.stringify({ drivers: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Search drivers with specific fields
    const { data: driverMatches, error: driversError } = await supabase
      .from('drivers')
      .select('id, first_name, last_name, email, phone, getrido_id')
      .or(conditions.join(','));

    if (driversError) {
      console.error('Error searching drivers:', driversError);
      throw driversError;
    }

    console.log('👥 Found drivers:', driverMatches?.length || 0);

    // Search in platform IDs separately for each platform
    const platformConditions: string[] = [];
    if (uber_id) platformConditions.push(`platform.eq.uber,platform_id.ilike.%${uber_id}%`);
    if (bolt_id) platformConditions.push(`platform.eq.bolt,platform_id.ilike.%${bolt_id}%`);
    if (freenow_id) platformConditions.push(`platform.eq.freenow,platform_id.ilike.%${freenow_id}%`);

    let platformMatches: any[] = [];
    if (platformConditions.length > 0) {
      const { data, error: platformError } = await supabase
        .from('driver_platform_ids')
        .select('driver_id, platform, platform_id')
        .or(platformConditions.join(','));

      if (platformError) {
        console.error('Error searching platform IDs:', platformError);
        throw platformError;
      }

      platformMatches = data || [];
      console.log('🏢 Found platform matches:', platformMatches?.length || 0);
    }

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

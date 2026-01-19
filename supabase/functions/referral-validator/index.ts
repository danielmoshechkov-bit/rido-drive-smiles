import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ValidationRequest {
  referral_code: string;
  referred_user_id: string;
  ip_address?: string;
  user_agent?: string;
}

interface ValidationResult {
  valid: boolean;
  referrer_user_id?: string;
  referral_code_id?: string;
  coins_to_award?: number;
  rejection_reason?: string;
  is_suspicious?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { referral_code, referred_user_id, ip_address, user_agent }: ValidationRequest = await req.json();

    if (!referral_code || !referred_user_id) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if referral system is enabled
    const { data: settings } = await supabase
      .from('referral_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!settings?.is_enabled) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Referral system is disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find referral code
    const { data: codeData, error: codeError } = await supabase
      .from('referral_codes')
      .select('*')
      .eq('code', referral_code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (codeError || !codeData) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Invalid or inactive referral code' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if referrer is trying to refer themselves
    if (codeData.user_id === referred_user_id) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Cannot use own referral code' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user was already referred
    const { data: existingUse } = await supabase
      .from('referral_uses')
      .select('id')
      .eq('referred_user_id', referred_user_id)
      .maybeSingle();

    if (existingUse) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'User already used a referral code' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check daily limit for referrer
    const today = new Date().toISOString().split('T')[0];
    const { data: todayUses } = await supabase
      .from('referral_uses')
      .select('id')
      .eq('referrer_user_id', codeData.user_id)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    if (todayUses && todayUses.length >= settings.max_referrals_per_day) {
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Daily referral limit reached' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for suspicious patterns
    let isSuspicious = false;
    const alerts: { type: string; description: string; details: any }[] = [];

    // Same IP check
    if (ip_address) {
      const { data: sameIpUses } = await supabase
        .from('referral_uses')
        .select('id')
        .eq('ip_address', ip_address)
        .eq('referrer_user_id', codeData.user_id);

      if (sameIpUses && sameIpUses.length >= settings.suspicious_same_ip_threshold) {
        isSuspicious = true;
        alerts.push({
          type: 'same_ip',
          description: `${sameIpUses.length + 1} registrations from same IP for this referrer`,
          details: { ip_address, count: sameIpUses.length + 1 }
        });
      }
    }

    // Same fleet check
    const { data: referrerDriver } = await supabase
      .from('driver_app_users')
      .select('drivers(fleet_id)')
      .eq('user_id', codeData.user_id)
      .maybeSingle();

    const { data: referredDriver } = await supabase
      .from('driver_app_users')
      .select('drivers(fleet_id)')
      .eq('user_id', referred_user_id)
      .maybeSingle();

    if (
      referrerDriver?.drivers?.fleet_id && 
      referredDriver?.drivers?.fleet_id &&
      referrerDriver.drivers.fleet_id === referredDriver.drivers.fleet_id
    ) {
      isSuspicious = true;
      alerts.push({
        type: 'same_fleet',
        description: 'Referrer and referred user are in the same fleet',
        details: { fleet_id: referrerDriver.drivers.fleet_id }
      });
    }

    // High volume check (more than 5 referrals in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentUses } = await supabase
      .from('referral_uses')
      .select('id')
      .eq('referrer_user_id', codeData.user_id)
      .gte('created_at', oneHourAgo);

    if (recentUses && recentUses.length >= 5) {
      isSuspicious = true;
      alerts.push({
        type: 'high_volume',
        description: `${recentUses.length + 1} referrals in last hour`,
        details: { count: recentUses.length + 1, period: '1 hour' }
      });
    }

    // Create alerts if suspicious
    if (alerts.length > 0) {
      for (const alert of alerts) {
        await supabase.from('referral_alerts').insert({
          referral_code_id: codeData.id,
          alert_type: alert.type,
          description: alert.description,
          details: alert.details
        });
      }
    }

    // Record the referral use
    const status = isSuspicious ? 'suspicious' : 'pending';
    const coinsToAward = isSuspicious ? 0 : settings.coins_per_referral;

    const { error: insertError } = await supabase
      .from('referral_uses')
      .insert({
        referral_code_id: codeData.id,
        referred_user_id,
        referrer_user_id: codeData.user_id,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        status,
        coins_awarded: coinsToAward
      });

    if (insertError) {
      console.error('Error inserting referral use:', insertError);
      return new Response(
        JSON.stringify({ valid: false, rejection_reason: 'Failed to record referral' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update referral code stats
    await supabase
      .from('referral_codes')
      .update({
        uses_count: (codeData.uses_count || 0) + 1,
        total_earnings: (codeData.total_earnings || 0) + coinsToAward
      })
      .eq('id', codeData.id);

    // Award coins if not suspicious
    if (!isSuspicious && coinsToAward > 0) {
      // Award to referrer
      const { data: wallet } = await supabase
        .from('user_wallets')
        .select('coins_balance')
        .eq('user_id', codeData.user_id)
        .maybeSingle();

      if (wallet) {
        await supabase
          .from('user_wallets')
          .update({ 
            coins_balance: (wallet.coins_balance || 0) + coinsToAward,
            total_earned: supabase.raw(`COALESCE(total_earned, 0) + ${coinsToAward}`)
          })
          .eq('user_id', codeData.user_id);
      } else {
        await supabase.from('user_wallets').insert({
          user_id: codeData.user_id,
          balance: 0,
          coins_balance: coinsToAward,
          total_earned: coinsToAward
        });
      }

      // Log transaction
      await supabase.from('coin_transactions').insert({
        user_id: codeData.user_id,
        amount: coinsToAward,
        type: 'earn',
        source: 'referral',
        description: 'Bonus za polecenie nowego użytkownika',
        reference_id: referred_user_id
      });
    }

    const result: ValidationResult = {
      valid: true,
      referrer_user_id: codeData.user_id,
      referral_code_id: codeData.id,
      coins_to_award: coinsToAward,
      is_suspicious: isSuspicious
    };

    console.log('[Referral Validator] Validation result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Referral Validator] Error:', error);
    return new Response(
      JSON.stringify({ valid: false, rejection_reason: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
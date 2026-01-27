import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureToggles } from './useFeatureToggles';

interface AIProSubscription {
  id: string;
  entity_id: string;
  status: 'disabled' | 'trial_active' | 'trial_expired' | 'active_paid' | 'active_comped' | 'pending_payment';
  trial_started_at: string | null;
  trial_ends_at: string | null;
  activated_at: string | null;
}

interface AIProExemption {
  id: string;
  email: string;
  scope: string[];
  valid_until: string | null;
  note: string | null;
}

interface AIProPricing {
  price_pln_monthly: number;
  currency: string;
  trial_days: number;
  show_paywall: boolean;
}

export function useAIPro(entityId?: string) {
  const { features } = useFeatureToggles();
  const [subscription, setSubscription] = useState<AIProSubscription | null>(null);
  const [exemption, setExemption] = useState<AIProExemption | null>(null);
  const [pricing, setPricing] = useState<AIProPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    loadAIProStatus();
  }, [entityId]);

  const loadAIProStatus = async () => {
    setLoading(true);
    try {
      // Load pricing config
      const { data: pricingData } = await supabase
        .from('ai_pro_pricing_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (pricingData) {
        setPricing({
          price_pln_monthly: pricingData.price_pln_monthly || 99,
          currency: pricingData.currency || 'PLN',
          trial_days: pricingData.trial_days || 14,
          show_paywall: pricingData.show_paywall ?? true,
        });
      }

      // Check user exemption
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { data: exemptionData } = await supabase
          .from('ai_pro_exemptions')
          .select('*')
          .ilike('email', user.email)
          .maybeSingle();
        
        if (exemptionData) {
          const isValid = !exemptionData.valid_until || new Date(exemptionData.valid_until) > new Date();
          if (isValid) {
            // Parse scope - can be array of strings or ["*"]
            let scopeArray: string[] = ['*'];
            if (Array.isArray(exemptionData.scope)) {
              scopeArray = exemptionData.scope.map(s => String(s));
            }
            
            setExemption({
              id: exemptionData.id,
              email: exemptionData.email,
              scope: scopeArray,
              valid_until: exemptionData.valid_until,
              note: exemptionData.note,
            });
            setHasAccess(true);
          }
        }
      }

      // Check entity subscription
      if (entityId) {
        const { data: subData } = await supabase
          .from('ai_pro_subscriptions')
          .select('*')
          .eq('entity_id', entityId)
          .maybeSingle();
        
        if (subData) {
          const sub = subData as AIProSubscription;
          setSubscription(sub);
          
          // Check if trial is still active
          if (sub.status === 'trial_active' && sub.trial_ends_at) {
            if (new Date(sub.trial_ends_at) < new Date()) {
              // Trial expired - update status
              await supabase
                .from('ai_pro_subscriptions')
                .update({ status: 'trial_expired' })
                .eq('id', sub.id);
              sub.status = 'trial_expired';
            }
          }
          
          if (['trial_active', 'active_paid', 'active_comped'].includes(sub.status)) {
            setHasAccess(true);
          }
        }
      }
    } catch (error) {
      console.error('Error loading AI PRO status:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTrial = async () => {
    if (!entityId) return { success: false, error: 'No entity selected' };
    
    const trialDays = pricing?.trial_days || 14;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    try {
      const { data, error } = await supabase
        .from('ai_pro_subscriptions')
        .upsert({
          entity_id: entityId,
          status: 'trial_active',
          trial_started_at: new Date().toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
        }, { onConflict: 'entity_id' })
        .select()
        .single();

      if (error) throw error;

      setSubscription(data as AIProSubscription);
      setHasAccess(true);

      return { success: true };
    } catch (error: any) {
      console.error('Error starting trial:', error);
      return { success: false, error: error.message };
    }
  };

  const logAIJob = async (jobType: string, provider: string, input: any, output: any, status: 'success' | 'failed') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      await supabase
        .from('ai_jobs')
        .insert({
          entity_id: entityId,
          user_id: user.id,
          job_type: jobType,
          provider,
          input_snapshot: input,
          output_snapshot: output,
          status,
        });
    } catch (error) {
      console.error('Error logging AI job:', error);
    }
  };

  const isFeatureEnabled = (featureKey: string): boolean => {
    // Check global feature flag
    if (!features[featureKey]) return false;
    
    // Check if user has AI PRO access
    if (!hasAccess) return false;
    
    // Check exemption scope
    if (exemption) {
      if (exemption.scope.includes('*')) return true;
      return exemption.scope.includes(featureKey);
    }
    
    return true;
  };

  return {
    subscription,
    exemption,
    pricing,
    loading,
    hasAccess,
    isTrialAvailable: features.ai_pro_trial_enabled && !subscription,
    isTrialActive: subscription?.status === 'trial_active',
    isTrialExpired: subscription?.status === 'trial_expired',
    trialEndsAt: subscription?.trial_ends_at,
    startTrial,
    logAIJob,
    isFeatureEnabled,
    refresh: loadAIProStatus,
  };
}

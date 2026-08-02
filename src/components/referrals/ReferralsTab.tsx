import { useEffect, useState, useCallback } from 'react';
import { buildPublicUrl } from '@/lib/publicUrl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Gift, Copy, Share2, Wallet, Users, CheckCircle2, Clock, Mail, MessageCircle, Facebook, History } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface ReferralUse {
  id: string;
  referred_user_id: string;
  status: string;
  reward_amount_pln: number | null;
  reward_type: string | null;
  first_purchase_at: string | null;
  created_at: string;
}

interface PlnTx {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  expires_at: string | null;
}

const formatPLN = (v: number) => `${v.toFixed(2).replace('.', ',')}\u00A0zł`;

export function ReferralsTab() {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');
  const [balance, setBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [uses, setUses] = useState<ReferralUse[]>([]);
  const [txs, setTxs] = useState<PlnTx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      // Ensure user has a referral code (generates if missing)
      const { data: codeRpc } = await supabase.rpc('ensure_referral_code', { p_user_id: uid });
      if (codeRpc) setCode(codeRpc as string);

      const [walletRes, usesRes, txRes] = await Promise.all([
        supabase.from('user_wallets').select('pln_balance, pln_total_earned').eq('user_id', uid).maybeSingle(),
        supabase.from('referral_uses').select('id, referred_user_id, status, reward_amount_pln, reward_type, first_purchase_at, created_at')
          .eq('referrer_user_id', uid).order('created_at', { ascending: false }).limit(50),
        supabase.from('wallet_pln_transactions').select('id, type, amount, description, created_at, expires_at')
          .eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
      ]);
      setBalance(Number(walletRes.data?.pln_balance ?? 0));
      setTotalEarned(Number(walletRes.data?.pln_total_earned ?? 0));
      setUses((usesRes.data ?? []) as ReferralUse[]);
      setTxs((txRes.data ?? []) as PlnTx[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setUserId(user.id); load(user.id); }
    });
  }, [load]);

  const shareLink = code ? buildPublicUrl(`/?ref=${code}`) : '';
  const shareText = t('cp.referrals.shareText');

  const copy = async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label || t('cp.referrals.copied'));
    } catch {
      toast.error(t('cp.referrals.copyFailed'));
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t('cp.referrals.shareTitle'), text: shareText, url: shareLink });
      } catch {/* user cancelled */}
    } else {
      copy(shareLink, t('cp.referrals.linkCopied'));
    }
  };

  const completed = uses.filter(u => u.status === 'completed').length;
  const pending = uses.filter(u => u.status === 'pending_first_purchase').length;
  const totalReferred = uses.length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero / share */}
      <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            {t('cp.referrals.programTitle')}
          </CardTitle>
          <CardDescription>
            {t('cp.referrals.programDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('cp.referrals.yourCode')}</p>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[180px] font-mono text-2xl font-bold tracking-wider bg-background border rounded-lg px-4 py-3 text-center">
                {code || '—'}
              </div>
              <Button onClick={() => copy(code, t('cp.referrals.codeCopied'))} variant="outline" className="self-stretch">
                <Copy className="h-4 w-4 mr-2" />{t('cp.referrals.copyCode')}
              </Button>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('cp.referrals.referralLink')}</p>
            <div className="flex flex-wrap gap-2">
              <Input value={shareLink} readOnly className="flex-1 min-w-[200px]" />
              <Button onClick={() => copy(shareLink, t('cp.referrals.linkCopied'))} variant="outline">
                <Copy className="h-4 w-4 mr-2" />{t('cp.referrals.copy')}
              </Button>
              <Button onClick={share}>
                <Share2 className="h-4 w-4 mr-2" />{t('cp.referrals.share')}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareLink)}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4 mr-1" />WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}`} target="_blank" rel="noreferrer">
                <Facebook className="h-4 w-4 mr-1" />Facebook
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:?subject=${encodeURIComponent(t('cp.referrals.recommendGetRido'))}&body=${encodeURIComponent(shareText + '\n\n' + shareLink)}`}>
                <Mail className="h-4 w-4 mr-1" />Email
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Wallet className="h-4 w-4" />{t('cp.referrals.balance')}</div>
            <p className="text-2xl font-bold mt-1">{formatPLN(balance)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('cp.referrals.balanceDesc')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Gift className="h-4 w-4" />{t('cp.referrals.totalEarned')}</div>
            <p className="text-2xl font-bold mt-1">{formatPLN(totalEarned)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Users className="h-4 w-4" />{t('cp.referrals.referred')}</div>
            <p className="text-2xl font-bold mt-1">{totalReferred}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('cp.referrals.referredStat', { active: completed, pending })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CheckCircle2 className="h-4 w-4" />{t('cp.referrals.completed')}</div>
            <p className="text-2xl font-bold mt-1">{completed}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('cp.referrals.afterFirstPurchase')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Referred list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{t('cp.referrals.yourReferred')}</CardTitle>
          <CardDescription>{t('cp.referrals.rewardNote')}</CardDescription>
        </CardHeader>
        <CardContent>
          {uses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t('cp.referrals.noReferred')}</p>
              <p className="text-sm">{t('cp.referrals.noReferredDesc')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uses.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {u.status === 'completed' ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Clock className="h-4 w-4 text-amber-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t('cp.referrals.referredUser')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('cp.referrals.registered')} {format(new Date(u.created_at), 'd MMM yyyy', { locale: pl })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {u.status === 'completed' ? (
                      <>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 mb-1">{t('cp.referrals.completed')}</Badge>
                        <p className="text-sm font-semibold text-green-600">
                          {u.reward_type === 'free_month' ? t('cp.referrals.freeMonth') : `+${formatPLN(Number(u.reward_amount_pln ?? 0))}`}
                        </p>
                      </>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{t('cp.referrals.waitingPurchase')}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      {txs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t('cp.referrals.txHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {txs.map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border bg-card text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{tx.description || tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}
                      {tx.expires_at && ` · ${t('cp.referrals.validUntil')} ${format(new Date(tx.expires_at), 'd MMM yyyy', { locale: pl })}`}
                    </p>
                  </div>
                  <span className={`font-semibold ${Number(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Number(tx.amount) >= 0 ? '+' : ''}{formatPLN(Number(tx.amount))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>{t('cp.referrals.faqTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="how">
              <AccordionTrigger>{t('cp.referrals.faqHowQ')}</AccordionTrigger>
              <AccordionContent>
                {t('cp.referrals.faqHowA')}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="rewards">
              <AccordionTrigger>{t('cp.referrals.faqRewardsQ')}</AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-5 space-y-1">
                  <li>{t('cp.referrals.rewardPrivate')}: <strong>50 zł</strong> {t('cp.referrals.rewardEach')}</li>
                  <li>{t('cp.referrals.rewardPrivateBiz')}: <strong>100 zł</strong> {t('cp.referrals.rewardEach')}</li>
                  <li>{t('cp.referrals.rewardBiz')}: <strong>150 zł</strong> {t('cp.referrals.rewardEach')}</li>
                  <li>{t('cp.referrals.rewardWorkshop')}: <strong>{t('cp.referrals.rewardFreeMonth')}</strong> {t('cp.referrals.rewardBoth')}</li>
                </ul>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="welcome">
              <AccordionTrigger>{t('cp.referrals.faqWelcomeQ')}</AccordionTrigger>
              <AccordionContent>
                {t('cp.referrals.faqWelcomeA1')} <strong>20 zł</strong>. {t('cp.referrals.faqWelcomeA2')}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="when">
              <AccordionTrigger>{t('cp.referrals.faqWhenQ')}</AccordionTrigger>
              <AccordionContent>
                {t('cp.referrals.faqWhenA')}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="use">
              <AccordionTrigger>{t('cp.referrals.faqUseQ')}</AccordionTrigger>
              <AccordionContent>
                {t('cp.referrals.faqUseA')}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="limits">
              <AccordionTrigger>{t('cp.referrals.faqLimitsQ')}</AccordionTrigger>
              <AccordionContent>
                {t('cp.referrals.faqLimitsA')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

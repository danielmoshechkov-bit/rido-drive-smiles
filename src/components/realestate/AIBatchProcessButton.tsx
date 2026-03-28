import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AIBatchProcessButtonProps {
  agentId: string;
  listingIds: string[];
}

export function AIBatchProcessButton({ agentId, listingIds }: AIBatchProcessButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);

  const handleBatchProcess = async () => {
    setProcessing(true);
    setDone(false);

    try {
      // Find listings without AI data
      const { data: unparsed } = await supabase
        .from('real_estate_listings')
        .select('id')
        .eq('agent_id', agentId)
        .is('ai_parsed_at', null)
        .not('description', 'is', null);

      const ids = unparsed?.map(l => l.id) || [];
      if (ids.length === 0) {
        toast.info("Wszystkie ogłoszenia mają już dane AI");
        setProcessing(false);
        return;
      }

      setTotal(ids.length);
      setProgress(0);

      // Process in batches of 5
      const batchSize = 5;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        
        const { error } = await supabase.functions.invoke('parse-listing-ai', {
          body: { batch_ids: batch }
        });

        if (error) {
          console.error('Batch error:', error);
        }

        setProgress(Math.min(i + batchSize, ids.length));
      }

      setDone(true);
      toast.success(`✅ Przetworzono ${ids.length} ogłoszeń przez AI`);
    } catch (err) {
      console.error('Batch process error:', err);
      toast.error("Błąd przetwarzania AI");
    } finally {
      setProcessing(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <CheckCircle className="h-5 w-5 text-green-500" />
        <span className="text-sm font-medium text-green-700 dark:text-green-300">
          Wszystkie ogłoszenia wzbogacone przez AI
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleBatchProcess}
        disabled={processing}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {processing ? "Przetwarzanie..." : "Wzbogać wszystkie ogłoszenia AI"}
      </Button>
      {processing && total > 0 && (
        <div className="space-y-1">
          <Progress value={(progress / total) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Przetworzono {progress}/{total} ogłoszeń...
          </p>
        </div>
      )}
    </div>
  );
}

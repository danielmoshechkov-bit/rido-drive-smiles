import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PlatformIdEditorProps {
  driverId: string;
  platform: string;
  currentId: string;
  onUpdate: () => void;
}

export function PlatformIdEditor({ driverId, platform, currentId, onUpdate }: PlatformIdEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentId);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (e: React.MouseEvent) => {
    if (!currentId) return;
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(currentId);
      setCopied(true);
      toast.success("ID skopiowane!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Błąd kopiowania");
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const savePlatformId = async () => {
    try {
      if (platform === 'getrido') {
        const { error } = await supabase
          .from('drivers')
          .update({ getrido_id: value || null })
          .eq('id', driverId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("driver_platform_ids")
          .upsert(
            {
              driver_id: driverId,
              platform,
              platform_id: value
            },
            {
              onConflict: "driver_id,platform"
            }
          );
        if (error) throw error;
      }
      toast.success("ID zaktualizowane!");
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Platform ID update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Nieznany błąd';
      toast.error(`Błąd aktualizacji: ${errorMessage}`);
    }
  };

  const getPlatformName = (platform: string) => {
    switch(platform) {
      case 'uber': return 'Uber';
      case 'bolt': return 'Bolt';
      case 'freenow': return 'FreeNow';
      case 'getrido': return 'GetRido';
      default: return platform;
    }
  };

  const getPlatformColor = (platform: string) => {
    return 'bg-muted border border-border';
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase">
        {getPlatformName(platform)} ID
      </div>
      
      {isEditing ? (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-xs"
            placeholder={`${platform} ID`}
            autoFocus
          />
          <Button size="sm" onClick={savePlatformId} className="h-7 px-2">
            Zapisz
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            setIsEditing(false);
            setValue(currentId);
          }} className="h-7 px-2">
            Anuluj
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span 
            className={`text-xs font-mono ${getPlatformColor(platform)} px-2 py-1 rounded flex-1 cursor-pointer hover:opacity-70 transition-opacity`}
            onClick={handleTextClick}
            title="Kliknij aby edytować"
          >
            {currentId || "Brak ID"}
          </span>
          {currentId && (
            <Button
              size="sm" 
              variant="ghost" 
              onClick={copyToClipboard}
              className="h-6 w-6 p-0"
              title="Kopiuj ID"
            >
              {copied ? (
                <Check size={12} className="text-green-500" />
              ) : (
                <Copy size={12} />
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
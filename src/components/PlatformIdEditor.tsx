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

  const copyToClipboard = async () => {
    if (!currentId) return;
    
    try {
      await navigator.clipboard.writeText(currentId);
      setCopied(true);
      toast.success("ID skopiowane!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Błąd kopiowania");
    }
  };

  const savePlatformId = async () => {
    try {
      const { error } = await supabase
        .from("driver_platform_ids")
        .upsert({
          driver_id: driverId,
          platform,
          platform_id: value
        }, {
          onConflict: "driver_id,platform"
        });

      if (error) throw error;
      
      toast.success("ID zaktualizowane!");
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      toast.error("Błąd aktualizacji");
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground uppercase">
        {platform} ID
      </div>
      
      {isEditing ? (
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-xs"
            placeholder={`${platform} ID`}
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
        <div 
          className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded group"
          onClick={() => setIsEditing(true)}
        >
          <span className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1">
            {currentId || "Brak ID"}
          </span>
          {currentId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard();
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
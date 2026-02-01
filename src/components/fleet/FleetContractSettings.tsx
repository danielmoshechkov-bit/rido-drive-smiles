import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  PenTool, 
  Save, 
  Trash2, 
  Loader2, 
  CheckCircle,
  AlertCircle
} from "lucide-react";

interface FleetContractSettingsProps {
  fleetId: string;
}

export function FleetContractSettings({ fleetId }: FleetContractSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [autoSignEnabled, setAutoSignEnabled] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    loadSignature();
  }, [fleetId]);

  const loadSignature = async () => {
    setLoading(true);
    try {
      const supabaseAny = supabase as any;
      const { data, error } = await supabaseAny
        .from("fleet_signatures")
        .select("*")
        .eq("fleet_id", fleetId)
        .eq("is_active", true)
        .single();

      if (!error && data) {
        setSignatureUrl(data.signature_url);
        setAutoSignEnabled(data.auto_sign_enabled !== false);
      }
    } catch (error) {
      // No signature found - that's ok
    } finally {
      setLoading(false);
    }
  };

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    
    // Style
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Clear
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => {
    if (isDrawing) {
      initCanvas();
    }
  }, [isDrawing]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ("touches" in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    try {
      // Convert canvas to blob
      const dataUrl = canvas.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      
      // Upload to storage
      const fileName = `fleet_signatures/${fleetId}/${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { contentType: "image/png" });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(fileName);

      // Save to database
      const supabaseAny = supabase as any;
      await supabaseAny.from("fleet_signatures").upsert({
        fleet_id: fleetId,
        signature_url: publicUrl,
        is_active: true,
        auto_sign_enabled: autoSignEnabled,
      }, { onConflict: "fleet_id" });

      setSignatureUrl(publicUrl);
      setIsDrawing(false);
      toast.success("Podpis został zapisany!");
    } catch (error: any) {
      console.error("Error saving signature:", error);
      toast.error("Błąd zapisywania podpisu");
    } finally {
      setSaving(false);
    }
  };

  const deleteSignature = async () => {
    if (!confirm("Czy na pewno chcesz usunąć zapisany podpis?")) return;

    setSaving(true);
    try {
      const supabaseAny = supabase as any;
      await supabaseAny
        .from("fleet_signatures")
        .update({ is_active: false })
        .eq("fleet_id", fleetId);

      setSignatureUrl(null);
      toast.success("Podpis został usunięty");
    } catch (error) {
      toast.error("Błąd usuwania podpisu");
    } finally {
      setSaving(false);
    }
  };

  const updateAutoSign = async (enabled: boolean) => {
    setAutoSignEnabled(enabled);
    try {
      const supabaseAny = supabase as any;
      await supabaseAny
        .from("fleet_signatures")
        .update({ auto_sign_enabled: enabled })
        .eq("fleet_id", fleetId)
        .eq("is_active", true);
      
      toast.success(enabled ? "Auto-podpis włączony" : "Auto-podpis wyłączony");
    } catch (error) {
      toast.error("Błąd aktualizacji ustawień");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenTool className="h-5 w-5" />
            Podpis floty
          </CardTitle>
          <CardDescription>
            Zapisany podpis będzie automatycznie używany przy podpisywaniu umów najmu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current signature display */}
          {signatureUrl && !isDrawing && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Podpis zapisany</span>
              </div>
              
              <div className="border rounded-lg p-4 bg-white">
                <img 
                  src={signatureUrl} 
                  alt="Zapisany podpis" 
                  className="max-h-24 mx-auto"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Switch
                    id="auto-sign"
                    checked={autoSignEnabled}
                    onCheckedChange={updateAutoSign}
                  />
                  <Label htmlFor="auto-sign" className="cursor-pointer">
                    Automatycznie podpisuj umowy
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDrawing(true)}
                  className="gap-2"
                >
                  <PenTool className="h-4 w-4" />
                  Zmień podpis
                </Button>
                <Button
                  variant="destructive"
                  onClick={deleteSignature}
                  disabled={saving}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Usuń
                </Button>
              </div>
            </div>
          )}

          {/* No signature - show add button */}
          {!signatureUrl && !isDrawing && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-4">
                <AlertCircle className="h-5 w-5" />
                <span>Brak zapisanego podpisu</span>
              </div>
              <Button onClick={() => setIsDrawing(true)} className="gap-2">
                <PenTool className="h-4 w-4" />
                Dodaj podpis
              </Button>
            </div>
          )}

          {/* Drawing canvas */}
          {isDrawing && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Narysuj podpis palcem lub myszką w polu poniżej
              </p>
              
              <div className="border-2 border-dashed border-primary/50 rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 bg-white cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearCanvas}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Wyczyść
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsDrawing(false)}
                >
                  Anuluj
                </Button>
                <Button
                  onClick={saveSignature}
                  disabled={saving}
                  className="flex-1 gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Zapisz podpis
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

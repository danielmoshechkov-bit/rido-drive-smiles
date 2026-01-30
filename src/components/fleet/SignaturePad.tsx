import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eraser, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  onSign: (signatureDataUrl: string) => void;
  onCancel?: () => void;
  className?: string;
  title?: string;
}

export function SignaturePad({ onSign, onCancel, className, title = "Podpis" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up canvas
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Fill with white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw signature line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();

    // Reset for drawing
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Redraw signature line
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();

    // Reset for drawing
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;

    setHasDrawn(false);
  };

  const handleSign = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSign(dataUrl);
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={clearCanvas} className="gap-1">
            <Eraser className="h-4 w-4" />
            Wyczyść
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden bg-white touch-none">
          <canvas
            ref={canvasRef}
            width={400}
            height={200}
            className="w-full cursor-crosshair"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Podpisz palcem lub rysikiem w polu powyżej
        </p>

        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Anuluj
            </Button>
          )}
          <Button 
            className="flex-1 gap-2" 
            onClick={handleSign}
            disabled={!hasDrawn}
          >
            <Check className="h-4 w-4" />
            Zatwierdź podpis
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

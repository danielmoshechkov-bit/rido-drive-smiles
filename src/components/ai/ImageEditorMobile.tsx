import { useState, useRef, useEffect, useCallback, TouchEvent as ReactTouchEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2, Sparkles, X, Download, Paintbrush, RotateCcw, Circle, Square, ChevronUp, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ridoMascot from '@/assets/rido-mascot.png';

const ANNOTATION_COLORS = [
  'hsl(262, 80%, 55%)', // purple
  'hsl(330, 75%, 55%)', // pink
  'hsl(200, 80%, 50%)', // blue
  'hsl(150, 70%, 42%)', // green
  'hsl(35, 90%, 55%)',  // orange
  'hsl(0, 75%, 55%)',   // red
  'hsl(180, 65%, 45%)', // teal
  'hsl(280, 60%, 60%)', // violet
];

const getAnnotationColor = (idx: number) => ANNOTATION_COLORS[idx % ANNOTATION_COLORS.length];
const getAnnotationColorAlpha = (idx: number, alpha = 0.45) => {
  const c = ANNOTATION_COLORS[idx % ANNOTATION_COLORS.length];
  return c.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
};

type AnnotationTool = 'brush' | 'ellipse' | 'rectangle';
type InteractionMode = 'none' | 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br';

interface Annotation {
  id: number;
  type: AnnotationTool;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  brushPoints?: { x: number; y: number }[];
  center: { x: number; y: number };
  description: string;
  colorIndex: number;
}

interface ImageEditorMobileProps {
  imageSrc: string;
  onClose: () => void;
  onApplyEdit: (imageBase64: string, maskBase64: string, prompt: string) => Promise<{ images?: string[] } | null>;
  onSaveEditedImage?: (editedSrc: string) => void;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}

export function ImageEditorMobile({
  imageSrc, onClose, onApplyEdit, onSaveEditedImage, isEditing, setIsEditing
}: ImageEditorMobileProps) {
  const [brushActive, setBrushActive] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('brush');
  const [isDrawing, setIsDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const currentPath = useRef<{ x: number; y: number }[]>([]);
  const shapeStart = useRef<{ x: number; y: number } | null>(null);
  const baseMaskData = useRef<ImageData | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [interactingAnnotation, setInteractingAnnotation] = useState<number | null>(null);
  const interactionStart = useRef<{ x: number; y: number; origStart: { x: number; y: number }; origEnd: { x: number; y: number } } | null>(null);
  const newAnnotationRef = useRef<number | null>(null);

  const validAnnotationCount = annotations.filter(a => a.description.trim()).length;

  // Load image onto canvas
  useEffect(() => {
    if (!canvasRef.current || !maskCanvasRef.current) return;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxW = Math.min(img.width, 900);
      const ratio = img.height / img.width;
      const w = maxW; const h = Math.round(maxW * ratio);
      [canvasRef.current!, maskCanvasRef.current!].forEach(c => { c.width = w; c.height = h; });
      canvasRef.current!.getContext('2d')!.drawImage(img, 0, 0, w, h);
      maskCanvasRef.current!.getContext('2d')!.clearRect(0, 0, w, h);
      shapeStart.current = null; baseMaskData.current = null;
    };
    img.src = currentImageSrc;
  }, [currentImageSrc]);

  const redrawAnnotations = useCallback((anns: Annotation[]) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    anns.forEach(ann => {
      const color = getAnnotationColorAlpha(ann.colorIndex);
      if (ann.type === 'brush' && ann.brushPoints && ann.brushPoints.length > 1) {
        ctx.strokeStyle = color; ctx.lineWidth = 36; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let i = 1; i < ann.brushPoints.length; i++) { ctx.beginPath(); ctx.moveTo(ann.brushPoints[i - 1].x, ann.brushPoints[i - 1].y); ctx.lineTo(ann.brushPoints[i].x, ann.brushPoints[i].y); ctx.stroke(); }
      } else if (ann.start && ann.end) {
        const x = Math.min(ann.start.x, ann.end.x), y = Math.min(ann.start.y, ann.end.y), w = Math.abs(ann.end.x - ann.start.x), h = Math.abs(ann.end.y - ann.start.y);
        ctx.fillStyle = color;
        if (ann.type === 'rectangle') { ctx.fillRect(x, y, w, h); } else { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2); ctx.fill(); }
      }
    });
  }, []);

  // Coordinate helpers
  const getCoords = (clientX: number, clientY: number) => {
    const rect = maskCanvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) * (maskCanvasRef.current!.width / rect.width), y: (clientY - rect.top) * (maskCanvasRef.current!.height / rect.height) };
  };

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }, colorIdx: number) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    ctx.strokeStyle = getAnnotationColorAlpha(colorIdx); ctx.lineWidth = 36; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  };

  const drawShape = (start: { x: number; y: number }, end: { x: number; y: number }, tool: Exclude<AnnotationTool, 'brush'>, colorIdx: number) => {
    if (!maskCanvasRef.current) return;
    const ctx = maskCanvasRef.current.getContext('2d')!;
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    ctx.fillStyle = getAnnotationColorAlpha(colorIdx);
    if (tool === 'rectangle') { ctx.fillRect(x, y, w, h); } else { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(w / 2, 1), Math.max(h / 2, 1), 0, 0, Math.PI * 2); ctx.fill(); }
  };

  const addAnnotation = (ann: Omit<Annotation, 'id' | 'description' | 'colorIndex'>) => {
    setAnnotations(prev => {
      const newId = prev.length + 1;
      const next = [...prev, { ...ann, id: newId, description: '', colorIndex: prev.length }];
      newAnnotationRef.current = newId;
      setActiveAnnotation(newId);
      setPanelOpen(true);
      return next;
    });
  };

  const setActiveTool = (tool: AnnotationTool) => { setAnnotationTool(tool); setBrushActive(c => (annotationTool === tool ? !c : true)); };

  const findShapeAtPoint = (pt: { x: number; y: number }): { annId: number; mode: InteractionMode } | null => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      if (ann.type === 'brush' || !ann.start || !ann.end) continue;
      const x1 = Math.min(ann.start.x, ann.end.x), y1 = Math.min(ann.start.y, ann.end.y), x2 = Math.max(ann.start.x, ann.end.x), y2 = Math.max(ann.start.y, ann.end.y);
      const hs = 24;
      if (Math.abs(pt.x - x1) < hs && Math.abs(pt.y - y1) < hs) return { annId: ann.id, mode: 'resize-tl' };
      if (Math.abs(pt.x - x2) < hs && Math.abs(pt.y - y1) < hs) return { annId: ann.id, mode: 'resize-tr' };
      if (Math.abs(pt.x - x1) < hs && Math.abs(pt.y - y2) < hs) return { annId: ann.id, mode: 'resize-bl' };
      if (Math.abs(pt.x - x2) < hs && Math.abs(pt.y - y2) < hs) return { annId: ann.id, mode: 'resize-br' };
      if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return { annId: ann.id, mode: 'move' };
    }
    return null;
  };

  // Unified pointer handlers
  const handlePointerDown = (clientX: number, clientY: number) => {
    if (!brushActive) return;
    const pt = getCoords(clientX, clientY);
    const hit = findShapeAtPoint(pt);
    if (hit) {
      const ann = annotations.find(a => a.id === hit.annId);
      if (ann?.start && ann?.end) {
        setInteractionMode(hit.mode); setInteractingAnnotation(hit.annId);
        interactionStart.current = { x: pt.x, y: pt.y, origStart: { ...ann.start }, origEnd: { ...ann.end } };
        setActiveAnnotation(hit.annId); return;
      }
    }
    setIsDrawing(true); shapeStart.current = pt; lastPoint.current = pt;
    if (annotationTool === 'brush') { currentPath.current = [pt]; drawStroke(pt, pt, annotations.length); return; }
    currentPath.current = [];
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx && maskCanvasRef.current) baseMaskData.current = ctx.getImageData(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const pt = getCoords(clientX, clientY);
    if (interactionMode !== 'none' && interactingAnnotation && interactionStart.current) {
      const dx = pt.x - interactionStart.current.x, dy = pt.y - interactionStart.current.y;
      const { origStart, origEnd } = interactionStart.current;
      setAnnotations(prev => {
        const updated = prev.map(ann => {
          if (ann.id !== interactingAnnotation) return ann;
          let ns = ann.start!, ne = ann.end!;
          if (interactionMode === 'move') { ns = { x: origStart.x + dx, y: origStart.y + dy }; ne = { x: origEnd.x + dx, y: origEnd.y + dy }; }
          else if (interactionMode === 'resize-tl') { ns = { x: origStart.x + dx, y: origStart.y + dy }; ne = { ...origEnd }; }
          else if (interactionMode === 'resize-tr') { ns = { x: origStart.x, y: origStart.y + dy }; ne = { x: origEnd.x + dx, y: origEnd.y }; }
          else if (interactionMode === 'resize-bl') { ns = { x: origStart.x + dx, y: origStart.y }; ne = { x: origEnd.x, y: origEnd.y + dy }; }
          else if (interactionMode === 'resize-br') { ns = { ...origStart }; ne = { x: origEnd.x + dx, y: origEnd.y + dy }; }
          return { ...ann, start: ns, end: ne, center: { x: (ns.x + ne.x) / 2, y: (ns.y + ne.y) / 2 } };
        });
        redrawAnnotations(updated);
        return updated;
      });
      return;
    }
    if (!isDrawing || !brushActive || !lastPoint.current) return;
    if (annotationTool === 'brush') { drawStroke(lastPoint.current, pt, annotations.length); lastPoint.current = pt; currentPath.current.push(pt); return; }
    if (!shapeStart.current || !maskCanvasRef.current || !baseMaskData.current) return;
    maskCanvasRef.current.getContext('2d')!.putImageData(baseMaskData.current, 0, 0);
    drawShape(shapeStart.current, pt, annotationTool, annotations.length);
    lastPoint.current = pt;
  };

  const handlePointerUp = () => {
    if (interactionMode !== 'none') { setInteractionMode('none'); setInteractingAnnotation(null); interactionStart.current = null; return; }
    if (!isDrawing || !maskCanvasRef.current) return;
    setIsDrawing(false);
    if (annotationTool === 'brush') {
      const path = currentPath.current;
      if (path.length > 1) { const center = { x: path.reduce((s, p) => s + p.x, 0) / path.length, y: path.reduce((s, p) => s + p.y, 0) / path.length }; addAnnotation({ type: 'brush', brushPoints: [...path], center }); }
    } else if (shapeStart.current && lastPoint.current) {
      const center = { x: (shapeStart.current.x + lastPoint.current.x) / 2, y: (shapeStart.current.y + lastPoint.current.y) / 2 };
      addAnnotation({ type: annotationTool, start: { ...shapeStart.current }, end: { ...lastPoint.current }, center });
    }
    lastPoint.current = null; currentPath.current = []; shapeStart.current = null; baseMaskData.current = null;
  };

  // Mouse events
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerDown(e.clientX, e.clientY);
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerMove(e.clientX, e.clientY);
  const onMouseUp = () => handlePointerUp();

  // Touch events
  const onTouchStart = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 1) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchMove = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 1) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    handlePointerUp();
  };

  // Register passive:false touch listeners
  useEffect(() => {
    const el = maskCanvasRef.current;
    if (!el) return;
    const prevent = (e: Event) => { if (brushActive) e.preventDefault(); };
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      el.removeEventListener('touchstart', prevent);
      el.removeEventListener('touchmove', prevent);
    };
  }, [brushActive]);

  const updateAnnotationDesc = (id: number, desc: string) => setAnnotations(prev => prev.map(a => a.id === id ? { ...a, description: desc } : a));
  const removeAnnotation = (id: number) => {
    setAnnotations(prev => {
      const updated = prev.filter(a => a.id !== id).map((ann, i) => ({ ...ann, id: i + 1, colorIndex: i }));
      redrawAnnotations(updated);
      if (activeAnnotation === id) setActiveAnnotation(updated[0]?.id ?? null);
      else if (activeAnnotation && activeAnnotation > id) setActiveAnnotation(activeAnnotation - 1);
      return updated;
    });
  };
  const clearAllAnnotations = () => {
    if (!maskCanvasRef.current) return;
    maskCanvasRef.current.getContext('2d')!.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    setAnnotations([]); setActiveAnnotation(null); lastPoint.current = null; currentPath.current = []; shapeStart.current = null; baseMaskData.current = null;
    setPanelOpen(false);
  };

  const downloadImage = () => { const a = document.createElement('a'); a.href = currentImageSrc; a.download = 'rido-grafika.png'; a.click(); };

  const applyAllEdits = async () => {
    const validAnnotations = annotations.filter(a => a.description.trim());
    if (validAnnotations.length === 0 || !canvasRef.current || !maskCanvasRef.current || isEditing) return;
    setIsEditing(true);
    try {
      redrawAnnotations(annotations);
      const cw = canvasRef.current.width, ch = canvasRef.current.height;
      const combinedPrompt = validAnnotations.map((a, i) => {
        const posDesc = a.center ? `(pozycja: ${Math.round(a.center.x / cw * 100)}% od lewej, ${Math.round(a.center.y / ch * 100)}% od góry)` : '';
        return `${i + 1}. ${a.description} ${posDesc}`;
      }).join('\n');
      const imageBase64 = canvasRef.current.toDataURL('image/png').split(',')[1];
      const maskBase64 = maskCanvasRef.current.toDataURL('image/png').split(',')[1];
      const result = await onApplyEdit(imageBase64, maskBase64, combinedPrompt);
      if (result?.images?.[0]) {
        const editedSrc = result.images[0];
        const newImg = new window.Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')!;
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(newImg, 0, 0, canvasRef.current.width, canvasRef.current.height);
          }
          clearAllAnnotations(); setBrushActive(false); setAnnotationTool('brush');
          setCurrentImageSrc(editedSrc);
          onSaveEditedImage?.(editedSrc);
        };
        newImg.src = editedSrc;
      }
    } catch {} finally { setIsEditing(false); }
  };

  return (
    <div className="flex flex-col bg-background" style={{ height: '100dvh' }}>
      {/* TOP BAR */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-background" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
          <img src={ridoMascot} alt="RidoAI" className="w-7 h-7 object-contain flex-shrink-0" />
          <span className="font-bold text-sm truncate">Edytor</span>
          {annotations.length > 0 && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">{annotations.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {validAnnotationCount > 0 && (
            <Button size="sm" onClick={applyAllEdits} disabled={isEditing} className="rounded-lg text-xs font-semibold gap-1 h-8 px-3">
              {isEditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Popraw ({validAnnotationCount})
            </Button>
          )}
          <button onClick={downloadImage} className="p-2 rounded-lg hover:bg-muted border border-border">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* HORIZONTAL TOOLBAR */}
      <div className="flex-shrink-0 border-b bg-muted/30">
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' as any }}>
          <button onClick={() => setActiveTool('brush')} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all flex-shrink-0', brushActive && annotationTool === 'brush' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border bg-background')}>
            <Paintbrush className="h-4 w-4" />Pędzel
          </button>
          <button onClick={() => setActiveTool('ellipse')} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all flex-shrink-0', brushActive && annotationTool === 'ellipse' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border bg-background')}>
            <Circle className="h-4 w-4" />Owal
          </button>
          <button onClick={() => setActiveTool('rectangle')} className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all flex-shrink-0', brushActive && annotationTool === 'rectangle' ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border bg-background')}>
            <Square className="h-4 w-4" />Prostokąt
          </button>
          {annotations.length > 0 && (
            <button onClick={clearAllAnnotations} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-border hover:bg-muted bg-background flex-shrink-0">
              <RotateCcw className="h-4 w-4" />Cofnij
            </button>
          )}
        </div>
      </div>

      {/* CANVAS AREA — flex:1, scrollable */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/10 relative" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        <div className="relative inline-block m-3">
          <div className="rounded-xl overflow-hidden border border-border shadow-lg">
            <canvas ref={canvasRef} className="block max-w-full" style={{ touchAction: 'none', maxHeight: '60dvh' }} />
            <canvas
              ref={maskCanvasRef}
              className={cn('absolute inset-0 w-full h-full', brushActive ? 'cursor-crosshair' : 'pointer-events-none')}
              style={{ touchAction: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); lastPoint.current = null; } }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            />
          </div>
          {/* Hint overlay */}
          {brushActive && annotations.length === 0 && !isDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground text-xs px-3 py-1.5 rounded-full pointer-events-none font-semibold z-10">
              {annotationTool === 'brush' ? 'Zamaluj obszar' : annotationTool === 'ellipse' ? 'Przeciągnij owal' : 'Przeciągnij prostokąt'}
            </div>
          )}
          {/* Colored number badges on image */}
          {annotations.map(ann => {
            const canvas = maskCanvasRef.current;
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            const sx = rect.width / canvas.width, sy = rect.height / canvas.height;
            const color = getAnnotationColor(ann.colorIndex);
            return (
              <div
                key={ann.id}
                className="absolute w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold pointer-events-none border-2 shadow-lg text-white"
                style={{
                  left: ann.center.x * sx - 14,
                  top: ann.center.y * sy - 14,
                  backgroundColor: color,
                  borderColor: 'rgba(255,255,255,0.6)',
                }}
              >
                {ann.id}
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM PANEL — annotations list, slides up from bottom */}
      {annotations.length > 0 && (
        <div
          className="flex-shrink-0 border-t bg-background flex flex-col transition-all duration-300"
          style={{ maxHeight: panelOpen ? '45dvh' : 48 }}
        >
          {/* Panel header — tappable to toggle */}
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ minHeight: 48 }}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">Zaznaczenia</h3>
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">{annotations.length}</span>
            </div>
            {panelOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
          </button>

          {/* Scrollable annotations list */}
          {panelOpen && (
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2" style={{ WebkitOverflowScrolling: 'touch' as any, paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              {annotations.map(ann => {
                const color = getAnnotationColor(ann.colorIndex);
                return (
                  <div
                    key={ann.id}
                    className={cn('rounded-xl border p-3 transition-all', activeAnnotation === ann.id ? 'border-primary bg-primary/5' : 'border-border')}
                    onClick={() => setActiveAnnotation(ann.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-6 h-6 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center"
                          style={{ backgroundColor: color }}
                        >
                          {ann.id}
                        </span>
                        <span className="text-xs font-semibold">Obszar {ann.id}</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeAnnotation(ann.id); }} className="p-1 hover:bg-destructive/10 rounded-lg">
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                    <textarea
                      value={ann.description}
                      onChange={e => updateAnnotationDesc(ann.id, e.target.value)}
                      placeholder='np. "zmień kolor na czerwony"'
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:border-primary outline-none resize-none min-h-[40px]"
                      rows={1}
                      autoFocus={newAnnotationRef.current === ann.id}
                      onFocus={() => { if (newAnnotationRef.current === ann.id) newAnnotationRef.current = null; }}
                    />
                  </div>
                );
              })}
              {validAnnotationCount > 0 && (
                <Button onClick={applyAllEdits} disabled={isEditing} className="w-full rounded-xl font-semibold gap-2 mt-2">
                  {isEditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Popraw obrazek ({validAnnotationCount})
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

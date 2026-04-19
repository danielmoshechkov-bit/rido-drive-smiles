import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Upload, Trash2, Image as ImageIcon, Loader2, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ProviderMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  initialTab?: 'logo' | 'cover' | 'gallery';
  onSaved?: () => void;
}

export function ProviderMediaModal({
  open,
  onOpenChange,
  providerId,
  initialTab = 'logo',
  onSaved,
}: ProviderMediaModalProps) {
  const [tab, setTab] = useState<'logo' | 'cover' | 'gallery'>(initialTab);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [gallery, setGallery] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState<'logo' | 'cover' | 'gallery' | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !providerId) return;
    setLoading(true);
    (supabase as any)
      .from('service_providers')
      .select('logo_url, cover_image_url, gallery_photos')
      .eq('id', providerId)
      .maybeSingle()
      .then(({ data }: any) => {
        setLogoUrl(data?.logo_url || null);
        setCoverUrl(data?.cover_image_url || null);
        setGallery(Array.isArray(data?.gallery_photos) ? data.gallery_photos : []);
        setLoading(false);
      });
  }, [open, providerId]);

  const uploadToStorage = async (file: File, kind: string) => {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${providerId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('entity-logos')
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('entity-logos').getPublicUrl(path);
    return pub.publicUrl;
  };

  const handleUpload = async (file: File, kind: 'logo' | 'cover') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Wybierz plik graficzny');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadToStorage(file, kind);
      const updateData: any = kind === 'logo' ? { logo_url: url } : { cover_image_url: url };
      const { error } = await (supabase as any)
        .from('service_providers')
        .update(updateData)
        .eq('id', providerId);
      if (error) throw error;
      if (kind === 'logo') setLogoUrl(url);
      else setCoverUrl(url);
      toast.success(kind === 'logo' ? 'Logo zaktualizowane' : 'Zdjęcie tła zaktualizowane');
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryUpload = async (files: FileList | File[] | null) => {
    if (!files) return;
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of fileArr) {
        const url = await uploadToStorage(file, 'gallery');
        uploaded.push(url);
      }
      const newGallery = [...gallery, ...uploaded];
      const { error } = await (supabase as any)
        .from('service_providers')
        .update({ gallery_photos: newGallery })
        .eq('id', providerId);
      if (error) throw error;
      setGallery(newGallery);
      toast.success(`Dodano ${uploaded.length} zdj.`);
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Błąd zapisu');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (kind: 'logo' | 'cover') => {
    if (!confirm(kind === 'logo' ? 'Usunąć logo?' : 'Usunąć zdjęcie tła?')) return;
    setUploading(true);
    try {
      const updateData: any = kind === 'logo' ? { logo_url: null } : { cover_image_url: null };
      const { error } = await (supabase as any)
        .from('service_providers')
        .update(updateData)
        .eq('id', providerId);
      if (error) throw error;
      if (kind === 'logo') setLogoUrl(null);
      else setCoverUrl(null);
      toast.success('Usunięto');
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Błąd');
    } finally {
      setUploading(false);
    }
  };

  const handleGalleryDelete = async (index: number) => {
    if (!confirm('Usunąć to zdjęcie z galerii?')) return;
    setUploading(true);
    try {
      const newGallery = gallery.filter((_, i) => i !== index);
      const { error } = await (supabase as any)
        .from('service_providers')
        .update({ gallery_photos: newGallery })
        .eq('id', providerId);
      if (error) throw error;
      setGallery(newGallery);
      toast.success('Usunięto');
      onSaved?.();
    } catch (err: any) {
      toast.error(err.message || 'Błąd');
    } finally {
      setUploading(false);
    }
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= gallery.length) return;
    const newGallery = [...gallery];
    [newGallery[index], newGallery[newIndex]] = [newGallery[newIndex], newGallery[index]];
    setGallery(newGallery);
    await (supabase as any).from('service_providers').update({ gallery_photos: newGallery }).eq('id', providerId);
    onSaved?.();
  };

  const setAsMain = async (index: number) => {
    if (index === 0) return;
    const newGallery = [gallery[index], ...gallery.filter((_, i) => i !== index)];
    setGallery(newGallery);
    await (supabase as any).from('service_providers').update({ gallery_photos: newGallery }).eq('id', providerId);
    toast.success('Ustawiono jako zdjęcie główne');
    onSaved?.();
  };

  // Drag & drop helpers
  const dropHandlers = (kind: 'logo' | 'cover' | 'gallery') => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(kind);
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;
      if (kind === 'gallery') {
        handleGalleryUpload(files);
      } else {
        handleUpload(files[0], kind);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Logo, zdjęcie tła i galeria</DialogTitle>
          <DialogDescription>
            Logo wyświetla się obok nazwy, zdjęcie tła w nagłówku karty, a galeria — jako zdjęcia firmy widoczne dla klientów.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="logo">Logo firmy</TabsTrigger>
              <TabsTrigger value="cover">Zdjęcie tła</TabsTrigger>
              <TabsTrigger value="gallery">
                Galeria zdjęć {gallery.length > 0 && <span className="ml-1 text-xs opacity-70">({gallery.length})</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="logo" className="space-y-4 mt-4">
              <div
                {...dropHandlers('logo')}
                onClick={() => !logoUrl && logoInputRef.current?.click()}
                className={cn(
                  "max-w-xs mx-auto rounded-xl border-2 border-dashed bg-muted/30 flex items-center justify-center overflow-hidden p-4 transition-colors min-h-[240px]",
                  dragOver === 'logo' ? 'border-primary bg-primary/10' : 'border-border',
                  !logoUrl && 'cursor-pointer hover:border-primary/60'
                )}
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="max-h-[220px] max-w-full w-auto h-auto object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Przeciągnij i upuść logo</p>
                    <p className="text-xs mt-1">lub kliknij, aby wybrać plik</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Najlepiej PNG z przezroczystym tłem. Logo zachowuje oryginalne proporcje (nie jest przycinane).
              </p>
              <div className="flex gap-2 justify-center">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'logo')} />
                <Button onClick={() => logoInputRef.current?.click()} disabled={uploading} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {logoUrl ? 'Zmień logo' : 'Wgraj logo'}
                </Button>
                {logoUrl && (
                  <Button variant="outline" onClick={() => handleDelete('logo')} disabled={uploading} className="gap-2">
                    <Trash2 className="h-4 w-4" /> Usuń
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="cover" className="space-y-4 mt-4">
              <div
                {...dropHandlers('cover')}
                onClick={() => !coverUrl && coverInputRef.current?.click()}
                className={cn(
                  "aspect-[16/9] rounded-xl border-2 border-dashed bg-muted/30 flex items-center justify-center overflow-hidden transition-colors",
                  dragOver === 'cover' ? 'border-primary bg-primary/10' : 'border-border',
                  !coverUrl && 'cursor-pointer hover:border-primary/60'
                )}
              >
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Przeciągnij i upuść zdjęcie tła</p>
                    <p className="text-xs mt-1">lub kliknij, aby wybrać plik</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Zalecane proporcje 16:9, min. 1600×900 px. Pojawia się w nagłówku karty.
              </p>
              <div className="flex gap-2 justify-center">
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'cover')} />
                <Button onClick={() => coverInputRef.current?.click()} disabled={uploading} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {coverUrl ? 'Zmień zdjęcie' : 'Wgraj zdjęcie'}
                </Button>
                {coverUrl && (
                  <Button variant="outline" onClick={() => handleDelete('cover')} disabled={uploading} className="gap-2">
                    <Trash2 className="h-4 w-4" /> Usuń
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="space-y-4 mt-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  Pierwsze zdjęcie jest <strong>główne</strong> (widoczne w portalu usług). Możesz zmieniać kolejność i wgrać kilka naraz.
                </p>
                <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => handleGalleryUpload(e.target.files)} />
                <Button onClick={() => galleryInputRef.current?.click()} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Dodaj zdjęcia
                </Button>
              </div>

              <div
                {...dropHandlers('gallery')}
                className={cn(
                  "border-2 border-dashed rounded-xl bg-muted/30 transition-colors p-3",
                  dragOver === 'gallery' ? 'border-primary bg-primary/10' : 'border-border'
                )}
              >
                {gallery.length === 0 ? (
                  <div
                    className="py-12 text-center text-muted-foreground cursor-pointer"
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">Przeciągnij i upuść zdjęcia</p>
                    <p className="text-xs mt-1">lub kliknij, aby wybrać pliki</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {gallery.map((url, idx) => (
                      <div key={url + idx} className="relative group rounded-lg overflow-hidden border bg-muted aspect-[4/3]">
                        <img src={url} alt={`Galeria ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          {idx !== 0 && (
                            <Button size="sm" variant="secondary" className="h-7 w-7 p-0" disabled={uploading}
                              onClick={() => setAsMain(idx)} title="Ustaw jako główne">
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="secondary" className="h-7 w-7 p-0" disabled={idx === 0 || uploading}
                            onClick={() => moveImage(idx, -1)} title="W lewo">
                            ←
                          </Button>
                          <Button size="sm" variant="secondary" className="h-7 w-7 p-0" disabled={idx === gallery.length - 1 || uploading}
                            onClick={() => moveImage(idx, 1)} title="W prawo">
                            →
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 w-7 p-0" disabled={uploading}
                            onClick={() => handleGalleryDelete(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {idx === 0 && (
                          <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 fill-current" /> Główne
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

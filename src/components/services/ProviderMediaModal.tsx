import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Upload, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProviderMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  initialTab?: 'logo' | 'cover';
  onSaved?: () => void;
}

export function ProviderMediaModal({
  open,
  onOpenChange,
  providerId,
  initialTab = 'logo',
  onSaved,
}: ProviderMediaModalProps) {
  const [tab, setTab] = useState<'logo' | 'cover'>(initialTab);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !providerId) return;
    setLoading(true);
    (supabase as any)
      .from('service_providers')
      .select('logo_url, cover_image_url')
      .eq('id', providerId)
      .maybeSingle()
      .then(({ data }: any) => {
        setLogoUrl(data?.logo_url || null);
        setCoverUrl(data?.cover_image_url || null);
        setLoading(false);
      });
  }, [open, providerId]);

  const handleUpload = async (file: File, kind: 'logo' | 'cover') => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${providerId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('entity-logos')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('entity-logos').getPublicUrl(path);
      const url = pub.publicUrl;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Logo i zdjęcia tła</DialogTitle>
          <DialogDescription>
            Zarządzaj logiem firmy i zdjęciem tła wyświetlanym na karcie usługodawcy.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'logo' | 'cover')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="logo">Logo firmy</TabsTrigger>
              <TabsTrigger value="cover">Zdjęcie tła (cover)</TabsTrigger>
            </TabsList>

            <TabsContent value="logo" className="space-y-4 mt-4">
              <div className="aspect-square max-w-xs mx-auto rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden p-2">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Brak logo</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Najlepiej PNG z przezroczystym tłem. Wyświetlane w pełnej szerokości obok nazwy.
              </p>
              <div className="flex gap-2 justify-center">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'logo')}
                />
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
              <div className="aspect-[16/9] rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Brak zdjęcia tła</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Zalecane proporcje 16:9, min. 1600×900 px. Pojawia się w nagłówku karty.
              </p>
              <div className="flex gap-2 justify-center">
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'cover')}
                />
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
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

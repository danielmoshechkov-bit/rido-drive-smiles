import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Upload, Trash2, Loader2, Building2 } from 'lucide-react';
import { compressLogoImage } from '@/utils/imageCompression';

interface EntityLogoUploadProps {
  entityId: string;
  currentLogoUrl: string | null;
  entityName: string;
  onLogoUpdated: (url: string | null) => void;
}

export function EntityLogoUpload({
  entityId,
  currentLogoUrl,
  entityName,
  onLogoUpdated,
}: EntityLogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Błąd', description: 'Wybierz plik obrazu', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      // Compress image automatically - no size limit for user
      const compressedBlob = await compressLogoImage(file);
      
      // Generate unique filename
      const fileName = `${entityId}-${Date.now()}.jpg`;
      const filePath = `logos/${fileName}`;
      const compressedFile = new File([compressedBlob], fileName, { type: 'image/jpeg' });

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('entity-logos')
        .upload(filePath, compressedFile, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('entity-logos')
        .getPublicUrl(filePath);

      // Update entity
      const { error: updateError } = await supabase
        .from('entities')
        .update({ logo_url: publicUrl })
        .eq('id', entityId);

      if (updateError) throw updateError;

      onLogoUpdated(publicUrl);
      
      // Show compression info
      const originalSize = (file.size / 1024).toFixed(0);
      const compressedSize = (compressedBlob.size / 1024).toFixed(0);
      toast({ title: 'Sukces', description: `Logo zaktualizowane (${originalSize}KB → ${compressedSize}KB)` });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({ title: 'Błąd', description: 'Nie udało się przesłać logo', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!currentLogoUrl) return;

    setDeleting(true);
    try {
      // Extract file path from URL
      const urlParts = currentLogoUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `logos/${fileName}`;

      // Delete from storage
      await supabase.storage
        .from('entity-logos')
        .remove([filePath]);

      // Update entity
      const { error } = await supabase
        .from('entities')
        .update({ logo_url: null })
        .eq('id', entityId);

      if (error) throw error;

      onLogoUpdated(null);
      toast({ title: 'Sukces', description: 'Logo zostało usunięte' });
    } catch (error) {
      console.error('Error deleting logo:', error);
      toast({ title: 'Błąd', description: 'Nie udało się usunąć logo', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const initials = entityName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-4">
      <Label>Logo firmy</Label>
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 rounded-lg">
          <AvatarImage src={currentLogoUrl || undefined} alt={entityName} className="object-contain" />
          <AvatarFallback className="rounded-lg bg-muted">
            {initials || <Building2 className="h-8 w-8 text-muted-foreground" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {currentLogoUrl ? 'Zmień logo' : 'Dodaj logo'}
          </Button>

          {currentLogoUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Usuń logo
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Dowolny rozmiar obrazu - system automatycznie optymalizuje. Logo będzie widoczne na fakturach.
      </p>
    </div>
  );
}

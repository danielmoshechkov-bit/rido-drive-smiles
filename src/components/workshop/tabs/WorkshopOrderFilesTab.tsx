import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Trash2, Image, FileText, Loader2, AlertTriangle, Download, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { compressImageWithWatermark, formatTimestampPL } from '@/lib/imageCompression';

interface Props {
  order: any;
}

interface OrderFile {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  expires_at: string | null;
  created_at: string | null;
}

export function WorkshopOrderFilesTab({ order }: Props) {
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    if (!order?.id) return;
    const { data, error } = await (supabase as any)
      .from('workshop_order_files')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at', { ascending: true });
    if (!error) setFiles(data || []);
    setLoading(false);
  }, [order?.id]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from('workshop-order-photos').getPublicUrl(filePath);
    return data?.publicUrl || '';
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length || !order?.id) return;
    setUploading(true);
    try {
      for (const file of Array.from(selectedFiles)) {
        const _ext = file.name.split('.').pop() || 'bin';
        const storagePath = `${order.id}/${Date.now()}_${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('workshop-order-photos')
          .upload(storagePath, file, { upsert: true });
        if (uploadErr) { toast.error(`Błąd: ${file.name}`); continue; }
        await (supabase as any).from('workshop_order_files').insert({
          order_id: order.id,
          file_name: file.name,
          file_url: storagePath,
          file_size: file.size,
          file_type: 'attachment',
        });
      }
      toast.success('Pliki dodane');
      fetchFiles();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (file: OrderFile) => {
    await supabase.storage.from('workshop-order-photos').remove([file.file_url]);
    await (supabase as any).from('workshop_order_files').delete().eq('id', file.id);
    toast.success('Plik usunięty');
    fetchFiles();
  };

  const intakePhotos = files.filter(f => f.file_type === 'intake_photo');
  const attachments = files.filter(f => f.file_type !== 'intake_photo');

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Intake photos section */}
      {intakePhotos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Zdjęcia z przyjęcia pojazdu</h3>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Zdjęcia z przyjęcia są przechowywane przez 30 dni i automatycznie usuwane w celu oszczędności miejsca na serwerze.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {intakePhotos.map(file => {
              const url = getPublicUrl(file.file_url);
              const daysLeft = file.expires_at
                ? Math.max(0, Math.ceil((new Date(file.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : null;
              return (
                <div key={file.id} className="group relative rounded-xl border overflow-hidden bg-muted/30">
                  <div className="aspect-[4/3]">
                    <img src={url} alt={file.file_name} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-1.5 text-center">
                    <p className="text-[10px] font-medium truncate">{file.file_name}</p>
                    {daysLeft !== null && (
                      <p className="text-[9px] text-muted-foreground">
                        {daysLeft > 0 ? `Wygasa za ${daysLeft} dni` : 'Wygasa dziś'}
                      </p>
                    )}
                  </div>
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="bg-background/80 backdrop-blur rounded-full p-1 hover:bg-background">
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button onClick={() => handleDelete(file)}
                      className="bg-destructive/80 backdrop-blur text-destructive-foreground rounded-full p-1 hover:bg-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attachments section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Pliki załączone</h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Dodaj pliki
          </Button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
        </div>

        {attachments.length === 0 && intakePhotos.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-primary font-medium hover:underline">Brak plików, kliknij aby dodać</p>
            <p className="text-xs text-muted-foreground mt-1">Przeciągnij i upuść pliki lub kliknij</p>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="space-y-1">
            {attachments.map(file => (
              <div key={file.id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-accent/30 group">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.file_size ? `${(file.file_size / 1024).toFixed(0)} KB` : ''} 
                      {file.created_at ? ` · ${format(new Date(file.created_at), 'dd.MM.yyyy HH:mm')}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={getPublicUrl(file.file_url)} target="_blank" rel="noopener noreferrer">
                    <Button size="icon" variant="ghost" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                  </a>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(file)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

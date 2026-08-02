import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, ImageIcon, Pencil, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useProviderCategories } from '@/hooks/useProviderCategories';

/**
 * Pasek kategorii usługodawcy — jak zakładki stanowisk w kalendarzu.
 * „Wszystkie" + własne kategorie + dodawanie w miejscu, bez okien dialogowych.
 */
export function ProviderCategoryBar({
  providerId,
  active,
  onChange,
  counts,
}: {
  providerId: string | null;
  active: string;              // '' = wszystkie
  onChange: (category: string) => void;
  counts?: Record<string, number>;
}) {
  const { categories, add, rename, remove, setPhoto } = useProviderCategories(providerId);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);

  const submitAdd = () => {
    if (!newName.trim()) { setAdding(false); return; }
    add.mutate(newName, { onSuccess: (name) => { onChange(name); setNewName(''); setAdding(false); } });
  };

  const pickPhoto = (categoryId: string) => {
    photoTargetRef.current = categoryId;
    fileRef.current?.click();
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const categoryId = photoTargetRef.current;
    e.target.value = '';
    if (!file || !categoryId || !providerId) return;
    setUploadingId(categoryId);
    try {
      const ext = file.name.split('.').pop();
      const path = `services/${providerId}/kategoria-${categoryId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      await setPhoto.mutateAsync({ id: categoryId, photo_url: data.publicUrl });
      toast.success('Zdjęcie kategorii zapisane');
    } catch (err: any) {
      toast.error('Nie udało się wgrać zdjęcia: ' + err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const total = Object.values(counts || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-1 flex-wrap border rounded-xl p-1 bg-muted/30">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />

      <Button variant={active === '' ? 'default' : 'ghost'} size="sm" className="h-8 gap-1.5" onClick={() => onChange('')}>
        Wszystkie
        {total > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">{total}</Badge>}
      </Button>

      {categories.map((c) => {
        const isActive = active === c.name;
        if (renamingId === c.id) {
          return (
            <Input
              key={c.id}
              autoFocus
              className="h-8 w-36"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => setRenamingId(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  rename.mutate({ id: c.id, oldName: c.name, name: renameValue }, {
                    onSuccess: () => { if (active === c.name) onChange(renameValue.trim()); setRenamingId(null); },
                  });
                }
                if (e.key === 'Escape') setRenamingId(null);
              }}
            />
          );
        }
        return (
          <div key={c.id} className={`flex items-center rounded-md ${isActive ? 'bg-primary text-primary-foreground' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 gap-1.5 ${isActive ? 'text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''}`}
              onClick={() => onChange(c.name)}
            >
              {uploadingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : c.photo_url ? (
                <img src={c.photo_url} alt="" className="h-4 w-4 rounded object-cover" />
              ) : null}
              {c.name}
              {counts?.[c.name] ? (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">{counts[c.name]}</Badge>
              ) : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={`h-8 w-6 ${isActive ? 'text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''}`}>
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setRenamingId(c.id); setRenameValue(c.name); }}>
                  <Pencil className="h-4 w-4 mr-2" /> Zmień nazwę
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => pickPhoto(c.id)}>
                  <ImageIcon className="h-4 w-4 mr-2" /> {c.photo_url ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}
                </DropdownMenuItem>
                {c.photo_url && (
                  <DropdownMenuItem onClick={() => setPhoto.mutate({ id: c.id, photo_url: null })}>
                    <Trash2 className="h-4 w-4 mr-2" /> Usuń zdjęcie
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => remove.mutate({ id: c.id, name: c.name })}>
                  <Trash2 className="h-4 w-4 mr-2" /> Usuń kategorię
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {adding ? (
        <Input
          autoFocus
          className="h-8 w-40"
          placeholder="np. Myjnia"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={submitAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitAdd();
            if (e.key === 'Escape') { setNewName(''); setAdding(false); }
          }}
        />
      ) : (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Dodaj kategorię
        </Button>
      )}
    </div>
  );
}

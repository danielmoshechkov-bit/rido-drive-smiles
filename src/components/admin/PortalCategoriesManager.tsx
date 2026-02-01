import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical, 
  Eye, 
  EyeOff,
  Car,
  Home,
  Wrench,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Loader2
} from 'lucide-react';

interface PortalCategory {
  id: string;
  portal_context: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  link_url: string;
  sort_order: number;
  is_visible: boolean;
  service_category_id: string | null;
}

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
}

const PORTAL_CONTEXTS = [
  { value: 'motoryzacja', label: 'Motoryzacja', icon: Car },
  { value: 'nieruchomosci', label: 'Nieruchomości', icon: Home },
  { value: 'uslugi', label: 'Usługi', icon: Wrench },
] as const;

export function PortalCategoriesManager() {
  const [categories, setCategories] = useState<PortalCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeContext, setActiveContext] = useState<'motoryzacja' | 'nieruchomosci' | 'uslugi'>('motoryzacja');
  const [editingCategory, setEditingCategory] = useState<PortalCategory | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    link_url: '',
    is_visible: true,
    service_category_id: '',
  });

  useEffect(() => {
    fetchCategories();
    fetchServiceCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('portal_categories')
        .select('*')
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Błąd podczas pobierania kategorii');
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('service_categories')
        .select('id, name, slug')
        .order('name');
      
      if (error) throw error;
      setServiceCategories(data || []);
    } catch (error) {
      console.error('Error fetching service categories:', error);
    }
  };

  const filteredCategories = categories.filter(c => c.portal_context === activeContext);

  const handleAdd = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      image_url: '',
      link_url: '',
      is_visible: true,
      service_category_id: '',
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (category: PortalCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      image_url: category.image_url || '',
      link_url: category.link_url,
      is_visible: category.is_visible,
      service_category_id: category.service_category_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.link_url.trim()) {
      toast.error('Nazwa i link są wymagane');
      return;
    }

    setSaving(true);
    try {
      const slug = formData.slug.trim() || formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      if (editingCategory) {
        // Update
        const { error } = await supabase
          .from('portal_categories')
          .update({
            name: formData.name.trim(),
            slug,
            description: formData.description.trim() || null,
            image_url: formData.image_url.trim() || null,
            link_url: formData.link_url.trim(),
            is_visible: formData.is_visible,
            service_category_id: formData.service_category_id || null,
          })
          .eq('id', editingCategory.id);
        
        if (error) throw error;
        toast.success('Kategoria zaktualizowana');
      } else {
        // Insert
        const maxOrder = Math.max(...filteredCategories.map(c => c.sort_order), 0);
        const { error } = await supabase
          .from('portal_categories')
          .insert({
            portal_context: activeContext,
            name: formData.name.trim(),
            slug,
            description: formData.description.trim() || null,
            image_url: formData.image_url.trim() || null,
            link_url: formData.link_url.trim(),
            is_visible: formData.is_visible,
            service_category_id: formData.service_category_id || null,
            sort_order: maxOrder + 1,
          });
        
        if (error) throw error;
        toast.success('Kategoria dodana');
      }

      setIsDialogOpen(false);
      fetchCategories();
    } catch (error: any) {
      console.error('Error saving category:', error);
      toast.error(error.message || 'Błąd podczas zapisywania');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: PortalCategory) => {
    if (!confirm(`Czy na pewno chcesz usunąć "${category.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('portal_categories')
        .delete()
        .eq('id', category.id);
      
      if (error) throw error;
      toast.success('Kategoria usunięta');
      fetchCategories();
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error.message || 'Błąd podczas usuwania');
    }
  };

  const handleToggleVisibility = async (category: PortalCategory) => {
    try {
      const { error } = await supabase
        .from('portal_categories')
        .update({ is_visible: !category.is_visible })
        .eq('id', category.id);
      
      if (error) throw error;
      fetchCategories();
    } catch (error) {
      console.error('Error toggling visibility:', error);
      toast.error('Błąd podczas zmiany widoczności');
    }
  };

  const handleMove = async (category: PortalCategory, direction: 'up' | 'down') => {
    const currentIndex = filteredCategories.findIndex(c => c.id === category.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (targetIndex < 0 || targetIndex >= filteredCategories.length) return;

    const targetCategory = filteredCategories[targetIndex];
    
    try {
      // Swap sort orders
      await supabase
        .from('portal_categories')
        .update({ sort_order: targetCategory.sort_order })
        .eq('id', category.id);
      
      await supabase
        .from('portal_categories')
        .update({ sort_order: category.sort_order })
        .eq('id', targetCategory.id);

      fetchCategories();
    } catch (error) {
      console.error('Error moving category:', error);
      toast.error('Błąd podczas zmiany kolejności');
    }
  };

  const getContextIcon = (context: string) => {
    switch (context) {
      case 'motoryzacja': return <Car className="h-4 w-4" />;
      case 'nieruchomosci': return <Home className="h-4 w-4" />;
      case 'uslugi': return <Wrench className="h-4 w-4" />;
      default: return null;
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
          <CardTitle>Zarządzanie kategoriami portali</CardTitle>
          <CardDescription>
            Dodawaj, usuwaj i zmieniaj kolejność kafelków wyświetlanych na stronach portali
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Context Tabs */}
          <div className="flex gap-2 mb-6">
            {PORTAL_CONTEXTS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={activeContext === value ? 'default' : 'outline'}
                onClick={() => setActiveContext(value)}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>

          {/* Add Button */}
          <div className="flex justify-end mb-4">
            <Button onClick={handleAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj kategorię
            </Button>
          </div>

          {/* Categories Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Kolejność</TableHead>
                <TableHead className="w-16">Obraz</TableHead>
                <TableHead>Nazwa</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Usługa</TableHead>
                <TableHead className="w-24">Widoczna</TableHead>
                <TableHead className="w-32">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Brak kategorii dla tego portalu
                  </TableCell>
                </TableRow>
              ) : (
                filteredCategories.map((category, index) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0}
                          onClick={() => handleMove(category, 'up')}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === filteredCategories.length - 1}
                          onClick={() => handleMove(category, 'down')}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {category.image_url ? (
                        <img 
                          src={category.image_url} 
                          alt={category.name}
                          className="h-10 w-14 object-cover rounded"
                        />
                      ) : (
                        <div className="h-10 w-14 bg-muted rounded flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{category.name}</p>
                        {category.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {category.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {category.link_url}
                      </code>
                    </TableCell>
                    <TableCell>
                      {category.service_category_id ? (
                        <Badge variant="secondary">
                          {serviceCategories.find(sc => sc.id === category.service_category_id)?.name || 'Nieznana'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleVisibility(category)}
                      >
                        {category.is_visible ? (
                          <Eye className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(category)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit/Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen} modal={true}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edytuj kategorię' : 'Dodaj kategorię'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nazwa *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="np. Warsztaty"
              />
            </div>

            <div>
              <Label htmlFor="slug">Slug (opcjonalny)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="np. warsztaty (generowany automatycznie)"
              />
            </div>

            <div>
              <Label htmlFor="description">Opis</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Krótki opis kategorii"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="link_url">Link docelowy *</Label>
              <Input
                id="link_url"
                value={formData.link_url}
                onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                placeholder="np. /uslugi?category=warsztat"
              />
            </div>

            <div>
              <Label htmlFor="image_url">URL obrazu</Label>
              <Input
                id="image_url"
                value={formData.image_url}
                onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                placeholder="https://..."
              />
              {formData.image_url && (
                <img 
                  src={formData.image_url} 
                  alt="Preview"
                  className="mt-2 h-20 w-32 object-cover rounded border"
                />
              )}
            </div>

            <div>
              <Label htmlFor="service_category">Powiązana kategoria usług</Label>
              <Select
                value={formData.service_category_id}
                onValueChange={(value) => setFormData({ ...formData, service_category_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kategorię (opcjonalnie)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Brak</SelectItem>
                  {serviceCategories.map(sc => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {sc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_visible"
                checked={formData.is_visible}
                onCheckedChange={(checked) => setFormData({ ...formData, is_visible: checked })}
              />
              <Label htmlFor="is_visible">Widoczna na portalu</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingCategory ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

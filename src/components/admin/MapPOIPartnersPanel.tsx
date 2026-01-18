// GetRido Maps - Admin POI Partners Management Panel
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, MapPin, Fuel, Zap, ParkingCircle, Store, MoreHorizontal, Search } from 'lucide-react';

interface POIPartner {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  payment_supported: boolean;
  payment_type: string | null;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'fuel', label: 'Stacja paliw', icon: Fuel },
  { value: 'ev_charger', label: 'Ładowarka EV', icon: Zap },
  { value: 'parking', label: 'Parking', icon: ParkingCircle },
  { value: 'shop', label: 'Sklep', icon: Store },
  { value: 'service', label: 'Serwis', icon: MapPin },
  { value: 'toll', label: 'Bramka', icon: MapPin },
  { value: 'other', label: 'Inne', icon: MoreHorizontal },
];

const PAYMENT_TYPES = [
  { value: 'charging', label: 'Ładowanie' },
  { value: 'parking', label: 'Parking' },
  { value: 'toll', label: 'Opłata drogowa' },
];

export function MapPOIPartnersPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPOI, setEditingPOI] = useState<POIPartner | null>(null);

  // Fetch POIs
  const { data: pois, isLoading } = useQuery({
    queryKey: ['map-poi-partners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('map_poi_partners')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as POIPartner[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('map_poi_partners').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-poi-partners'] });
      toast.success('POI usunięte');
    },
    onError: () => toast.error('Błąd usuwania'),
  });

  const filteredPOIs = pois?.filter(poi => 
    poi.name.toLowerCase().includes(search.toLowerCase()) ||
    poi.city?.toLowerCase().includes(search.toLowerCase()) ||
    poi.address?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category);
    const Icon = cat?.icon || MapPin;
    return <Icon className="h-4 w-4" />;
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  const handleEdit = (poi: POIPartner) => {
    setEditingPOI(poi);
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingPOI(null);
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                POI Partnerzy
              </CardTitle>
              <CardDescription>
                Zarządzaj punktami zainteresowań partnerów
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Dodaj POI
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingPOI ? 'Edytuj POI' : 'Dodaj nowy POI'}</DialogTitle>
                  <DialogDescription>
                    Wprowadź dane punktu zainteresowania
                  </DialogDescription>
                </DialogHeader>
                <POIForm 
                  poi={editingPOI} 
                  onSuccess={() => {
                    setIsDialogOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['map-poi-partners'] });
                  }} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj po nazwie, mieście, adresie..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Płatności</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOIs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Brak POI do wyświetlenia
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPOIs.map((poi) => (
                    <TableRow key={poi.id}>
                      <TableCell className="font-medium">{poi.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {getCategoryIcon(poi.category)}
                          {getCategoryLabel(poi.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {poi.city || poi.address || `${poi.lat.toFixed(4)}, ${poi.lng.toFixed(4)}`}
                      </TableCell>
                      <TableCell>
                        {poi.payment_supported ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                            {PAYMENT_TYPES.find(p => p.value === poi.payment_type)?.label || 'Tak'}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Nie</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={poi.is_active ? 'default' : 'secondary'}>
                          {poi.is_active ? 'Aktywny' : 'Nieaktywny'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(poi)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteMutation.mutate(poi.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// POI Form Component
function POIForm({ poi, onSuccess }: { poi: POIPartner | null; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: poi?.name || '',
    category: poi?.category || 'other',
    lat: poi?.lat?.toString() || '',
    lng: poi?.lng?.toString() || '',
    address: poi?.address || '',
    city: poi?.city || '',
    phone: poi?.phone || '',
    website: poi?.website || '',
    payment_supported: poi?.payment_supported || false,
    payment_type: poi?.payment_type || '',
    is_active: poi?.is_active ?? true,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name,
        category: formData.category,
        lat: parseFloat(formData.lat),
        lng: parseFloat(formData.lng),
        address: formData.address || null,
        city: formData.city || null,
        phone: formData.phone || null,
        website: formData.website || null,
        payment_supported: formData.payment_supported,
        payment_type: formData.payment_supported ? formData.payment_type : null,
        is_active: formData.is_active,
      };

      if (poi) {
        const { error } = await supabase.from('map_poi_partners').update(payload).eq('id', poi.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('map_poi_partners').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(poi ? 'POI zaktualizowane' : 'POI dodane');
      onSuccess();
    },
    onError: () => toast.error('Błąd zapisu'),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Nazwa *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Nazwa POI"
          />
        </div>
        
        <div>
          <Label htmlFor="category">Kategoria *</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="city">Miasto</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="lat">Szerokość (lat) *</Label>
          <Input
            id="lat"
            type="number"
            step="any"
            value={formData.lat}
            onChange={(e) => setFormData(prev => ({ ...prev, lat: e.target.value }))}
            placeholder="52.2297"
          />
        </div>

        <div>
          <Label htmlFor="lng">Długość (lng) *</Label>
          <Input
            id="lng"
            type="number"
            step="any"
            value={formData.lng}
            onChange={(e) => setFormData(prev => ({ ...prev, lng: e.target.value }))}
            placeholder="21.0122"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="address">Adres</Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="website">Strona WWW</Label>
          <Input
            id="website"
            value={formData.website}
            onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
          />
        </div>

        <div className="col-span-2 flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
          <Switch
            id="payment"
            checked={formData.payment_supported}
            onCheckedChange={(v) => setFormData(prev => ({ ...prev, payment_supported: v }))}
          />
          <Label htmlFor="payment">Obsługuje płatności GetRido</Label>
        </div>

        {formData.payment_supported && (
          <div className="col-span-2">
            <Label htmlFor="payment_type">Typ płatności</Label>
            <Select value={formData.payment_type} onValueChange={(v) => setFormData(prev => ({ ...prev, payment_type: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz typ" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TYPES.map(pt => (
                  <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="col-span-2 flex items-center gap-4">
          <Switch
            id="active"
            checked={formData.is_active}
            onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
          />
          <Label htmlFor="active">Aktywny</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formData.name || !formData.lat || !formData.lng}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {poi ? 'Zapisz zmiany' : 'Dodaj POI'}
        </Button>
      </div>
    </div>
  );
}

export default MapPOIPartnersPanel;

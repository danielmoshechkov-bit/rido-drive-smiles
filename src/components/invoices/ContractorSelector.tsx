import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, 
  Plus, 
  Download, 
  UserPlus, 
  Building2,
  Loader2,
  Check,
  ChevronDown,
  X
} from 'lucide-react';

interface Contractor {
  id: string;
  name: string;
  nip?: string;
  address_street?: string;
  address_city?: string;
  address_postal_code?: string;
  bank_account?: string;
}

interface ContractorSelectorProps {
  entityId?: string;
  value: Contractor | null;
  onChange: (contractor: Contractor | null) => void;
  onAddNew?: (contractor: Contractor) => void;
}

export function ContractorSelector({ entityId, value, onChange, onAddNew }: ContractorSelectorProps) {
  const [open, setOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<'gus' | 'manual' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(false);
  
  // GUS lookup state
  const [nipInput, setNipInput] = useState('');
  const [isSearchingGus, setIsSearchingGus] = useState(false);
  const [gusResult, setGusResult] = useState<Contractor | null>(null);
  
  // Manual entry state
  const [manualData, setManualData] = useState<Partial<Contractor>>({});

  useEffect(() => {
    if (entityId) {
      fetchContractors();
    }
  }, [entityId]);

  const fetchContractors = async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('invoice_recipients')
        .select('*')
        .eq('entity_id', entityId)
        .order('name');
      
      if (data) setContractors(data);
    } finally {
      setLoading(false);
    }
  };

  const searchGUS = async () => {
    const cleanNip = nipInput.replace(/\D/g, '');
    if (cleanNip.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }

    setIsSearchingGus(true);
    setGusResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip: cleanNip }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const gus = data.data;
        setGusResult({
          id: '', // Will be generated on save
          name: gus.name,
          nip: gus.nip,
          address_street: gus.address,
          address_city: gus.city,
          address_postal_code: gus.postalCode
        });
        toast.success('Dane pobrane z GUS');
      } else {
        toast.error(data?.error || 'Nie znaleziono firmy w GUS');
      }
    } catch (err) {
      console.error('GUS error:', err);
      toast.error('Błąd pobierania danych z GUS');
    } finally {
      setIsSearchingGus(false);
    }
  };

  const handleSelectGusResult = () => {
    if (gusResult) {
      onChange(gusResult);
      onAddNew?.(gusResult);
      setAddDialogOpen(false);
      setAddMode(null);
      setGusResult(null);
      setNipInput('');
    }
  };

  const handleSaveManual = () => {
    if (!manualData.name) {
      toast.error('Nazwa jest wymagana');
      return;
    }
    
    const contractor: Contractor = {
      id: '', // Will be generated on save
      name: manualData.name,
      nip: manualData.nip,
      address_street: manualData.address_street,
      address_city: manualData.address_city,
      address_postal_code: manualData.address_postal_code
    };
    
    onChange(contractor);
    onAddNew?.(contractor);
    setAddDialogOpen(false);
    setAddMode(null);
    setManualData({});
  };

  const filteredContractors = contractors.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.nip && c.nip.includes(searchQuery))
  );

  const openAddDialog = () => {
    setOpen(false);
    setAddDialogOpen(true);
  };

  return (
    <>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Nabywca (kontrahent)
        </Label>
        
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between h-auto min-h-10 py-2"
            >
              {value ? (
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">{value.name}</span>
                  {value.nip && (
                    <span className="text-xs text-muted-foreground">NIP: {value.nip}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Wybierz lub dodaj kontrahenta...</span>
              )}
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0 z-50" align="start">
            <Command>
              <CommandInput 
                placeholder="Szukaj kontrahenta..." 
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">Brak wyników</p>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={openAddDialog}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj kontrahenta: {searchQuery || 'nowego'}
                    </Button>
                  </div>
                </CommandEmpty>
                
                {filteredContractors.length > 0 && (
                  <CommandGroup heading="Twoi kontrahenci">
                    {filteredContractors.map((contractor) => (
                      <CommandItem
                        key={contractor.id}
                        value={contractor.name}
                        onSelect={() => {
                          onChange(contractor);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between py-3"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{contractor.name}</span>
                          {contractor.nip && (
                            <span className="text-xs text-muted-foreground">NIP: {contractor.nip}</span>
                          )}
                          {contractor.address_city && (
                            <span className="text-xs text-muted-foreground">{contractor.address_city}</span>
                          )}
                        </div>
                        {value?.id === contractor.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                
                <CommandSeparator />
                
                <CommandGroup>
                  <CommandItem onSelect={openAddDialog} className="py-3">
                    <Plus className="h-4 w-4 mr-2 text-primary" />
                    <span className="font-medium text-primary">Dodaj nowego kontrahenta</span>
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Show selected contractor details */}
        {value && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{value.name}</p>
                  {value.nip && <p className="text-sm text-muted-foreground">NIP: {value.nip}</p>}
                  {(value.address_street || value.address_city) && (
                    <p className="text-sm text-muted-foreground">
                      {[value.address_street, value.address_postal_code, value.address_city]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onChange(null)}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Contractor Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Nowy kontrahent
            </DialogTitle>
          </DialogHeader>

          {!addMode && (
            <div className="space-y-4 py-4">
              <p className="text-center text-lg font-medium">Wprowadź numer NIP</p>
              
              <Input
                value={nipInput}
                onChange={(e) => setNipInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Wpisz NIP (10 cyfr)"
                maxLength={10}
                className="text-center text-lg"
              />

              <Button 
                onClick={searchGUS} 
                disabled={isSearchingGus || nipInput.length !== 10}
                className="w-full"
                size="lg"
              >
                {isSearchingGus ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Pobierz dane z GUS
              </Button>

              <Button 
                variant="secondary"
                onClick={() => setAddMode('manual')}
                className="w-full"
                size="lg"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Wprowadź samodzielnie
              </Button>

              {/* GUS Result */}
              {gusResult && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="default">
                        Znaleziono w GUS
                      </Badge>
                    </div>
                    <div>
                      <p className="font-semibold">{gusResult.name}</p>
                      <p className="text-sm text-muted-foreground">NIP: {gusResult.nip}</p>
                      <p className="text-sm text-muted-foreground">
                        {gusResult.address_street}, {gusResult.address_postal_code} {gusResult.address_city}
                      </p>
                    </div>
                    <Button onClick={handleSelectGusResult} className="w-full">
                      <Check className="h-4 w-4 mr-2" />
                      Użyj tych danych
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {addMode === 'manual' && (
            <div className="space-y-4 py-4">
              <div className="space-y-3">
                <div>
                  <Label>Nazwa firmy / Imię i nazwisko *</Label>
                  <Input
                    value={manualData.name || ''}
                    onChange={(e) => setManualData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Nazwa kontrahenta"
                  />
                </div>
                <div>
                  <Label>NIP</Label>
                  <Input
                    value={manualData.nip || ''}
                    onChange={(e) => setManualData(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                    placeholder="NIP (opcjonalnie)"
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label>Ulica i numer</Label>
                  <Input
                    value={manualData.address_street || ''}
                    onChange={(e) => setManualData(prev => ({ ...prev, address_street: e.target.value }))}
                    placeholder="ul. Przykładowa 1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Kod pocztowy</Label>
                    <Input
                      value={manualData.address_postal_code || ''}
                      onChange={(e) => setManualData(prev => ({ ...prev, address_postal_code: e.target.value }))}
                      placeholder="00-000"
                    />
                  </div>
                  <div>
                    <Label>Miasto</Label>
                    <Input
                      value={manualData.address_city || ''}
                      onChange={(e) => setManualData(prev => ({ ...prev, address_city: e.target.value }))}
                      placeholder="Miasto"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setAddMode(null);
                    setManualData({});
                  }}
                  className="flex-1"
                >
                  Wstecz
                </Button>
                <Button onClick={handleSaveManual} className="flex-1">
                  <Check className="h-4 w-4 mr-2" />
                  Zapisz
                </Button>
              </div>
            </div>
          )}

          {!addMode && !gusResult && (
            <div className="text-center pb-4">
              <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
                Anuluj
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

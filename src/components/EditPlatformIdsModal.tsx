import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditPlatformIdsModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string;
  currentPlatformIds: any;
  onSuccess: () => void;
}

export const EditPlatformIdsModal = ({
  isOpen,
  onClose,
  driverId,
  currentPlatformIds,
  onSuccess,
}: EditPlatformIdsModalProps) => {
  const [uber, setUber] = useState<string[]>(currentPlatformIds?.uber || []);
  const [bolt, setBolt] = useState<string[]>(currentPlatformIds?.bolt || []);
  const [freeNow, setFreeNow] = useState<string[]>(currentPlatformIds?.freeNow || []);
  
  const [newUber, setNewUber] = useState('');
  const [newBolt, setNewBolt] = useState('');
  const [newFreeNow, setNewFreeNow] = useState('');

  const addId = (platform: 'uber' | 'bolt' | 'freeNow', id: string) => {
    if (!id.trim()) return;
    
    if (platform === 'uber' && !uber.includes(id)) {
      setUber([...uber, id]);
      setNewUber('');
    } else if (platform === 'bolt' && !bolt.includes(id)) {
      setBolt([...bolt, id]);
      setNewBolt('');
    } else if (platform === 'freeNow' && !freeNow.includes(id)) {
      setFreeNow([...freeNow, id]);
      setNewFreeNow('');
    }
  };

  const removeId = (platform: 'uber' | 'bolt' | 'freeNow', id: string) => {
    if (platform === 'uber') {
      setUber(uber.filter(x => x !== id));
    } else if (platform === 'bolt') {
      setBolt(bolt.filter(x => x !== id));
    } else if (platform === 'freeNow') {
      setFreeNow(freeNow.filter(x => x !== id));
    }
  };

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          platform_ids: { uber, bolt, freeNow },
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);

      if (error) throw error;

      toast.success('Zaktualizowano identyfikatory platform');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating platform IDs:', error);
      toast.error('Błąd podczas aktualizacji');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edytuj identyfikatory platform</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Uber */}
          <div>
            <Label>Uber UUID</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={newUber}
                onChange={(e) => setNewUber(e.target.value)}
                placeholder="Wprowadź UUID"
              />
              <Button onClick={() => addId('uber', newUber)}>Dodaj</Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {uber.map(id => (
                <Badge key={id} className="bg-black text-white">
                  {id}
                  <X
                    size={14}
                    className="ml-2 cursor-pointer"
                    onClick={() => removeId('uber', id)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          {/* Bolt */}
          <div>
            <Label>Bolt ID</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={newBolt}
                onChange={(e) => setNewBolt(e.target.value)}
                placeholder="Wprowadź ID"
              />
              <Button onClick={() => addId('bolt', newBolt)}>Dodaj</Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {bolt.map(id => (
                <Badge key={id} className="bg-green-500 text-white">
                  {id}
                  <X
                    size={14}
                    className="ml-2 cursor-pointer"
                    onClick={() => removeId('bolt', id)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          {/* FreeNow */}
          <div>
            <Label>FreeNow ID</Label>
            <div className="flex gap-2 mt-2">
              <Input
                value={newFreeNow}
                onChange={(e) => setNewFreeNow(e.target.value)}
                placeholder="Wprowadź ID"
              />
              <Button onClick={() => addId('freeNow', newFreeNow)}>Dodaj</Button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {freeNow.map(id => (
                <Badge key={id} className="bg-red-500 text-white">
                  {id}
                  <X
                    size={14}
                    className="ml-2 cursor-pointer"
                    onClick={() => removeId('freeNow', id)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Anuluj</Button>
            <Button onClick={handleSave}>Zapisz</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

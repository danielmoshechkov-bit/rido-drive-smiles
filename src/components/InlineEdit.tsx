import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, Edit3 } from 'lucide-react';
import { toast } from 'sonner';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  truncateLength?: number;
}

export const InlineEdit = ({ 
  value, 
  onSave, 
  placeholder = '', 
  maxLength,
  className = '',
  truncateLength 
}: InlineEditProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setLoading(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
      toast.success('Zapisano zmiany');
    } catch (error) {
      toast.error('Błąd podczas zapisywania');
      setEditValue(value); // Reset to original value
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = truncateLength && value.length > truncateLength 
    ? `${value.substring(0, truncateLength)}...` 
    : value;

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          className="h-8 text-sm"
          autoFocus
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCancel}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div 
      className={`group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1 ${className}`}
      onClick={() => setIsEditing(true)}
    >
      <span className="flex-1 text-sm">
        {displayValue || placeholder}
      </span>
      <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
    </div>
  );
};
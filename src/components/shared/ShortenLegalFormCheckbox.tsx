import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface ShortenLegalFormCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Checkbox „Skróć formę prawną (sp. z o.o.)" — spinany ze stanem `shorten`/`setShorten`
 * z useGusLookup. Renderuj pod polem NIP w każdym formularzu z lupką GUS.
 */
export function ShortenLegalFormCheckbox({
  checked,
  onCheckedChange,
  disabled,
  className,
}: ShortenLegalFormCheckboxProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit',
        className,
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      Skróć formę prawną (sp. z o.o.)
    </label>
  );
}

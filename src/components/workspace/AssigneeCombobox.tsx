import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronsUpDown, UserPlus } from "lucide-react";

interface Props {
  members: any[];                 // pełna lista członków projektu
  onPick: (member: any) => void;  // wybrano członka
  onAddPerson?: () => void;       // „+ Dodaj osobę" (otwiera okno zaproszenia)
  placeholder?: string;           // tekst na pustym triggerze
  triggerLabel?: string | null;   // bieżąco wybrane (tryb pojedynczy)
  excludeUserIds?: string[];      // ukryj już dodanych (tryb multi)
}

const memberName = (m: any) =>
  (m?.first_name || m?.last_name) ? `${m.first_name || ''} ${m.last_name || ''}`.trim()
  : (m?.display_name || m?.email || 'Użytkownik');

/**
 * Wyszukiwalny picker osób: pokazuje Imię Nazwisko + email (mała czcionka),
 * filtruje po imieniu/mailu/telefonie, oraz „+ Dodaj osobę" (= zaproszenie).
 * Listuje tylko aktywnych członków z user_id. Reużywany w tworzeniu i w
 * szczegółach zadania.
 */
export function AssigneeCombobox({ members, onPick, onAddPerson, placeholder = "Wybierz osobę", triggerLabel, excludeUserIds = [] }: Props) {
  const [open, setOpen] = useState(false);

  const list = members.filter(
    (m) => m.status === 'active' && m.user_id && !excludeUserIds.includes(m.user_id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className={triggerLabel ? "" : "text-muted-foreground"}>{triggerLabel || placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Szukaj: imię, e-mail, telefon..." />
          <CommandList>
            <CommandEmpty>Brak wyników.</CommandEmpty>
            <CommandGroup>
              {list.map((m) => {
                const name = memberName(m);
                return (
                  <CommandItem
                    key={m.id}
                    // value = pełny tekst do wyszukiwania (imię + mail + telefon)
                    value={`${name} ${m.email || ''} ${m.phone || ''}`}
                    onSelect={() => { onPick(m); setOpen(false); }}
                    className="flex items-center gap-2"
                  >
                    <Avatar className="h-6 w-6"><AvatarFallback className="text-[9px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{name}</span>
                      {m.email && !String(m.email).includes('@phone.') && (
                        <span className="text-[11px] text-muted-foreground truncate">{m.email}</span>
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {onAddPerson && (
              <CommandGroup>
                <CommandItem value="__add_person__" onSelect={() => { onAddPerson(); setOpen(false); }} className="text-primary">
                  <UserPlus className="h-4 w-4 mr-2" /> Dodaj osobę (zaproś)
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

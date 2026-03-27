import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "@/hooks/useWorkspaceChat";
import { Search, Hash, MessageSquare, Clock } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<void>;
  results: ChatMessage[];
  onSelectResult: (msg: ChatMessage) => void;
}

export function ChatSearchModal({ open, onClose, onSearch, results, onSelectResult }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSearch = useCallback(() => {
    if (query.trim()) onSearch(query.trim());
  }, [query, onSearch]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <div className="flex items-center gap-2 p-4 border-b">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Szukaj wiadomości, osób, zadań..."
            className="border-0 shadow-none focus-visible:ring-0 h-auto p-0 text-base"
          />
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim() === "" ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>Wpisz frazę aby wyszukać</p>
              <p className="text-xs mt-1">Ctrl+K aby otworzyć wyszukiwarkę</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              <p>Brak wyników dla "{query}"</p>
            </div>
          ) : (
            results.map(msg => (
              <button
                key={msg.id}
                className="w-full text-left p-3 rounded-lg hover:bg-accent/50 transition-colors"
                onClick={() => { onSelectResult(msg); onClose(); }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{msg.channel_name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(msg.created_at).toLocaleDateString('pl-PL')}
                  </span>
                </div>
                <p className="text-sm truncate">{msg.content}</p>
                <p className="text-xs text-muted-foreground">{msg.user_name || 'Użytkownik'}</p>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

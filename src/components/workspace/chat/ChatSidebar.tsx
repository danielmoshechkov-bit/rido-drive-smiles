import { useState } from "react";
import { ChatChannel } from "@/hooks/useWorkspaceChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Hash, Plus, Lock, MessageCircle, Users, Search, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  channels: ChatChannel[];
  activeChannel: ChatChannel | null;
  members: any[];
  userId: string | null;
  onSelectChannel: (ch: ChatChannel) => void;
  onCreateChannel: (name: string, type: string, desc?: string) => Promise<any>;
  onCreateDM: (userId: string, name: string) => Promise<any>;
  onSearch: () => void;
}

export function ChatSidebar({ channels, activeChannel, members, userId, onSelectChannel, onCreateChannel, onCreateDM, onSearch }: Props) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"public" | "private">("public");
  const [expandedSections, setExpandedSections] = useState({ channels: true, dms: true, groups: true });

  const publicChannels = channels.filter(c => c.type === 'public');
  const privateChannels = channels.filter(c => c.type === 'private');
  const dmChannels = channels.filter(c => c.type === 'dm');
  const groupChannels = channels.filter(c => c.type === 'group');

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ch = await onCreateChannel(newName.trim(), newType, newDesc.trim());
    if (ch) {
      onSelectChannel(ch);
      setShowCreateChannel(false);
      setNewName("");
      setNewDesc("");
    }
  };

  const getMemberName = (member: any) => {
    if (member.first_name) return `${member.first_name} ${member.last_name || ''}`.trim();
    return member.display_name || member.email || 'Użytkownik';
  };

  return (
    <div className="w-60 shrink-0 flex flex-col bg-card border-r h-full overflow-hidden">
      {/* Search */}
      <div className="p-3 border-b">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-xs text-muted-foreground h-8"
          onClick={onSearch}
        >
          <Search className="h-3.5 w-3.5" />
          Szukaj wiadomości...
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Channels Section */}
        <SectionHeader
          title="KANAŁY"
          expanded={expandedSections.channels}
          onToggle={() => toggleSection('channels')}
          onAdd={() => setShowCreateChannel(true)}
        />
        {expandedSections.channels && (
          <div className="space-y-0.5">
            {[...publicChannels, ...privateChannels].map(ch => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={activeChannel?.id === ch.id}
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </div>
        )}

        {/* DMs Section */}
        <SectionHeader
          title="WIADOMOŚCI BEZPOŚREDNIE"
          expanded={expandedSections.dms}
          onToggle={() => toggleSection('dms')}
        />
        {expandedSections.dms && (
          <div className="space-y-0.5">
            {dmChannels.map(ch => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={activeChannel?.id === ch.id}
                onClick={() => onSelectChannel(ch)}
                isDM
              />
            ))}
            {/* Member list for starting DMs */}
            {members.filter(m => m.user_id && m.user_id !== userId).map(m => {
              const hasDM = dmChannels.some(c => c.description?.includes(getMemberName(m)));
              if (hasDM) return null;
              return (
                <button
                  key={m.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
                  onClick={() => onCreateDM(m.user_id, getMemberName(m))}
                >
                  <div className="relative">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                      {getMemberName(m)[0]?.toUpperCase()}
                    </div>
                    {m.is_online && (
                      <Circle className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 fill-green-500 text-green-500" />
                    )}
                  </div>
                  <span className="truncate">{getMemberName(m)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Groups Section */}
        {groupChannels.length > 0 && (
          <>
            <SectionHeader
              title="GRUPY"
              expanded={expandedSections.groups}
              onToggle={() => toggleSection('groups')}
            />
            {expandedSections.groups && (
              <div className="space-y-0.5">
                {groupChannels.map(ch => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    isActive={activeChannel?.id === ch.id}
                    onClick={() => onSelectChannel(ch)}
                    isGroup
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Channel Dialog */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nowy kanał</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={newType === 'public' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewType('public')}
                className="gap-1.5"
              >
                <Hash className="h-3.5 w-3.5" /> Publiczny
              </Button>
              <Button
                variant={newType === 'private' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewType('private')}
                className="gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" /> Prywatny
              </Button>
            </div>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="np. sprzedaz, marketing..."
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Opis kanału (opcjonalnie)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChannel(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Utwórz kanał</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader({ title, expanded, onToggle, onAdd }: { title: string; expanded: boolean; onToggle: () => void; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 mt-2 first:mt-0">
      <button className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider" onClick={onToggle}>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {onAdd && (
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onAdd}>
          <Plus className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function ChannelItem({ channel, isActive, onClick, isDM, isGroup }: { channel: ChatChannel; isActive: boolean; onClick: () => void; isDM?: boolean; isGroup?: boolean }) {
  const Icon = isDM ? MessageCircle : isGroup ? Users : channel.type === 'private' ? Lock : Hash;
  const displayName = isDM ? (channel.description?.replace('DM z ', '') || channel.name) : channel.name;
  
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
        isActive
          ? "bg-[hsl(var(--nav-bar-color))] text-white font-medium"
          : "text-foreground/80 hover:bg-accent/50"
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="truncate">{displayName}</span>
      {(channel.unread_count ?? 0) > 0 && (
        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {channel.unread_count}
        </span>
      )}
    </button>
  );
}

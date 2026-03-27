import { useState } from "react";
import { ChatChannel, UserStatus } from "@/hooks/useWorkspaceChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hash, Plus, Lock, MessageCircle, Users, Search, ChevronDown, ChevronRight, SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "available", label: "🟢 Dostępny", color: "bg-green-500" },
  { value: "away", label: "🟡 Zaraz wracam", color: "bg-yellow-500" },
  { value: "dnd", label: "🔴 Nie przeszkadzać", color: "bg-red-500" },
  { value: "offline", label: "🌙 Poza biurem", color: "bg-gray-400" },
];

interface Props {
  channels: ChatChannel[];
  activeChannel: ChatChannel | null;
  members: any[];
  memberStatuses: Record<string, UserStatus>;
  userId: string | null;
  projectName?: string;
  projectColor?: string;
  onSelectChannel: (ch: ChatChannel) => void;
  onCreateChannel: (name: string, type: string, desc?: string, participantIds?: string[]) => Promise<any>;
  onCreateDM: (userId: string, name: string) => Promise<any>;
  onSearch: () => void;
  onStatusChange: (status: string, text?: string) => Promise<void>;
}

export function ChatSidebar({
  channels, activeChannel, members, memberStatuses, userId,
  projectName, projectColor,
  onSelectChannel, onCreateChannel, onCreateDM, onSearch, onStatusChange
}: Props) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"public" | "private">("public");
  const [groupName, setGroupName] = useState("");
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [statusText, setStatusText] = useState("");
  const [expanded, setExpanded] = useState({ channels: true, dms: true, groups: true });

  const publicChannels = channels.filter(c => c.type === 'public');
  const privateChannels = channels.filter(c => c.type === 'private');
  const dmChannels = channels.filter(c => c.type === 'dm');
  const groupChannels = channels.filter(c => c.type === 'group');

  const toggleSection = (key: keyof typeof expanded) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const getMemberName = (m: any) => {
    if (m.first_name) return `${m.first_name} ${m.last_name || ''}`.trim();
    return m.display_name || m.email || 'Użytkownik';
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ch = await onCreateChannel(newName.trim(), newType, newDesc.trim());
    if (ch) { onSelectChannel(ch); setShowCreateChannel(false); setNewName(""); setNewDesc(""); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedGroupMembers.length === 0) return;
    const ch = await onCreateChannel(groupName.trim(), 'group', groupName.trim(), selectedGroupMembers);
    if (ch) { onSelectChannel(ch); setShowCreateGroup(false); setGroupName(""); setSelectedGroupMembers([]); }
  };

  const myStatus = userId ? memberStatuses[userId] : null;
  const myStatusColor = STATUS_OPTIONS.find(s => s.value === myStatus?.status)?.color || "bg-green-500";

  const getStatusColor = (uid: string) => {
    const s = memberStatuses[uid];
    if (!s) return "bg-gray-400";
    return STATUS_OPTIONS.find(o => o.value === s.status)?.color || "bg-gray-400";
  };

  return (
    <div className="w-[260px] shrink-0 flex flex-col bg-slate-900 dark:bg-slate-950 h-full overflow-hidden text-white">
      {/* Project header + Status */}
      <div className="p-3 border-b border-white/10 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg"
            style={{ backgroundColor: projectColor || 'hsl(var(--primary))' }}>
            {projectName?.[0]?.toUpperCase() || 'P'}
          </div>
          <span className="font-bold text-sm truncate text-white">{projectName || 'Projekt'}</span>
        </div>

        {/* My status */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-xs text-white/70">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white/20", myStatusColor)} />
              <span className="truncate">{myStatus?.status_text || STATUS_OPTIONS.find(s => s.value === myStatus?.status)?.label || '🟢 Dostępny'}</span>
              <SmilePlus className="h-3 w-3 ml-auto opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 space-y-3" align="start">
            <p className="text-xs font-semibold">Zmień status</p>
            <Select defaultValue={myStatus?.status || "available"} onValueChange={v => onStatusChange(v, statusText)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={statusText}
              onChange={e => setStatusText(e.target.value)}
              placeholder="Na spotkaniu do 15:00..."
              className="h-7 text-xs"
              onKeyDown={e => { if (e.key === 'Enter') onStatusChange(myStatus?.status || 'available', statusText); }}
            />
            <Button size="sm" className="w-full h-7 text-xs" onClick={() => onStatusChange(myStatus?.status || 'available', statusText)}>
              Zapisz
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <button
          className="w-full flex items-center gap-2 text-xs text-white/50 h-8 px-3 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          onClick={onSearch}
        >
          <Search className="h-3.5 w-3.5" />
          Szukaj... <kbd className="ml-auto text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 scrollbar-hide">
        {/* Channels */}
        <SectionHeader title="KANAŁY" expanded={expanded.channels} onToggle={() => toggleSection('channels')} onAdd={() => setShowCreateChannel(true)} />
        {expanded.channels && (
          <div className="space-y-0.5">
            {[...publicChannels, ...privateChannels].map(ch => (
              <ChannelItem key={ch.id} channel={ch} isActive={activeChannel?.id === ch.id} onClick={() => onSelectChannel(ch)} />
            ))}
          </div>
        )}

        {/* DMs */}
        <SectionHeader title="WIADOMOŚCI" expanded={expanded.dms} onToggle={() => toggleSection('dms')} />
        {expanded.dms && (
          <div className="space-y-0.5">
            {dmChannels.map(ch => (
              <ChannelItem key={ch.id} channel={ch} isActive={activeChannel?.id === ch.id} onClick={() => onSelectChannel(ch)} isDM />
            ))}
            {members.filter(m => m.user_id && m.user_id !== userId).map(m => {
              const hasDM = dmChannels.some(c => c.description?.includes(getMemberName(m)));
              if (hasDM) return null;
              return (
                <button key={m.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-white/50 hover:bg-white/10 transition-colors"
                  onClick={() => onCreateDM(m.user_id, getMemberName(m))}
                >
                  <div className="relative">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-medium text-white/70">
                      {getMemberName(m)[0]?.toUpperCase()}
                    </div>
                    <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-900", getStatusColor(m.user_id))} />
                  </div>
                  <span className="truncate">{getMemberName(m)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Groups */}
        <SectionHeader title="GRUPY" expanded={expanded.groups} onToggle={() => toggleSection('groups')} onAdd={() => setShowCreateGroup(true)} />
        {expanded.groups && (
          <div className="space-y-0.5">
            {groupChannels.map(ch => (
              <ChannelItem key={ch.id} channel={ch} isActive={activeChannel?.id === ch.id} onClick={() => onSelectChannel(ch)} isGroup />
            ))}
            {groupChannels.length === 0 && (
              <p className="text-[10px] text-white/30 px-2 py-1">Kliknij + aby utworzyć grupę</p>
            )}
          </div>
        )}
      </div>

      {/* Create Channel */}
      <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nowy kanał</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={newType === 'public' ? 'default' : 'outline'} size="sm" onClick={() => setNewType('public')} className="gap-1.5">
                <Hash className="h-3.5 w-3.5" /> Publiczny
              </Button>
              <Button variant={newType === 'private' ? 'default' : 'outline'} size="sm" onClick={() => setNewType('private')} className="gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Prywatny
              </Button>
            </div>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="np. sprzedaz, marketing..." onKeyDown={e => e.key === 'Enter' && handleCreate()} />
            <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Opis kanału (opcjonalnie)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateChannel(false)}>Anuluj</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Utwórz kanał</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nowa grupa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nazwa grupy np. Zarząd" />
            <div className="space-y-2">
              <p className="text-xs font-medium">Wybierz członków:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {members.filter(m => m.user_id && m.user_id !== userId).map(m => (
                  <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedGroupMembers.includes(m.user_id)}
                      onChange={e => {
                        setSelectedGroupMembers(prev => e.target.checked ? [...prev, m.user_id] : prev.filter(id => id !== m.user_id));
                      }}
                      className="rounded"
                    />
                    {getMemberName(m)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Anuluj</Button>
            <Button onClick={handleCreateGroup} disabled={!groupName.trim() || selectedGroupMembers.length === 0}>Utwórz grupę</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader({ title, expanded, onToggle, onAdd }: { title: string; expanded: boolean; onToggle: () => void; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 mt-3 first:mt-0">
      <button className="flex items-center gap-1 text-[11px] font-bold text-white/40 uppercase tracking-wider hover:text-white/60 transition-colors" onClick={onToggle}>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {onAdd && (
        <Button variant="ghost" size="icon" className="h-5 w-5 text-white/40 hover:text-white hover:bg-white/10" onClick={onAdd}><Plus className="h-3 w-3" /></Button>
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
        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all",
        isActive
          ? "bg-primary text-white font-semibold shadow-md"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
      onClick={onClick}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "opacity-100" : "opacity-50")} />
      <span className="truncate">{displayName}</span>
      {(channel.unread_count ?? 0) > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center shadow-sm">
          {channel.unread_count}
        </span>
      )}
    </button>
  );
}

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Bot, Headphones, Calendar, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface AgentType {
  id: string;
  type_key: string;
  name_pl: string;
  description: string;
  is_active: boolean;
}

interface AgentTypeSelectorProps {
  selectedType: string | null;
  onSelectType: (typeKey: string) => void;
}

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sales: Bot,
  reception: Headphones,
  confirmation: Calendar,
  support: HelpCircle,
};

export function AgentTypeSelector({ selectedType, onSelectType }: AgentTypeSelectorProps) {
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgentTypes();
  }, []);

  const loadAgentTypes = async () => {
    const { data } = await supabase
      .from('ai_agent_types')
      .select('*')
      .eq('is_active', true)
      .order('type_key');

    if (data) {
      setAgentTypes(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="h-32" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Wybierz typ agenta</h3>
        <p className="text-sm text-muted-foreground">
          Każdy typ agenta ma inne umiejętności i zastosowanie
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {agentTypes.map((agent) => {
          const Icon = AGENT_ICONS[agent.type_key] || Bot;
          const isSelected = selectedType === agent.type_key;

          return (
            <Card
              key={agent.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected && "ring-2 ring-primary border-primary"
              )}
              onClick={() => onSelectType(agent.type_key)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={cn(
                    "p-3 rounded-lg",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {isSelected && (
                    <Badge variant="default" className="gap-1">
                      <Check className="h-3 w-3" />
                      Wybrany
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base mt-2">{agent.name_pl}</CardTitle>
                <CardDescription>{agent.description}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

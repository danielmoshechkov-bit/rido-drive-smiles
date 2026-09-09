import { useState } from 'react';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { AISalesOverview } from './AISalesOverview';
import { AISalesLeadsList } from './AISalesLeadsList';
import { AISalesConversationsList } from './AISalesConversationsList';
import { MyAgentPanel } from './MyAgentPanel';
import { AISalesAgentWizard } from './AISalesAgentWizard';
import { VoiceAgentPanel } from './VoiceAgentPanel';

export function AISalesAgentsDashboard({ providerId = null }: { providerId?: string | null }) {
  const [activeTab, setActiveTab] = useState('voice');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);

  // Asystent głosowy PIERWSZY — to jest rzecz, po którą warsztat tu wchodzi.
  // Dashboard i Leady dotyczą agenta sprzedażowego, czyli innego produktu.
  const tabs = [
    { value: 'voice', label: 'Asystent głosowy', visible: true },
    { value: 'overview', label: 'Dashboard', visible: true },
    { value: 'leads', label: 'Leady', visible: true },
    { value: 'conversations', label: 'Konwersacje', visible: true },
    // „Mój Agent" UKRYTY. Sprawdzone: pisze do `ai_agent_configs`
    // i `ai_call_business_profiles`, które czyta wyłącznie agent SPRZEDAŻOWY
    // (ai-generate-call-scripts, ai-call-worker). Asystent telefoniczny NIE
    // CZYTA z tych tabel ani jednego pola — wypełnienie tej zakładki nie
    // poprawia rozmów ani o jotę. Warsztat wypełniałby drugą ankietę o tej
    // samej firmie po to, żeby nic z niej nie wynikało.
    { value: 'my-agent', label: 'Mój Agent', visible: false },
  ];

  if (wizardOpen) {
    return (
      <AISalesAgentWizard
        agentId={editAgentId}
        onClose={() => { setWizardOpen(false); setEditAgentId(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <UniversalSubTabBar activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {activeTab === 'overview' && (
        <AISalesOverview
          onCreateAgent={() => { setEditAgentId(null); setWizardOpen(true); }}
          onEditAgent={(id) => { setEditAgentId(id); setWizardOpen(true); }}
        />
      )}
      {activeTab === 'leads' && <AISalesLeadsList />}
      {activeTab === 'conversations' && <AISalesConversationsList />}
      {activeTab === 'my-agent' && <MyAgentPanel />}
      {activeTab === 'voice' && <VoiceAgentPanel providerId={providerId} />}
    </div>
  );
}

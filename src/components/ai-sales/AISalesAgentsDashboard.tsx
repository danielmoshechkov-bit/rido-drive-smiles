import { useState } from 'react';
import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { AISalesOverview } from './AISalesOverview';
import { AISalesLeadsList } from './AISalesLeadsList';
import { AISalesConversationsList } from './AISalesConversationsList';
import { AISalesKnowledgeBase } from './AISalesKnowledgeBase';
import { AISalesAgentWizard } from './AISalesAgentWizard';

export function AISalesAgentsDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editAgentId, setEditAgentId] = useState<string | null>(null);

  const tabs = [
    { value: 'overview', label: 'Dashboard', visible: true },
    { value: 'leads', label: 'Leady', visible: true },
    { value: 'conversations', label: 'Konwersacje', visible: true },
    { value: 'knowledge', label: 'Wiedza AI', visible: true },
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
      {activeTab === 'knowledge' && <AISalesKnowledgeBase />}
    </div>
  );
}

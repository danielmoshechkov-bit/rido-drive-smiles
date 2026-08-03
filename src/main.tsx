import './i18n'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById("root")!);
const renderApp = () => {
  import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
};

if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const previewTab = params.get("tab");
  const isAdminVoicePreview = window.location.pathname === "/admin/ai"
    && params.get("voicePreview") === "1"
    && (previewTab === "voice-agent" || previewTab === "mapping");
  if (window.location.pathname === "/dev/voice-ai-routing-preview" || isAdminVoicePreview) {
    import("./pages/VoiceAiRoutingLocalPreview.tsx").then(({ default: VoiceAiRoutingLocalPreview }) => {
      root.render(<VoiceAiRoutingLocalPreview />);
    });
  } else {
    renderApp();
  }
} else {
  renderApp();
}

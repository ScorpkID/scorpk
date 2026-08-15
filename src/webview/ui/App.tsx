import { useEffect, useState } from 'react';
import { AgentDefinition, AuthUser, ProviderConfig } from '../../shared/protocol';
import { postToExtension, onExtensionMessage } from './vscodeApi';
import { ProviderManager } from './components/ProviderManager';
import { ChatView } from './components/ChatView';
import { TeamManager } from './components/TeamManager';
import { TeamChatView } from './components/TeamChatView';
import { Sidebar, ViewId } from './components/Sidebar';
import { SettingsView } from './components/SettingsView';
import { HelpView } from './components/HelpView';
import { AccountView } from './components/AccountView';
import { AuthGateView } from './components/AuthGateView';
import { KeepAlive } from './components/KeepAlive';
import { LOGO_URI } from './logo';

export function App() {
  const [view, setView] = useState<ViewId>('agent');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'providers') {
        setProviders(message.providers);
      } else if (message.type === 'agents') {
        setAgents(message.agents);
      } else if (message.type === 'authState') {
        setUser(message.user);
        setAuthChecked(true);
      }
    });
    postToExtension({ type: 'ready' });
    postToExtension({ type: 'listProviders' });
    postToExtension({ type: 'listAgents' });
    // Red de seguridad: si por algún motivo nunca llega authState (Supabase
    // caído, sin red), no dejamos la pantalla de carga trabada para siempre.
    const fallback = setTimeout(() => setAuthChecked(true), 10000);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, []);

  if (!authChecked) {
    return (
      <div className="auth-loading">
        <span className="app-logo auth-gate-logo">
          <img src={LOGO_URI} alt="" />
        </span>
      </div>
    );
  }

  if (!user) {
    return <AuthGateView />;
  }

  return (
    <div className="app-shell">
      <Sidebar active={view} onSelect={setView} logoUri={LOGO_URI} user={user} />
      <main className="app-content">
        <KeepAlive active={view === 'agent'}>
          <ChatView providers={providers} onGoToProviders={() => setView('providers')} username={user.name} />
        </KeepAlive>
        <KeepAlive active={view === 'team'}>
          <TeamTab agents={agents} providers={providers} />
        </KeepAlive>
        <KeepAlive active={view === 'providers'}>
          <ProviderManager providers={providers} />
        </KeepAlive>
        <KeepAlive active={view === 'settings'}>
          <SettingsView onGoToProviders={() => setView('providers')} onGoToTeam={() => setView('team')} />
        </KeepAlive>
        <KeepAlive active={view === 'help'}>
          <HelpView />
        </KeepAlive>
        <KeepAlive active={view === 'account'}>
          <AccountView user={user} />
        </KeepAlive>
      </main>
    </div>
  );
}

function TeamTab({ agents, providers }: { agents: AgentDefinition[]; providers: ProviderConfig[] }) {
  const [section, setSection] = useState<'chat' | 'config'>('chat');
  return (
    <div className="team-tab">
      <div className="view-header view-header-tabbed">
        <div>
          <h1 className="view-title">Equipo</h1>
          <p className="view-subtitle">Colabora con tu equipo</p>
        </div>
      </div>
      <div className="sub-tabs">
        <button className={section === 'chat' ? 'sub-tab active' : 'sub-tab'} onClick={() => setSection('chat')}>
          Chat de equipo
        </button>
        <button className={section === 'config' ? 'sub-tab active' : 'sub-tab'} onClick={() => setSection('config')}>
          Configurar agentes
        </button>
      </div>
      <KeepAlive active={section === 'chat'}>
        <TeamChatView agents={agents} onGoToTeam={() => setSection('config')} />
      </KeepAlive>
      <KeepAlive active={section === 'config'}>
        <TeamManager agents={agents} providers={providers} />
      </KeepAlive>
    </div>
  );
}

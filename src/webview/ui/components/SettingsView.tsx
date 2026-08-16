import { useEffect, useState } from 'react';
import { ViewHeader } from './ViewHeader';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconSliders, IconUsers } from './Icon';
import { McpManager } from './McpManager';

interface Props {
  onGoToProviders: () => void;
  onGoToTeam: () => void;
}

export function SettingsView({ onGoToProviders, onGoToTeam }: Props) {
  const [liveEditorPreview, setLiveEditorPreview] = useState(true);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'settingsState') {
        setLiveEditorPreview(message.liveEditorPreview);
      }
    });
    return unsubscribe;
  }, []);

  function toggleLiveEditorPreview() {
    const next = !liveEditorPreview;
    setLiveEditorPreview(next);
    postToExtension({ type: 'setLiveEditorPreview', enabled: next });
  }

  return (
    <div className="static-view">
      <ViewHeader title="Ajustes" subtitle="Preferencias generales de Scorpk" />
      <div className="static-view-body">
        <section className="settings-section">
          <div className="section-heading">Configuración</div>
          <p className="muted">
            Los proveedores de IA y los agentes del equipo se administran en sus propias secciones.
          </p>
          <div className="settings-links">
            <button className="btn-ghost" onClick={onGoToProviders}>
              <IconSliders size={14} />
              Ir a Proveedores
            </button>
            <button className="btn-ghost" onClick={onGoToTeam}>
              <IconUsers size={14} />
              Ir a Configurar agentes
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="section-heading">Editor</div>
          <p className="muted">
            Cuando Scorpk crea o edita un archivo, abrirlo solo al lado del chat y resaltar en verde lo que cambió
            por unos segundos.
          </p>
          <label className="settings-toggle">
            <input type="checkbox" checked={liveEditorPreview} onChange={toggleLiveEditorPreview} />
            Mostrar cambios en vivo en el editor
          </label>
        </section>

        <section className="settings-section">
          <div className="section-heading">Conversación</div>
          <p className="muted">Empezar una conversación nueva en el Agente, descartando el chat actual de la vista.</p>
          <button className="btn-ghost" onClick={() => postToExtension({ type: 'newConversation' })}>
            Nueva conversación de Agente
          </button>
        </section>

        <section className="settings-section">
          <div className="section-heading">Servidores MCP</div>
          <p className="muted">
            Conectá servidores MCP (Model Context Protocol) locales — sus herramientas se suman automáticamente a las
            del agente.
          </p>
          <McpManager />
        </section>

        <section className="settings-section">
          <div className="section-heading">Acerca de</div>
          <p className="muted">Scorpk v0.0.1 — centro de control de agentes de IA para programación.</p>
        </section>
      </div>
    </div>
  );
}

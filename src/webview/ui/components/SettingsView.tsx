import { ViewHeader } from './ViewHeader';
import { postToExtension } from '../vscodeApi';
import { IconSliders, IconUsers } from './Icon';

interface Props {
  onGoToProviders: () => void;
  onGoToTeam: () => void;
}

export function SettingsView({ onGoToProviders, onGoToTeam }: Props) {
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
          <div className="section-heading">Conversación</div>
          <p className="muted">Empezar una conversación nueva en el Agente, descartando el chat actual de la vista.</p>
          <button className="btn-ghost" onClick={() => postToExtension({ type: 'newConversation' })}>
            Nueva conversación de Agente
          </button>
        </section>

        <section className="settings-section">
          <div className="section-heading">Acerca de</div>
          <p className="muted">Scorpk v0.0.1 — centro de control de agentes de IA para programación.</p>
        </section>
      </div>
    </div>
  );
}

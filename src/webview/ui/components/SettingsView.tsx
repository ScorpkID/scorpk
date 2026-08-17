import { useEffect, useState } from 'react';
import { ViewHeader } from './ViewHeader';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { IconSliders, IconUsers } from './Icon';
import { McpManager } from './McpManager';
import { PromptTemplateManager } from './PromptTemplateManager';
import { SkillManager } from './SkillManager';
import { UsageTotals } from '../../../shared/protocol';

interface Props {
  onGoToProviders: () => void;
  onGoToTeam: () => void;
  plan: 'free' | 'pro';
}

type UsageByProvider = Record<string, UsageTotals & { providerName: string }>;

export function SettingsView({ onGoToProviders, onGoToTeam, plan }: Props) {
  const [liveEditorPreview, setLiveEditorPreview] = useState(true);
  const [usage, setUsage] = useState<UsageByProvider>({});

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'settingsState') {
        setLiveEditorPreview(message.liveEditorPreview);
      } else if (message.type === 'usageState') {
        setUsage(message.totals);
      }
    });
    postToExtension({ type: 'listUsage' });
    return unsubscribe;
  }, []);

  function resetUsage(providerId: string) {
    postToExtension({ type: 'resetUsage', providerId });
  }

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
          <div className="section-heading">Comandos rápidos</div>
          <p className="muted">
            Atajos como <code>/test</code> o <code>/explicar</code> que expanden a una instrucción fija en el
            composer, para no escribir el mismo pedido largo cada vez.
          </p>
          <PromptTemplateManager />
        </section>

        <section className="settings-section">
          <div className="section-heading">Skills</div>
          <p className="muted">
            A diferencia de los comandos rápidos, una skill la dispara el propio agente cuando decide que tu pedido
            calza con su descripción — no hace falta invocarla vos. Se editan como archivo (SKILL.md), igual que
            SCORPK.md.
          </p>
          <SkillManager />
        </section>

        <section className="settings-section">
          <div className="section-heading">
            Servidores MCP {plan !== 'pro' && <span className="plan-badge plan-badge-pro">Pro</span>}
          </div>
          <p className="muted">
            Conectá servidores MCP (Model Context Protocol) locales — sus herramientas se suman automáticamente a las
            del agente. {plan !== 'pro' && 'Configuralos ya, pero solo se usan en una corrida con el plan Pro.'}
          </p>
          <McpManager />
        </section>

        <section className="settings-section">
          <div className="section-heading">Uso</div>
          <p className="muted">
            Tokens acumulados por proveedor desde que se instaló Scorpk. El costo es un estimado aproximado según
            precios de referencia — no está disponible para todos los modelos/proveedores.
          </p>
          {Object.keys(usage).length === 0 ? (
            <p className="muted">Todavía no hay uso registrado.</p>
          ) : (
            <div className="usage-list">
              {Object.entries(usage).map(([providerId, u]) => (
                <div key={providerId} className="usage-row">
                  <span className="usage-row-name">{u.providerName}</span>
                  <span className="usage-row-tokens">
                    {formatTokens(u.inputTokens)} in · {formatTokens(u.outputTokens)} out
                  </span>
                  <span className="usage-row-cost">{u.costUsd !== undefined ? formatCost(u.costUsd) : '—'}</span>
                  <button className="btn-ghost usage-row-reset" onClick={() => resetUsage(providerId)}>
                    Reiniciar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settings-section">
          <div className="section-heading">Acerca de</div>
          <p className="muted">Scorpk v0.0.1 — centro de control de agentes de IA para programación.</p>
        </section>
      </div>
    </div>
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

import { ViewHeader } from './ViewHeader';

export function HelpView() {
  return (
    <div className="static-view">
      <ViewHeader title="Ayuda" subtitle="Cómo sacarle provecho a Scorpk" />
      <div className="static-view-body">
        <section className="settings-section">
          <div className="section-heading">Agente</div>
          <p className="muted">
            Chateá directamente con un proveedor/modelo. Scorpk puede leer, escribir y borrar archivos, correr
            comandos de terminal y consultar git — siempre relativo a la carpeta abierta en el workspace.
          </p>
        </section>

        <section className="settings-section">
          <div className="section-heading">Equipo</div>
          <p className="muted">
            Activá los roles que necesites (Planner, Coder, Reviewer, Tester...), asignales proveedor y modelo, y
            mandale una tarea a todo el equipo para que la resuelvan en cadena — o hablale directo a un agente
            puntual.
          </p>
        </section>

        <section className="settings-section">
          <div className="section-heading">Modos de permiso</div>
          <ul className="help-list">
            <li>
              <strong>Manual</strong> — pide aprobación antes de cada acción que modifique el workspace.
            </li>
            <li>
              <strong>Auto-editar</strong> — aprueba lectura/escritura de archivos sola; la terminal sigue pidiendo
              confirmación.
            </li>
            <li>
              <strong>Plan</strong> — solo investiga y devuelve un plan, no ejecuta cambios.
            </li>
            <li>
              <strong>Auto</strong> — aprueba todo automáticamente, sin preguntar.
            </li>
          </ul>
        </section>

        <section className="settings-section">
          <div className="section-heading">Instrucciones del proyecto</div>
          <p className="muted">
            Creá un archivo <code>SCORPK.md</code> en la raíz de tu proyecto con convenciones de código, cosas que no
            tocar, cómo correr los tests, etc. — Scorpk lo lee solo y se lo suma automáticamente a todos los agentes,
            sin que tengas que repetirlo en cada chat.
          </p>
        </section>

        <section className="settings-section">
          <div className="section-heading">Proveedores</div>
          <p className="muted">
            Elegí un proveedor predefinido y pegá tu API key, o usá OmniRoute como puerta única a todos los
            proveedores que ya tengas configurados ahí. Las API keys se guardan cifradas, nunca en texto plano.
          </p>
        </section>
      </div>
    </div>
  );
}

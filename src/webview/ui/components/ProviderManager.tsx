import { FormEvent, useEffect, useState } from 'react';
import { ModelsSource, ProviderConfig, ProviderKind } from '../../../shared/protocol';
import { PROVIDER_PRESETS } from '../../../providers/providerPresets';
import { postToExtension } from '../vscodeApi';
import { ModelPicker } from './ModelPicker';
import { IconCheck, IconEdit, IconTrash } from './Icon';
import { ViewHeader } from './ViewHeader';

interface Props {
  providers: ProviderConfig[];
}

interface FormState {
  id?: string;
  presetId: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
}

const DEFAULT_PRESET = PROVIDER_PRESETS[0];

const EMPTY_FORM: FormState = {
  presetId: DEFAULT_PRESET.id,
  name: DEFAULT_PRESET.label,
  kind: DEFAULT_PRESET.kind,
  baseUrl: DEFAULT_PRESET.baseUrl ?? '',
  defaultModel: '',
  apiKey: '',
};

export function ProviderManager({ providers }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'providerTestResult') {
        setTestResults((prev) => ({ ...prev, [message.id]: { ok: message.ok, message: message.message } }));
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  function selectPreset(presetId: string) {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET;
    setForm({
      ...form,
      presetId: preset.id,
      name: preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl ?? '',
    });
  }

  function edit(p: ProviderConfig) {
    const matchingPreset = PROVIDER_PRESETS.find((preset) => preset.kind === p.kind && preset.baseUrl === p.baseUrl);
    setForm({
      id: p.id,
      presetId: matchingPreset?.id ?? 'custom',
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl ?? '',
      defaultModel: p.defaultModel ?? '',
      apiKey: '',
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const providerFields = {
      name: form.name.trim(),
      kind: form.kind,
      baseUrl: form.kind === 'anthropic' ? undefined : form.baseUrl.trim() || undefined,
      defaultModel: form.defaultModel.trim() || undefined,
    };
    if (form.id) {
      postToExtension({
        type: 'updateProvider',
        provider: { id: form.id, hasApiKey: true, ...providerFields },
        apiKey: form.apiKey.trim() || undefined,
      });
    } else {
      postToExtension({ type: 'addProvider', provider: providerFields, apiKey: form.apiKey.trim() });
    }
    resetForm();
  }

  function remove(id: string) {
    postToExtension({ type: 'removeProvider', id });
  }

  function test(id: string) {
    setTestResults((prev) => ({ ...prev, [id]: { ok: true, message: 'Probando...' } }));
    postToExtension({ type: 'testProvider', id });
  }

  const trimmedKey = form.apiKey.trim();
  const modelsSource: ModelsSource | undefined = trimmedKey
    ? { kind: 'draft', providerKind: form.kind, baseUrl: form.baseUrl.trim() || undefined, apiKey: trimmedKey }
    : form.id
    ? { kind: 'saved', providerId: form.id }
    : undefined;

  return (
    <div className="view provider-manager">
      <ViewHeader title="Proveedores" subtitle="Gestiona tus proveedores de IA" />
      <form className="provider-form" onSubmit={submit}>
        <div className="section-heading">{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</div>
        <label>
          Proveedor
          <select value={form.presetId} onChange={(e) => selectPreset(e.target.value)}>
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mi proveedor" />
        </label>
        {form.kind === 'openai-compatible' && (
          <label>
            Base URL
            <input
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
        )}
        <label>
          API Key {form.id ? '(dejar vacío para no cambiarla)' : ''}
          <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
        </label>
        <label>
          Modelo por defecto (opcional)
          <ModelPicker
            value={form.defaultModel}
            onChange={(v) => setForm({ ...form, defaultModel: v })}
            source={modelsSource}
            placeholder="gpt-4o-mini"
          />
        </label>
        <div className="form-actions">
          <button type="submit">{form.id ? 'Guardar' : 'Agregar'}</button>
          {form.id && (
            <button type="button" className="btn-ghost" onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="provider-list">
        <div className="section-heading">Proveedores configurados</div>
        {providers.length === 0 && <p className="muted">Todavía no agregaste ningún proveedor.</p>}
        {providers.map((p) => (
          <div key={p.id} className="provider-item">
            <div className="provider-item-main">
              <div>
                <div className="provider-item-name">{p.name}</div>
                <div className="provider-item-meta">
                  {p.kind}
                  {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                </div>
              </div>
              {p.hasApiKey ? <span className="badge-active">Activo</span> : <span className="badge-warning">Sin API key</span>}
            </div>
            {testResults[p.id] && (
              <div className={testResults[p.id].ok ? 'test-ok' : 'test-error'}>{testResults[p.id].message}</div>
            )}
            <div className="provider-item-actions">
              <button className="btn-ghost" onClick={() => test(p.id)}>
                <IconCheck size={13} />
                Probar
              </button>
              <button className="btn-ghost" onClick={() => edit(p)}>
                <IconEdit size={13} />
                Editar
              </button>
              <button className="btn-icon" onClick={() => remove(p.id)} title="Eliminar">
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

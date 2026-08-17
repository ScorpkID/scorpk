import { useMemo, useState } from 'react';
import { ModelInfo, ModelsSource } from '../../../shared/protocol';
import { requestModels } from '../vscodeApi';

interface Props {
  value: string;
  onChange: (value: string) => void;
  source: ModelsSource | undefined;
  placeholder?: string;
}

export function ModelPicker({ value, onChange, source, placeholder }: Props) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [freeOnly, setFreeOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (!source) return;
    setLoading(true);
    setError(undefined);
    const result = await requestModels(source);
    setLoading(false);
    setLoaded(true);
    if (result.ok) {
      setModels(result.models);
      if (result.models.length === 0) setError('El proveedor no devolvió modelos.');
    } else {
      setModels([]);
      setError(result.message ?? 'No se pudieron cargar los modelos.');
    }
  }

  const filtered = useMemo(() => (freeOnly ? models.filter((m) => m.free) : models), [models, freeOnly]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const m of filtered) {
      const key = m.provider ?? 'Modelos';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="model-picker">
      <div className="model-picker-row">
        <input
          className="model-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'modelo'}
          list={loaded ? 'model-picker-hint' : undefined}
        />
        <button type="button" onClick={load} disabled={!source || loading}>
          {loading ? 'Cargando...' : loaded ? 'Actualizar modelos' : 'Cargar modelos'}
        </button>
      </div>

      {loading && (
        <div className="model-picker-skeleton">
          <span className="skeleton-bar skeleton-bar-row" />
          <span className="skeleton-bar skeleton-bar-row" />
          <span className="skeleton-bar skeleton-bar-row" style={{ width: '70%' }} />
        </div>
      )}

      {loaded && models.length > 0 && (
        <div className="model-picker-row">
          <label className="model-picker-free">
            <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
            Solo gratis
          </label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          >
            <option value="">
              {filtered.length} modelo{filtered.length === 1 ? '' : 's'} disponible{filtered.length === 1 ? '' : 's'} — elegir...
            </option>
            {grouped.map(([provider, list]) => (
              <optgroup key={provider} label={provider}>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                    {m.free ? ' (gratis)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {error && <div className="test-error">{error}</div>}
    </div>
  );
}

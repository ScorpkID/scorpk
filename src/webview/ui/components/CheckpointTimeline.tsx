import { useEffect, useState } from 'react';
import { CheckpointFileDiff, CheckpointSummary } from '../../../shared/protocol';
import { postToExtension, onExtensionMessage } from '../vscodeApi';
import { relativeDate } from './HistoryPanel';
import { DiffView } from './ToolCallLog';
import { IconFile, IconRefresh, IconTrash } from './Icon';

interface Props {
  conversationId: string | null;
}

export function CheckpointTimeline({ conversationId }: Props) {
  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<CheckpointFileDiff[] | null>(null);

  useEffect(() => {
    const unsubscribe = onExtensionMessage((message) => {
      if (message.type === 'checkpoints' && message.conversationId === conversationId) {
        setCheckpoints(message.checkpoints);
      } else if (message.type === 'checkpointRevertPreview' && message.conversationId === conversationId) {
        setPreviewFiles(message.files);
      }
    });
    if (conversationId) postToExtension({ type: 'listCheckpoints', conversationId });
    return unsubscribe;
  }, [conversationId]);

  function requestPreview(messageId: string) {
    if (!conversationId) return;
    setPreviewFor(messageId);
    setPreviewFiles(null);
    postToExtension({ type: 'previewCheckpointRevert', conversationId, messageId });
  }

  function cancelPreview() {
    setPreviewFor(null);
    setPreviewFiles(null);
  }

  function confirmRevert(messageId: string) {
    if (!conversationId) return;
    postToExtension({ type: 'revertToCheckpoint', conversationId, messageId });
    cancelPreview();
  }

  if (!conversationId) {
    return <p className="muted checkpoint-timeline-empty">Abrí o empezá una conversación para ver sus checkpoints.</p>;
  }

  if (checkpoints.length === 0) {
    return <p className="muted checkpoint-timeline-empty">Todavía no hay checkpoints — se crean cuando el agente toca archivos.</p>;
  }

  return (
    <div className="checkpoint-timeline">
      {checkpoints.map((c) => (
        <div key={c.messageId} className="checkpoint-item">
          <div className="checkpoint-item-main">
            <IconFile size={14} />
            <div className="checkpoint-item-body">
              <div className="checkpoint-item-summary">{c.summary || 'Cambio sin descripción'}</div>
              <div className="checkpoint-item-meta">
                {relativeDate(c.timestamp)} · {c.fileCount} archivo{c.fileCount === 1 ? '' : 's'}
              </div>
            </div>
            <span className="toolbar-spacer" />
            {previewFor === c.messageId ? (
              <button type="button" className="btn-icon" onClick={cancelPreview} title="Cancelar">
                <IconTrash size={13} />
              </button>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => requestPreview(c.messageId)}>
                <IconRefresh size={12} />
                Revertir a este punto
              </button>
            )}
          </div>

          {previewFor === c.messageId && (
            <div className="checkpoint-preview">
              {previewFiles === null ? (
                <p className="muted">Calculando diff…</p>
              ) : previewFiles.length === 0 ? (
                <p className="muted">Este checkpoint no tiene archivos para revertir.</p>
              ) : (
                <>
                  {previewFiles.map((f) => (
                    <div key={f.path} className="checkpoint-preview-file">
                      <div className="checkpoint-preview-file-path">
                        {f.path}
                        {f.willDelete && <span className="skill-scope-badge skill-scope-personal">se borra</span>}
                        {f.willCreate && <span className="skill-scope-badge skill-scope-project">se crea</span>}
                      </div>
                      {f.diff && <DiffView diff={f.diff} />}
                    </div>
                  ))}
                  <div className="form-actions">
                    <button type="button" className="btn-primary" onClick={() => confirmRevert(c.messageId)}>
                      Confirmar reversión
                    </button>
                    <button type="button" className="btn-ghost" onClick={cancelPreview}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

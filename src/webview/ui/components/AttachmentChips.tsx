import { AttachmentRef } from '../../../shared/protocol';
import { IconFile, IconX } from './Icon';

interface Props {
  items: AttachmentRef[];
  onRemove: (path: string) => void;
}

export function AttachmentChips({ items, onRemove }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="attachment-chips">
      {items.map((item) => (
        <span key={item.path} className="attachment-chip">
          <IconFile size={11} />
          {item.path}
          <button type="button" onClick={() => onRemove(item.path)} title="Quitar">
            <IconX size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

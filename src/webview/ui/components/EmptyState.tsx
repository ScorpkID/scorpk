import { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  subtitle: string;
}

export function EmptyState({ icon, title, subtitle }: Props) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-subtitle">{subtitle}</p>
    </div>
  );
}

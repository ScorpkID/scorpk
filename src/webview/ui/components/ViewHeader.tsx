import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function ViewHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="view-header">
      <div>
        <h1 className="view-title">{title}</h1>
        {subtitle && <p className="view-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="view-header-actions">{actions}</div>}
    </div>
  );
}

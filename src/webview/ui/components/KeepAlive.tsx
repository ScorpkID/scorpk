import { ReactNode } from 'react';

interface Props {
  active: boolean;
  children: ReactNode;
}

/**
 * Mantiene a los hijos montados aunque no estén visibles, en vez de
 * destruirlos y recrearlos al cambiar de pestaña. Así una conversación en
 * curso (o su estado, historial, etc.) no se pierde al navegar a otra vista
 * y volver — solo se oculta/muestra con CSS.
 */
export function KeepAlive({ active, children }: Props) {
  return <div className={active ? 'keep-alive' : 'keep-alive keep-alive-hidden'}>{children}</div>;
}

/**
 * Red de seguridad del panel.
 *
 * Si un componente lanza un error al pintarse (o en un efecto), React
 * desmonta todo el árbol y el panel se queda en blanco, sin pista de qué
 * pasó. Aquí se captura y se enseña el mensaje, para que se pueda copiar y
 * reportar, con un botón para volver a cargar.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Estado {
  error: Error | null;
}

export class ErrorPanel extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('El panel falló al pintarse', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="aviso">
        <h1>El panel ha fallado</h1>
        <p>Copia este mensaje y envíalo; ayuda a encontrar la causa:</p>
        <pre className="aviso-error">{`${error.name}: ${error.message}\n${error.stack ?? ''}`}</pre>
        <button type="button" onClick={() => window.location.reload()}>
          Volver a cargar el panel
        </button>
      </main>
    );
  }
}

import React from 'react';
import { Play, RotateCcw, AlertCircle, Sparkles, Sliders, Loader2 } from 'lucide-react';
import type { VariableInput, VariableOutput } from '../utils/mathUtils';

interface SimulationControlProps {
  inputs: VariableInput[];
  outputs: VariableOutput[];
  isRunning: boolean;
  progress?: number;
  error?: string | null;
  globalIterations: number;
  onRunSimulation: () => void;
  onReset: () => void;
  hasResults: boolean;
  onOpenSettings: () => void;
}

export const SimulationControl: React.FC<SimulationControlProps> = ({
  inputs,
  outputs,
  isRunning,
  progress = 0,
  error = null,
  globalIterations,
  onRunSimulation,
  onReset,
  hasResults,
  onOpenSettings
}) => {
  const canRun = inputs.length > 0 && outputs.length > 0;

  return (
    <div className="card animate-fade-in" style={{ gap: '16px' }}>
      <div>
        <h2>Ejecución de Simulación</h2>
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
          Configuración actual: <strong>{globalIterations.toLocaleString()} iteraciones</strong>
        </p>
      </div>

      {!canRun && (
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
          background: 'hsl(0, 80%, 60%, 0.15)',
          border: '1px solid hsl(0, 80%, 60%, 0.3)',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '0.8rem',
          color: 'hsl(0, 90%, 75%)'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            Para ejecutar la simulación de Monte Carlo, debes configurar al menos <strong>1 variable de Entrada</strong> y <strong>1 variable de Salida</strong>.
          </span>
        </div>
      )}

      {canRun && !isRunning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={onRunSimulation}
              style={{ flex: 2, padding: '12px', fontSize: '0.9rem', gap: '6px', justifyContent: 'center' }}
            >
              <Play size={16} fill="currentColor" />
              Ejecutar Simulación
            </button>

            {hasResults && (
              <button
                className="btn btn-secondary"
                onClick={onReset}
                title="Limpiar resultados"
                style={{ flex: 1, padding: '12px', justifyContent: 'center' }}
              >
                <RotateCcw size={16} />
              </button>
            )}
          </div>
          
          <button
            className="btn btn-secondary"
            onClick={onOpenSettings}
            style={{ padding: '8px', fontSize: '0.75rem', gap: '6px', justifyContent: 'center', borderColor: 'transparent' }}
          >
            <Sliders size={12} />
            Cambiar iteraciones o ajustes globales
          </button>
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px',
          background: 'hsl(0, 80%, 60%, 0.15)',
          border: '1px solid hsl(0, 80%, 60%, 0.3)',
          borderRadius: '8px',
          color: 'hsl(0, 90%, 75%)',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Error durante la simulación:</strong><br/>
            {error}
          </div>
        </div>
      )}

      {isRunning && (
        <div className="animate-fade-in card" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px 16px',
          background: 'hsl(var(--bg-secondary) / 0.5)'
        }}>
          <div style={{ position: 'relative' }}>
            <Loader2 
              size={36} 
              className="animate-spin" 
              style={{ color: 'hsl(var(--accent-primary))' }} 
            />
            <Sparkles 
              size={16} 
              className="animate-pulse" 
              style={{ 
                position: 'absolute', 
                top: '-5px', 
                right: '-10px', 
                color: 'hsl(var(--accent-secondary))' 
              }} 
            />
          </div>
          
          <div style={{ width: '100%', maxWidth: '200px' }}>
            <div style={{ 
              height: '6px', 
              width: '100%', 
              background: 'var(--border)', 
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '4px'
            }}>
              <div style={{
                height: '100%',
                background: 'var(--accent-primary)',
                width: `${Math.max(5, progress * 100)}%`,
                transition: 'width 0.1s linear'
              }} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', textAlign: 'right' }}>
              {Math.round(progress * 100)}%
            </div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '4px', color: 'hsl(var(--text-primary))' }}>
              Ejecutando {globalIterations.toLocaleString()} simulaciones...
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
              Excel está calculando los resultados en su motor interno. Por favor espera.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

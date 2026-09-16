import React from 'react';
import { Layers, CheckCircle2, AlertTriangle } from 'lucide-react';
import { isOfficeInitialized } from '../services/excelService';

interface HeaderProps {
  excelReady: boolean;
}

export const Header: React.FC<HeaderProps> = ({ excelReady }) => {
  const connected = isOfficeInitialized();

  return (
    <div className="card animate-fade-in" style={{ padding: '8px 12px', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          background: 'var(--accent-gradient)',
          padding: '6px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px hsl(var(--accent-primary) / 0.3)'
        }}>
          <Layers size={16} color="#FFF" />
        </div>
        <div>
          <h1 style={{ fontSize: '1rem', margin: 0 }}>Financial risk</h1>
          <span style={{ fontSize: '0.6rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>MONTE CARLO ENGINE</span>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
        {connected && excelReady ? (
          <>
            <CheckCircle2 size={14} color="hsl(150, 80%, 45%)" />
            <span style={{ color: 'hsl(150, 80%, 45%)' }}>Excel Conectado</span>
          </>
        ) : (
          <>
            <AlertTriangle size={14} color="hsl(45, 90%, 55%)" />
            <span style={{ color: 'hsl(45, 90%, 55%)' }}>Navegador (Demo)</span>
          </>
        )}
      </div>
    </div>
  );
};

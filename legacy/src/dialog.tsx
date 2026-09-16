import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const DialogApp = () => {
  const [distType, setDistType] = useState('normal');
  const [param1, setParam1] = useState(0); // mean, min, prob
  const [param2, setParam2] = useState(1); // stdDev, max, mostLikely
  const [param3, setParam3] = useState(1); // max (for triangular/pert)

  useEffect(() => {
    Office.onReady();
    
    // Leer valores de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const cellValue = parseFloat(urlParams.get('value') || '0');
    
    // Pre-llenar según la distribución
    setParam1(cellValue); // Para normal, lognormal, uniform, triangular (min/mean)
    setParam2(cellValue); // Para triangular/pert (mostLikely)
  }, []);

  const handleSave = () => {
    const params: any = {};
    if (distType === 'normal' || distType === 'lognormal') {
      params.mean = param1;
      params.stdDev = param2;
    } else if (distType === 'uniform') {
      params.min = param1;
      params.max = param2;
    } else if (distType === 'triangular' || distType === 'pert') {
      params.min = param1;
      params.mostLikely = param2;
      params.max = param3;
    } else if (distType === 'bernoulli') {
      params.probability = param1;
    }

    Office.context.ui.messageParent(JSON.stringify({ action: 'saveInput', data: { type: distType, params } }));
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-primary)', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Entrada Rápida</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Distribución</label>
        <select 
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }}
          value={distType}
          onChange={(e) => setDistType(e.target.value)}
        >
          <option value="triangular">Triangular (Negocios)</option>
          <option value="pert">PERT (Proyectos)</option>
          <option value="normal">Normal (Estadística)</option>
          <option value="lognormal">Lognormal (Finanzas)</option>
          <option value="uniform">Uniforme (Intervalo)</option>
          <option value="bernoulli">Bernoulli (Binaria)</option>
        </select>
      </div>

      {(distType === 'normal' || distType === 'lognormal') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Media</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param1} onChange={(e) => setParam1(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Desv. Estándar</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param2} onChange={(e) => setParam2(Number(e.target.value))} />
          </div>
        </div>
      )}

      {distType === 'uniform' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Mínimo</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param1} onChange={(e) => setParam1(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Máximo</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param2} onChange={(e) => setParam2(Number(e.target.value))} />
          </div>
        </div>
      )}

      {(distType === 'triangular' || distType === 'pert') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Mínimo</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param1} onChange={(e) => setParam1(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Moda</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param2} onChange={(e) => setParam2(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Máximo</label>
            <input type="number" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param3} onChange={(e) => setParam3(Number(e.target.value))} />
          </div>
        </div>
      )}

      {distType === 'bernoulli' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Probabilidad (0-1)</label>
            <input type="number" step="0.01" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', outline: 'none' }} value={param1} onChange={(e) => setParam1(Number(e.target.value))} />
          </div>
        </div>
      )}

      <button 
        onClick={handleSave}
        className="btn btn-primary"
        style={{ marginTop: '16px', width: '100%' }}
      >
        Guardar e Inyectar
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<DialogApp />);

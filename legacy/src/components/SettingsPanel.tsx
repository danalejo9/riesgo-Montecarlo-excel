import React, { useState } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import type { GlobalSettings } from '../services/excelService';

interface SettingsPanelProps {
  settings: GlobalSettings;
  onSaveSettings: (newSettings: GlobalSettings) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onSaveSettings }) => {
  const [iterations, setIterations] = useState<number>(settings.iterations || 1000);
  const [seed, setSeed] = useState<number | ''>(settings.seed !== undefined ? settings.seed : '');
  const [mode, setMode] = useState<'stochastic' | 'deterministic'>('stochastic');
  const [isSaved, setIsSaved] = useState(false);

  // Cargar modo inicial
  React.useEffect(() => {
    if (typeof OfficeRuntime !== 'undefined' && OfficeRuntime.storage) {
      OfficeRuntime.storage.getItem('MonteCarloMode').then(val => {
        if (val === 'deterministic') setMode('deterministic');
      }).catch(() => {});
    }
  }, []);

  const handleSave = () => {
    let validIter = iterations;
    if (isNaN(validIter) || validIter < 1) validIter = 1000;
    if (validIter > 50000) validIter = 50000; // Hard cap for safety
    
    setIterations(validIter);
    
    const newSettings: GlobalSettings = { iterations: validIter };
    if (seed !== '') newSettings.seed = Number(seed);

    if (typeof OfficeRuntime !== 'undefined' && OfficeRuntime.storage) {
      OfficeRuntime.storage.setItem('MonteCarloMode', mode).catch(() => {});
    }

    onSaveSettings(newSettings);
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="card animate-fade-in" style={{ gap: '16px' }}>
      <div>
        <h2>Ajustes Globales</h2>
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
          Configura los parámetros predeterminados para todas las simulaciones de este libro.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Número de Iteraciones</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="number" 
            className="input-field" 
            value={iterations} 
            onChange={(e) => setIterations(parseInt(e.target.value, 10))}
            min="100"
            max="50000"
            step="100"
          />
        </div>
        <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
          Recomendado: 1,000 para modelos simples, 5,000 para mayor precisión. Máximo: 50,000.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Semilla Aleatoria (Opcional)</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="number" 
            className="input-field" 
            value={seed} 
            onChange={(e) => setSeed(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            placeholder="Dejar vacío para semilla dinámica"
          />
        </div>
        <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
          Usar un número fijo asegura que la simulación arroje resultados idénticos en cada ejecución (reproducibilidad).
        </p>
      </div>

      <div className="form-group">
        <label className="form-label">Modo de Fórmulas en Excel</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            className="input-field" 
            value={mode}
            onChange={(e) => setMode(e.target.value as 'stochastic' | 'deterministic')}
          >
            <option value="stochastic">Estocástico (Aleatorio)</option>
            <option value="deterministic">Determinístico (Valores Estáticos)</option>
          </select>
        </div>
        <p style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>
          En <strong>Estocástico</strong>, las funciones =RIESGO.() generan un número aleatorio nuevo con cada cálculo. En <strong>Determinístico</strong>, se congelan en su valor medio/esperado sin ejecutar la simulación.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '12px', background: 'hsl(var(--bg-secondary))', borderRadius: '6px', borderLeft: '3px solid hsl(var(--accent-primary))' }}>
         <AlertCircle size={16} color="hsl(var(--accent-primary))" style={{ flexShrink: 0, marginTop: '2px' }} />
         <p style={{ fontSize: '0.75rem', margin: 0, color: 'hsl(var(--text-secondary))' }}>
           Estos ajustes se guardan localmente en tu archivo de Excel. Al enviar este archivo a otro colega, las iteraciones se mantendrán.
         </p>
      </div>

      <button 
        className="btn btn-primary" 
        onClick={handleSave}
        style={{ marginTop: '8px', justifyContent: 'center' }}
      >
        <Save size={16} />
        {isSaved ? '¡Guardado!' : 'Guardar Ajustes'}
      </button>
    </div>
  );
};

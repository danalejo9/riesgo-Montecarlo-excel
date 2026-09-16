import React, { useState } from 'react';
import { Trash2, RefreshCw, BarChart2, TrendingUp, Edit2 } from 'lucide-react';
import type { ExcelCellInfo } from '../services/excelService';
import { getSelectedCell, writeCellValue } from '../services/excelService';
import { getExcelFormulaForDistribution, type VariableInput, type VariableOutput, type DistributionType } from '../utils/mathUtils';

interface VariableConfigProps {
  inputs: VariableInput[];
  outputs: VariableOutput[];
  onAddInput: (input: VariableInput) => void;
  onAddOutput: (output: VariableOutput) => void;
  onRemoveInput: (id: string) => void;
  onRemoveOutput: (id: string) => void;
}

export const VariableConfig: React.FC<VariableConfigProps> = ({
  inputs,
  outputs,
  onAddInput,
  onAddOutput,
  onRemoveInput,
  onRemoveOutput
}) => {
  const [selectedCell, setSelectedCell] = useState<ExcelCellInfo | null>(null);
  const [isConfiguring, setIsConfiguring] = useState<'input' | 'output' | null>(null);
  const [isLoadingCell, setIsLoadingCell] = useState(false);

  // Form states
  const [varName, setVarName] = useState('');
  const [distType, setDistType] = useState<DistributionType>('triangular');
  const [param1, setParam1] = useState(''); // mean, min, min, lambda, n
  const [param2, setParam2] = useState(''); // stdDev, mostLikely, max, p
  const [param3, setParam3] = useState(''); // none, max, none
  const [customDiscreteValues, setCustomDiscreteValues] = useState<{value: number, probability: number}[]>([{value: 1, probability: 0.5}, {value: 2, probability: 0.5}]);

  // Read current cell from Excel
  const handleSelectActiveCell = async () => {
    setIsLoadingCell(true);
    try {
      const cell = await getSelectedCell();
      setSelectedCell(cell);
      
      // Auto-suggest name and prefill params based on value
      const cellName = cell.address.split('!')[1] || 'Variable';
      setVarName(`Variable_${cellName}`);
      
      const val = typeof cell.value === 'number' ? cell.value : 100;
      
      // Smart defaults based on current value
      if (distType === 'normal' || distType === 'lognormal') {
        setParam1(String(val));
        setParam2(String(Math.abs(val * 0.1) || 10)); 
      } else if (distType === 'triangular' || distType === 'pert') {
        setParam1(String(val * 0.8)); 
        setParam2(String(val));       
        setParam3(String(val * 1.3)); 
      } else if (distType === 'bernoulli') {
        setParam1(String(0.5));
      } else if (distType === 'poisson') {
        setParam1(String(Math.max(1, Math.round(val))));
      } else if (distType === 'binomial') {
        setParam1("10");
        setParam2("0.5");
      } else {
        setParam1(String(val * 0.8)); 
        setParam2(String(val * 1.2)); 
      }
    } catch (err) {
      console.error("Error reading selected cell:", err);
    } finally {
      setIsLoadingCell(false);
    }
  };

  // Trigger default updates if user changes distribution type
  const handleDistTypeChange = (type: DistributionType) => {
    setDistType(type);
    if (!selectedCell) return;
    const val = typeof selectedCell.value === 'number' ? selectedCell.value : 100;

    if (type === 'normal' || type === 'lognormal') {
      setParam1(String(val));
      setParam2(String(Math.abs(val * 0.1) || 10));
    } else if (type === 'triangular' || type === 'pert') {
      setParam1(String(val * 0.8));
      setParam2(String(val));
      setParam3(String(val * 1.3));
    } else if (type === 'bernoulli') {
      setParam1(String(0.5));
    } else if (type === 'poisson') {
      setParam1(String(Math.max(1, Math.round(val))));
    } else if (type === 'binomial') {
      setParam1("10");
      setParam2("0.5");
    } else if (type === 'custom_discrete') {
      setCustomDiscreteValues([{value: Math.floor(val), probability: 1}]);
    } else {
      setParam1(String(val * 0.8));
      setParam2(String(val * 1.2));
    }
  };

  const handleSaveVariable = async () => {
    if (!selectedCell || !varName.trim()) return;

    if (isConfiguring === 'input') {
      const p1 = Number(param1);
      const p2 = Number(param2);
      const p3 = Number(param3);

      const newInput: VariableInput = {
        id: `input_${Date.now()}`,
        name: varName,
        cellAddress: selectedCell.address,
        type: distType,
        params: {
          mean: (distType === 'normal' || distType === 'lognormal') ? p1 : undefined,
          stdDev: (distType === 'normal' || distType === 'lognormal') ? p2 : undefined,
          min: (distType === 'triangular' || distType === 'uniform' || distType === 'pert' || distType === 'discrete_uniform') ? p1 : undefined,
          mostLikely: (distType === 'triangular' || distType === 'pert') ? p2 : undefined,
          max: (distType === 'triangular' || distType === 'pert') ? p3 : ((distType === 'uniform' || distType === 'discrete_uniform') ? p2 : undefined),
          probability: distType === 'bernoulli' ? p1 : (distType === 'binomial' ? p2 : undefined),
          lambda: distType === 'poisson' ? p1 : undefined,
          trials: distType === 'binomial' ? p1 : undefined,
          discreteValues: distType === 'custom_discrete' ? customDiscreteValues : undefined
        },
        currentValue: typeof selectedCell.value === 'number' ? selectedCell.value : 0
      };
      
      const formula = getExcelFormulaForDistribution(distType as DistributionType, newInput.params);
      if (formula) {
        newInput.currentValue = formula;
        await writeCellValue(selectedCell.address, formula);
      }
      
      onAddInput(newInput);
    } else if (isConfiguring === 'output') {
      const newOutput: VariableOutput = {
        id: `output_${Date.now()}`,
        name: varName,
        cellAddress: selectedCell.address,
        currentValue: typeof selectedCell.value === 'number' ? selectedCell.value : 0
      };
      onAddOutput(newOutput);
    }

    // Reset state
    setSelectedCell(null);
    setIsConfiguring(null);
    setVarName('');
  };

  const handleEditInput = (input: VariableInput) => {
    setIsConfiguring('input');
    setSelectedCell({ address: input.cellAddress, value: input.currentValue, formula: String(input.currentValue) });
    setVarName(input.name);
    setDistType(input.type);
    
    // Fill parameters
    if (input.type === 'normal' || input.type === 'lognormal') {
      setParam1(String(input.params.mean || ''));
      setParam2(String(input.params.stdDev || ''));
    } else if (input.type === 'triangular' || input.type === 'pert') {
      setParam1(String(input.params.min || ''));
      setParam2(String(input.params.mostLikely || ''));
      setParam3(String(input.params.max || ''));
    } else if (input.type === 'uniform' || input.type === 'discrete_uniform') {
      setParam1(String(input.params.min || ''));
      setParam2(String(input.params.max || ''));
    } else if (input.type === 'bernoulli') {
      setParam1(String(input.params.probability || ''));
    } else if (input.type === 'poisson') {
      setParam1(String(input.params.lambda || ''));
    } else if (input.type === 'binomial') {
      setParam1(String(input.params.trials || ''));
      setParam2(String(input.params.probability || ''));
    } else if (input.type === 'custom_discrete') {
      setCustomDiscreteValues(input.params.discreteValues || [{ value: 0, probability: 1 }]);
    }
  };

  return (
    <div className="card animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Configurar Variables</h2>
        <button 
          className="btn btn-secondary" 
          onClick={handleSelectActiveCell}
          disabled={isLoadingCell}
          style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }}
        >
          <RefreshCw size={12} className={isLoadingCell ? 'animate-spin' : ''} />
          {selectedCell ? 'Actualizar Celda' : 'Capturar Celda Activa'}
        </button>
      </div>

      {selectedCell && (
        <div className="animate-fade-in" style={{ 
          background: 'hsl(var(--bg-tertiary) / 0.3)', 
          border: '1px solid hsl(var(--border-color))',
          borderRadius: '8px', 
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <span style={{ color: 'hsl(var(--text-secondary))' }}>Celda: <strong>{selectedCell.address}</strong></span>
            <span style={{ color: 'hsl(var(--text-secondary))' }}>Valor original: <strong>{selectedCell.value}</strong></span>
          </div>

          {!isConfiguring ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => setIsConfiguring('input')}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem', gap: '4px' }}
              >
                <BarChart2 size={14} />
                Definir Entrada
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => setIsConfiguring('output')}
                style={{ flex: 1, padding: '8px', fontSize: '0.8rem', gap: '4px', borderColor: 'hsl(var(--accent-secondary) / 0.3)' }}
              >
                <TrendingUp size={14} color="hsl(var(--accent-secondary))" />
                Definir Salida
              </button>
            </div>
          ) : (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
              <div className="form-group">
                <label className="form-label">Nombre de Variable</label>
                <input 
                  type="text" 
                  value={varName} 
                  onChange={(e) => setVarName(e.target.value)} 
                  placeholder="Ej. Costo_Materiales"
                />
              </div>

              {isConfiguring === 'input' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Distribución</label>
                    <select 
                      value={distType} 
                      onChange={(e) => handleDistTypeChange(e.target.value as DistributionType)}
                    >
                      <optgroup label="Continuas">
                        <option value="triangular">Triangular (Negocios)</option>
                        <option value="pert">PERT (Proyectos)</option>
                        <option value="normal">Normal (Estadística)</option>
                        <option value="lognormal">Lognormal (Finanzas)</option>
                        <option value="uniform">Uniforme (Intervalo)</option>
                      </optgroup>
                      <optgroup label="Discretas (Conteo / Enteros)">
                        <option value="poisson">Poisson (Frecuencia)</option>
                        <option value="binomial">Binomial (Éxitos en n ensayos)</option>
                        <option value="discrete_uniform">Uniforme Discreta (Rango Entero)</option>
                        <option value="bernoulli">Bernoulli (Binaria Sí/No)</option>
                        <option value="custom_discrete">Discreta Personalizada (Tabla)</option>
                      </optgroup>
                    </select>
                  </div>

                  {(distType === 'normal' || distType === 'lognormal') && (
                    <div className="input-row">
                      <div className="form-group">
                        <label className="form-label">Media (μ)</label>
                        <input type="number" value={param1} onChange={(e) => setParam1(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Desv. Est. (σ)</label>
                        <input type="number" value={param2} onChange={(e) => setParam2(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {(distType === 'triangular' || distType === 'pert') && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div className="form-group">
                        <label className="form-label">Mínimo</label>
                        <input type="number" value={param1} onChange={(e) => setParam1(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Moda</label>
                        <input type="number" value={param2} onChange={(e) => setParam2(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Máximo</label>
                        <input type="number" value={param3} onChange={(e) => setParam3(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {(distType === 'uniform' || distType === 'discrete_uniform') && (
                    <div className="input-row">
                      <div className="form-group">
                        <label className="form-label">Mínimo</label>
                        <input type="number" value={param1} onChange={(e) => setParam1(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Máximo</label>
                        <input type="number" value={param2} onChange={(e) => setParam2(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {distType === 'poisson' && (
                    <div className="form-group">
                      <label className="form-label">Lambda (λ) / Media de ocurrencia</label>
                      <input type="number" step="0.1" min="0" value={param1} onChange={(e) => setParam1(e.target.value)} />
                    </div>
                  )}

                  {distType === 'binomial' && (
                    <div className="input-row">
                      <div className="form-group">
                        <label className="form-label">Ensayos (n)</label>
                        <input type="number" step="1" min="1" value={param1} onChange={(e) => setParam1(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Probabilidad (p)</label>
                        <input type="number" step="0.01" min="0" max="1" value={param2} onChange={(e) => setParam2(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {distType === 'bernoulli' && (
                    <div className="form-group">
                      <label className="form-label">Probabilidad (0 a 1)</label>
                      <input type="number" step="0.01" min="0" max="1" value={param1} onChange={(e) => setParam1(e.target.value)} />
                    </div>
                  )}

                  {distType === 'custom_discrete' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'hsl(var(--bg-secondary))', padding: '8px', borderRadius: '4px' }}>
                      <label className="form-label">Valores y Probabilidades</label>
                      {customDiscreteValues.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            style={{ flex: 1, padding: '4px' }}
                            value={item.value} 
                            onChange={(e) => {
                              const newVals = [...customDiscreteValues];
                              newVals[idx].value = Number(e.target.value);
                              setCustomDiscreteValues(newVals);
                            }} 
                            placeholder="Valor"
                          />
                          <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            max="1"
                            style={{ flex: 1, padding: '4px' }}
                            value={item.probability} 
                            onChange={(e) => {
                              const newVals = [...customDiscreteValues];
                              newVals[idx].probability = Number(e.target.value);
                              setCustomDiscreteValues(newVals);
                            }} 
                            placeholder="Prob."
                          />
                          <button 
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '10px' }}
                            onClick={() => {
                              if (customDiscreteValues.length <= 1) return;
                              const newVals = customDiscreteValues.filter((_, i) => i !== idx);
                              setCustomDiscreteValues(newVals);
                            }}
                          >X</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                          onClick={() => setCustomDiscreteValues([...customDiscreteValues, {value: 0, probability: 0}])}
                        >+ Añadir Fila</button>
                        <span style={{ fontSize: '0.7rem', color: customDiscreteValues.reduce((a, b) => a + b.probability, 0) === 1 ? 'green' : 'red' }}>
                          Suma prob: {(customDiscreteValues.reduce((a, b) => a + b.probability, 0) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => { setIsConfiguring(null); setSelectedCell(null); }}
                  style={{ flex: 1, padding: '8px' }}
                >
                  Cancelar
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveVariable}
                  disabled={!varName.trim()}
                  style={{ flex: 1, padding: '8px' }}
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Configured variables list */}
      {(inputs.length > 0 || outputs.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <h3>Variables Registradas</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
            {inputs.map((input) => (
              <div key={input.id} className="variable-item animate-fade-in">
                <div className="variable-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-input">Input</span>
                    <strong style={{ fontSize: '0.85rem' }}>{input.name}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button 
                      onClick={() => handleEditInput(input)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))', padding: '4px' }}
                      title="Editar variable"
                    >
                      <Edit2 size={14} onMouseOver={(e) => e.currentTarget.style.color = 'hsl(var(--accent-primary))'} onMouseOut={(e) => e.currentTarget.style.color = 'hsl(var(--text-muted))'} />
                    </button>
                    <button 
                      onClick={() => onRemoveInput(input.id)} 
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))', padding: '4px' }}
                      title="Eliminar variable"
                    >
                      <Trash2 size={14} onMouseOver={(e) => e.currentTarget.style.color = '#EF4444'} onMouseOut={(e) => e.currentTarget.style.color = 'hsl(var(--text-muted))'} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
                  <span>Celda: {input.cellAddress}</span>
                  <span style={{ textTransform: 'capitalize' }}>
                    {input.type === 'normal' && `Normal(μ:${input.params.mean}, σ:${input.params.stdDev})`}
                    {input.type === 'lognormal' && `Lognormal(μ:${input.params.mean}, σ:${input.params.stdDev})`}
                    {input.type === 'triangular' && `Triangular(Mín:${input.params.min}, Moda:${input.params.mostLikely}, Máx:${input.params.max})`}
                    {input.type === 'pert' && `PERT(Mín:${input.params.min}, Moda:${input.params.mostLikely}, Máx:${input.params.max})`}
                    {input.type === 'uniform' && `Uniforme(Mín:${input.params.min}, Máx:${input.params.max})`}
                    {input.type === 'bernoulli' && `Bernoulli(p:${input.params.probability})`}
                    {input.type === 'poisson' && `Poisson(λ:${input.params.lambda})`}
                    {input.type === 'binomial' && `Binomial(n:${input.params.trials}, p:${input.params.probability})`}
                    {input.type === 'discrete_uniform' && `Unif. Discreta(${input.params.min} a ${input.params.max})`}
                    {input.type === 'custom_discrete' && `Discreta Personalizada (${input.params.discreteValues?.length} val)`}
                  </span>
                </div>
              </div>
            ))}

            {outputs.map((output) => (
              <div key={output.id} className="variable-item animate-fade-in" style={{ borderLeft: '3px solid hsl(var(--accent-secondary))' }}>
                <div className="variable-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-output">Output</span>
                    <strong style={{ fontSize: '0.85rem' }}>{output.name}</strong>
                  </div>
                  <button 
                    onClick={() => onRemoveOutput(output.id)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))' }}
                  >
                    <Trash2 size={12} onMouseOver={(e) => e.currentTarget.style.color = '#EF4444'} onMouseOut={(e) => e.currentTarget.style.color = 'hsl(var(--text-muted))'} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
                  <span>Celda: {output.cellAddress}</span>
                  <span>Valor base: {output.currentValue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { fitDistributions, calculateDescriptiveStats } from '../utils/statistics';
import type { FitResult, DescriptiveStats } from '../utils/statistics';
import { ComposedChart, Bar, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle2, ChevronRight, Activity, Sparkles, RefreshCw } from 'lucide-react';
import { randomNormal, randomTriangular, randomUniform, randomLognormal, randomBernoulli, randomPERT, randomPoisson, randomBinomial, randomDiscreteUniform, randomCustomDiscrete } from '../utils/mathUtils';

interface FittingToolProps {
  onInject: (distType: string, params: any) => Promise<void>;
}

export const FittingTool: React.FC<FittingToolProps> = ({ onInject }) => {
  const [stats, setStats] = useState<DescriptiveStats | null>(null);
  const [results, setResults] = useState<FitResult[]>([]);
  const [selectedFit, setSelectedFit] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [histogramData, setHistogramData] = useState<any[]>([]);
  const [combinedData, setCombinedData] = useState<any[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (histogramData.length === 0 || results.length === 0) {
      setCombinedData(histogramData);
      return;
    }
    
    const bestFit = results[selectedFit];
    const params = bestFit.params;
    
    // Generar muestras simuladas para dibujar la curva teórica (PDF)
    const N = 5000;
    const samples: number[] = [];
    
    for(let i = 0; i < N; i++) {
       if (bestFit.distribution === 'normal') samples.push(randomNormal(params.mean!, params.stdDev!));
       else if (bestFit.distribution === 'lognormal') samples.push(randomLognormal(params.mean!, params.stdDev!));
       else if (bestFit.distribution === 'uniform') samples.push(randomUniform(params.min!, params.max!));
       else if (bestFit.distribution === 'triangular') samples.push(randomTriangular(params.min!, params.mostLikely!, params.max!));
       else if (bestFit.distribution === 'pert') samples.push(randomPERT(params.min!, params.mostLikely!, params.max!));
       else if (bestFit.distribution === 'bernoulli') samples.push(randomBernoulli(params.probability!));
       else if (bestFit.distribution === 'poisson') samples.push(randomPoisson(params.lambda!));
       else if (bestFit.distribution === 'binomial') samples.push(randomBinomial(params.trials!, params.probability!));
       else if (bestFit.distribution === 'discrete_uniform') samples.push(randomDiscreteUniform(params.min!, params.max!));
       else if (bestFit.distribution === 'custom_discrete') samples.push(randomCustomDiscrete(params.discreteValues!));
    }
    
    // Agrupar las muestras en los mismos "bins" del histograma
    const k = histogramData.length;
    const min = histogramData[0].binMin;
    const binWidth = histogramData[0].binMax - histogramData[0].binMin;
    const counts = new Array(k).fill(0);
    
    samples.forEach(val => {
       let idx = Math.floor((val - min) / binWidth);
       if (idx >= 0 && idx < k) counts[idx]++;
    });
    
    // Escalar la curva teórica al tamaño de la muestra original
    const originalCount = stats?.count || 1;
    const scale = originalCount / N;
    
    const newData = histogramData.map((b, i) => ({
        ...b,
        pdf: Number((counts[i] * scale).toFixed(2))
    }));
    
    setCombinedData(newData);
  }, [selectedFit, histogramData, results, stats]);

  const loadDataFromSelection = async () => {
    setLoading(true);
    setError('');
    try {
      let rawData: number[] = [];
      await Excel.run(async (context) => {
        const range = context.workbook.getSelectedRange();
        range.load("values");
        await context.sync();
        
        const values = range.values;
        for (let r = 0; r < values.length; r++) {
          for (let c = 0; c < values[r].length; c++) {
            const val = values[r][c];
            if (typeof val === 'number') {
              rawData.push(val);
            } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
              rawData.push(parseFloat(val));
            }
          }
        }
      });

      if (rawData.length < 5) {
        throw new Error('Se necesitan al menos 5 datos numéricos en tu selección para realizar un ajuste.');
      }

      const calculatedStats = calculateDescriptiveStats(rawData);
      setStats(calculatedStats);
      
      const fitResults = fitDistributions(rawData);
      setResults(fitResults);
      setSelectedFit(0); // reset selection
      
      const k = Math.max(5, Math.ceil(1 + 3.322 * Math.log10(rawData.length))); // Sturges rule
      const min = calculatedStats.min;
      const max = calculatedStats.max;
      const binWidth = (max - min) / k;
      
      const bins = Array.from({length: k}, (_, i) => ({
        binMin: min + i * binWidth,
        binMax: min + (i + 1) * binWidth,
        label: `${(min + i * binWidth).toFixed(1)} - ${(min + (i + 1) * binWidth).toFixed(1)}`,
        count: 0
      }));

      rawData.forEach(val => {
        let idx = Math.floor((val - min) / binWidth);
        if (idx >= k) idx = k - 1;
        bins[idx].count++;
      });
      
      setHistogramData(bins);
      setHasData(true);
    } catch (err: any) {
      setError(err.message || 'Error al leer los datos de Excel.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (results.length === 0) return;
    const bestFit = results[selectedFit];
    await onInject(bestFit.distribution, bestFit.params);
  };

  return (
    <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={20} color="var(--accent-primary)" />
            Ajuste de Datos
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Encuentra la mejor distribución estadística.
          </p>
        </div>
      </div>

      {!hasData && !loading && (
        <div style={{ textAlign: 'center', padding: '20px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Selecciona en tu hoja de Excel el rango de celdas con los datos históricos que quieres analizar y haz clic abajo.
          </p>
          <button onClick={loadDataFromSelection} className="btn btn-primary" style={{ display: 'flex', gap: '8px', margin: '0 auto' }}>
            <Activity size={16} /> Analizar Selección Actual
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent-primary)', marginBottom: '10px' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Extrayendo y analizando datos...</p>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: 'hsl(0, 80%, 60%, 0.1)', color: 'hsl(0, 80%, 60%)', borderRadius: '8px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {hasData && !loading && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Se analizaron <strong>{stats?.count}</strong> datos.
            </p>
            <button 
              onClick={loadDataFromSelection} 
              className="btn btn-secondary" 
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              <RefreshCw size={12} style={{ marginRight: '4px' }} /> Refrescar
            </button>
          </div>

          {/* CHART */}
          <div style={{ height: '220px', width: '100%', background: 'white', borderRadius: '8px', padding: '10px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Histograma vs. Distribución Seleccionada</span>
              {results[selectedFit] && (
                <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{results[selectedFit].name}</span>
              )}
            </h3>
            <ResponsiveContainer width="100%" height="80%">
              <ComposedChart data={combinedData}>
                <XAxis dataKey="label" tick={{fontSize: 9}} interval="preserveStartEnd" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--accent-primary))" radius={[4, 4, 0, 0]} name="Datos" />
                <Line type="monotone" dataKey="pdf" stroke="#EF4444" strokeWidth={2} dot={false} name="Curva Teórica" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* RANKING */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Ranking de Distribuciones</h3>
            {results.slice(0, 4).map((res, idx) => (
              <div 
                key={res.name}
                onClick={() => setSelectedFit(idx)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: selectedFit === idx ? '2px solid hsl(var(--accent-primary))' : '1px solid var(--border-color)',
                  background: selectedFit === idx ? 'hsl(var(--accent-primary) / 0.05)' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {idx === 0 && <Sparkles size={14} color="#EAB308" />}
                    {res.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {Object.entries(res.params).map(([k, v]) => {
                       if (k === 'discreteValues') return `Valores: ${Array.isArray(v) ? v.length : 0}`;
                       return `${k}: ${Number(v).toFixed(2)}`;
                    }).join(' | ')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {(() => {
                    const getScoreQuality = (score: number) => {
                      if (score < 0.08) return { label: 'Excelente', color: '#059669', bg: '#D1FAE5' };
                      if (score < 0.15) return { label: 'Bueno', color: '#2563EB', bg: '#DBEAFE' };
                      if (score < 0.25) return { label: 'Aceptable', color: '#D97706', bg: '#FEF3C7' };
                      return { label: 'Pobre', color: '#DC2626', bg: '#FEE2E2' };
                    };
                    const quality = getScoreQuality(res.score);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                          KS: <strong>{res.score.toFixed(3)}</strong>
                        </span>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: quality.bg, color: quality.color, fontSize: '0.65rem', fontWeight: 600 }}>
                          {quality.label}
                        </span>
                      </div>
                    );
                  })()}
                  {selectedFit === idx ? (
                    <CheckCircle2 size={20} color="hsl(var(--accent-primary))" />
                  ) : (
                    <div style={{ width: '20px' }}></div> /* spacer */
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '10px' }}>
            <div style={{ background: 'hsl(var(--accent-secondary) / 0.1)', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--accent-secondary))' }}>
                <strong>Paso 2:</strong> Selecciona en Excel la celda donde deseas guardar esta variable y presiona el botón.
              </p>
            </div>
            <button 
              onClick={handleApply}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '0.9rem', display: 'flex', justifyContent: 'center' }}
            >
              Inyectar en Celda Activa <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

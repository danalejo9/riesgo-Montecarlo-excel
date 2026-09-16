import React, { useState, useMemo } from 'react';
import { Download, Info, BarChart } from 'lucide-react';
import type { VariableInput, VariableOutput } from '../utils/mathUtils';
import { analyzeResults, calculateCorrelation, fitDistribution } from '../utils/mathUtils';
import { exportReportToExcel } from '../services/excelService';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface ResultsDashboardProps {
  inputs: VariableInput[];
  outputs: VariableOutput[];
  simulationData: { outputs: { [outputId: string]: number[] }, inputs: { [inputId: string]: number[] } } | null;
  onInjectAsInput?: (distName: string, params: any) => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  inputs,
  outputs,
  simulationData,
  onInjectAsInput
}) => {
  const allVariables = [...outputs, ...inputs];
  const [selectedVarId, setSelectedVarId] = useState<string>(outputs[0]?.id || inputs[0]?.id || '');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [viewMode, setViewMode] = useState<'distribution' | 'cumulative' | 'sensitivity'>('distribution');
  const [lowerPercentileNum, setLowerPercentileNum] = useState<number>(10);
  const [upperPercentileNum, setUpperPercentileNum] = useState<number>(90);

  if (!simulationData || allVariables.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'hsl(var(--text-muted))' }}>
        <Info size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h3>No hay resultados disponibles</h3>
        <p>Ejecuta una simulación primero para ver el análisis de resultados.</p>
      </div>
    );
  }

  // Sync state if variables change
  const currentVar = allVariables.find(v => v.id === selectedVarId) || allVariables[0];
  if (currentVar && currentVar.id !== selectedVarId) {
    setSelectedVarId(currentVar.id);
  }

  const isOutput = currentVar.id.startsWith('output_');
  
  // Force distribution view if viewing an input
  if (!isOutput && viewMode === 'sensitivity') {
    setViewMode('distribution');
  }

  const dataPoints = isOutput 
    ? simulationData.outputs[currentVar.id] 
    : simulationData.inputs[currentVar.id];

  if (!dataPoints || dataPoints.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'hsl(var(--text-muted))' }}>
        <Info size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h3>No hay datos para esta variable</h3>
        <p>Asegúrate de que la simulación se ejecutó correctamente.</p>
      </div>
    );
  }

  // Analyze statistics
  const stats = analyzeResults(dataPoints, 20);

  // Dynamically calculate the custom percentiles from sorted dataPoints
  const calculatePercentile = (sortedData: number[], p: number) => {
    if (sortedData.length === 0) return 0;
    const index = (p / 100) * (sortedData.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sortedData.length) return sortedData[lower];
    return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
  };

  const currentP10 = calculatePercentile(stats.dataPoints, lowerPercentileNum);
  const currentP90 = calculatePercentile(stats.dataPoints, upperPercentileNum);

  // Calculate Sensitivity (Tornado) Data - Only valid if viewing an output
  const sensitivityData = useMemo(() => {
    if (!isOutput || !simulationData.inputs || inputs.length === 0) return [];
    
    const correlations = inputs.map(input => {
      const inputVals = simulationData.inputs[input.id];
      const outputVals = dataPoints;
      const corr = calculateCorrelation(inputVals, outputVals);
      return {
        inputId: input.id,
        inputName: input.name,
        correlation: isNaN(corr) ? 0 : corr
      };
    });

    // Sort by absolute correlation descending
    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }, [inputs, simulationData, dataPoints, isOutput]);

  // Calculate Best Fit Distribution - Only valid if viewing an output
  const fitData = useMemo(() => {
    if (!isOutput || !dataPoints || dataPoints.length === 0) return null;
    return fitDistribution(dataPoints);
  }, [isOutput, dataPoints]);

  const formatNum = (num: number) => {
    return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportReportToExcel(simulationData!, inputs, outputs);
    } catch (err) {
      console.error("Error exporting report:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('pdf-content');
    if (!element) return;
    
    setIsExportingPDF(true);
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      
      // Header
      pdf.setFontSize(22);
      pdf.setTextColor('#0f172a');
      pdf.text('Reporte Ejecutivo de Riesgo', margin, 20);
      
      pdf.setFontSize(12);
      pdf.setTextColor('#334155');
      pdf.text('Análisis por Simulación de Monte Carlo', margin, 28);
      
      // Metadata
      pdf.setFontSize(10);
      pdf.setTextColor('#64748b');
      pdf.text(`Fecha de generación: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, 40);
      pdf.text(`Variable analizada: ${currentVar.name} (Celda: ${currentVar.cellAddress})`, margin, 45);
      pdf.text(`Iteraciones simuladas: ${dataPoints.length.toLocaleString()}`, margin, 50);

      // Section: Estadísticas Clave
      pdf.setFontSize(14);
      pdf.setTextColor('#0f172a');
      pdf.text('1. Estadísticas Descriptivas', margin, 65);
      
      pdf.setFontSize(11);
      pdf.setTextColor('#334155');
      pdf.text(`Media Esperada: ${formatNum(stats.mean)}`, margin + 5, 75);
      pdf.text(`Desviación Estándar (Volatilidad): ${formatNum(stats.stdDev)}`, margin + 5, 82);
      pdf.text(`Mínimo Simulado: ${formatNum(stats.min)}`, margin + 5, 89);
      pdf.text(`Máximo Simulado: ${formatNum(stats.max)}`, margin + 5, 96);
      
      // Section: Análisis de Probabilidad
      pdf.setFontSize(14);
      pdf.setTextColor('#0f172a');
      pdf.text('2. Análisis de Probabilidad y Riesgo', margin, 115);
      
      pdf.setFontSize(11);
      pdf.setTextColor('#334155');
      pdf.text(`Existe un ${lowerPercentileNum}% de probabilidad de que el resultado sea inferior a: ${formatNum(currentP10)} (P${lowerPercentileNum})`, margin + 5, 125);
      pdf.text(`Existe un ${100 - upperPercentileNum}% de probabilidad de que el resultado supere: ${formatNum(currentP90)} (P${upperPercentileNum})`, margin + 5, 132);
      
      let currentY = 145;

      // Section: Distribución Teórica
      if (isOutput && fitData) {
        pdf.setFontSize(14);
        pdf.setTextColor('#0f172a');
        pdf.text('3. Comportamiento Estadístico', margin, currentY);
        
        pdf.setFontSize(11);
        pdf.setTextColor('#334155');
        const dist = fitData.bestFit.distribution;
        let paramStr = '';
        if (dist === 'Normal') paramStr = `Media: ${formatNum(fitData.bestFit.params.mean)}, Desv: ${formatNum(fitData.bestFit.params.stdDev)}`;
        if (dist === 'Lognormal') paramStr = `Media Log: ${formatNum(fitData.bestFit.params.logMean)}, Desv Log: ${formatNum(fitData.bestFit.params.logStdDev)}`;
        if (dist === 'Uniforme') paramStr = `Min: ${formatNum(fitData.bestFit.params.min)}, Max: ${formatNum(fitData.bestFit.params.max)}`;
        
        const description = `Los datos simulados se ajustan de manera óptima a una distribución teórica ${dist}. Los parámetros característicos de esta curva son: ${paramStr}. Este ajuste fue validado mediante la prueba estadística de Kolmogorov-Smirnov.`;
        const splitDesc = pdf.splitTextToSize(description, pageWidth - margin * 2 - 5);
        pdf.text(splitDesc, margin + 5, currentY + 10);
        
        currentY += 10 + splitDesc.length * 6;
      }
      
      // Section: Gráfico Visual
      pdf.setFontSize(14);
      pdf.setTextColor('#0f172a');
      pdf.text('4. Histograma de Frecuencias (Visualización)', margin, currentY + 10);
      
      // Crop chart from canvas (We assume the SVG chart is inside #pdf-content and rendered)
      const chartWidth = pageWidth - margin * 2;
      const chartHeight = (canvas.height * chartWidth) / canvas.width;
      
      // Note: html2canvas captures the entire #pdf-content. We can just place it below.
      pdf.addImage(imgData, 'PNG', margin, currentY + 15, chartWidth, chartHeight);
      
      pdf.save(`Reporte_Riesgo_${currentVar.name}.pdf`);
    } catch (error) {
      console.error("Error generating PDF", error);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // SVG Chart configuration for Histogram
  const chartWidth = 320;
  const chartHeight = 140;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;

  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  const maxCount = Math.max(...stats.histogram.map(b => b.count)) || 1;

  // Calculate coordinates for histogram bars
  const bars = stats.histogram.map((bin, i) => {
    const barWidth = graphWidth / stats.histogram.length - 1;
    const barHeight = (bin.count / maxCount) * graphHeight;
    const x = paddingLeft + i * (graphWidth / stats.histogram.length);
    const y = chartHeight - paddingBottom - barHeight;
    return { x, y, width: barWidth, height: barHeight, count: bin.count, label: bin.binStart };
  });

  // Calculate coordinates for Cumulative curve (S-Curve)
  let runningCount = 0;
  const cumulativePoints = stats.histogram.map((bin, i) => {
    runningCount += bin.count;
    const cumProb = runningCount / stats.dataPoints.length;
    const x = paddingLeft + i * (graphWidth / stats.histogram.length) + (graphWidth / stats.histogram.length) / 2;
    const y = chartHeight - paddingBottom - (cumProb * graphHeight);
    return { x, y, cumProb, label: bin.binEnd };
  });
  // Add a starting point at (min, 0)
  cumulativePoints.unshift({
    x: paddingLeft,
    y: chartHeight - paddingBottom,
    cumProb: 0,
    label: stats.min
  });
  
  const cumulativePath = cumulativePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const getXCoordinate = (val: number) => {
    const range = stats.max - stats.min;
    if (range === 0) return paddingLeft + graphWidth / 2;
    const fraction = (val - stats.min) / range;
    return paddingLeft + fraction * graphWidth;
  };

  const p10X = getXCoordinate(currentP10);
  const p90X = getXCoordinate(currentP90);
  const meanX = getXCoordinate(stats.mean);

  return (
    <div className="card animate-fade-in" style={{ gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Resultados</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px', borderColor: 'hsl(var(--accent-secondary) / 0.3)' }}
          >
            <Download size={12} />
            {isExportingPDF ? 'PDF...' : 'PDF'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleExport}
            disabled={isExporting}
            style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px', borderColor: 'hsl(var(--accent-secondary) / 0.3)' }}
          >
            <Download size={12} />
            {isExporting ? 'Excel...' : 'Excel'}
          </button>
        </div>
      </div>

      <div id="pdf-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="form-group">
        <label className="form-label">Seleccionar Variable</label>
        <select 
          value={selectedVarId} 
          onChange={(e) => setSelectedVarId(e.target.value)}
          style={{ fontSize: '0.8rem' }}
        >
          <optgroup label="Variables de Salida">
            {outputs.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.cellAddress})</option>
            ))}
          </optgroup>
          <optgroup label="Variables de Entrada">
            {inputs.map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.cellAddress})</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Grid of Key Statistics */}
      <div className="stats-grid animate-fade-in">
        <div className="stats-box" style={{ borderLeft: '3px solid hsl(45 90% 55%)' }}>
          <span className="stats-label">Media Esperada</span>
          <span className="stats-val">{formatNum(stats.mean)}</span>
        </div>
        <div className="stats-box">
          <span className="stats-label">Desviación Estándar</span>
          <span className="stats-val">{formatNum(stats.stdDev)}</span>
        </div>
        <div className="stats-box" style={{ borderLeft: '3px solid hsl(0 80% 60%)' }}>
          <span className="stats-label">Percentil {lowerPercentileNum}</span>
          <span className="stats-val">{formatNum(currentP10)}</span>
          <span style={{ fontSize: '0.6rem', color: 'hsl(var(--text-muted))' }}>{lowerPercentileNum}% prob. ser menor</span>
        </div>
        <div className="stats-box" style={{ borderLeft: '3px solid hsl(150 80% 45%)' }}>
          <span className="stats-label">Percentil {upperPercentileNum}</span>
          <span className="stats-val">{formatNum(currentP90)}</span>
          <span style={{ fontSize: '0.6rem', color: 'hsl(var(--text-muted))' }}>{upperPercentileNum}% prob. ser menor</span>
        </div>
      </div>

      {/* Interactive Percentile Controls */}
      <div style={{ display: 'flex', gap: '16px', background: 'hsl(var(--bg-secondary))', padding: '12px', borderRadius: '8px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Percentil Inferior</span>
            <span style={{ fontSize: '0.75rem', color: 'hsl(0 80% 60%)', fontWeight: 'bold' }}>{lowerPercentileNum}%</span>
          </div>
          <input 
            type="range" 
            min="1" 
            max="49" 
            value={lowerPercentileNum} 
            onChange={(e) => setLowerPercentileNum(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'hsl(0 80% 60%)' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>Percentil Superior</span>
            <span style={{ fontSize: '0.75rem', color: 'hsl(150 80% 45%)', fontWeight: 'bold' }}>{upperPercentileNum}%</span>
          </div>
          <input 
            type="range" 
            min="51" 
            max="99" 
            value={upperPercentileNum} 
            onChange={(e) => setUpperPercentileNum(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'hsl(150 80% 45%)' }}
          />
        </div>
      </div>

      {/* Best Fit Distribution Card */}
      {isOutput && fitData && (
        <div className="stats-box animate-fade-in" style={{ 
          marginTop: '8px', 
          borderLeft: '3px solid hsl(var(--accent-primary))',
          background: 'linear-gradient(to right, hsl(var(--accent-primary) / 0.1), transparent)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stats-label" style={{ color: 'hsl(var(--accent-primary))', fontWeight: 600 }}>Mejor Ajuste de Distribución</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }} title={`Estadístico KS: ${fitData.bestFit.ksStatistic.toFixed(4)}`}>
                Basado en KS Test
              </span>
              {onInjectAsInput && (
                <button
                  className="btn btn-primary"
                  style={{ padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px' }}
                  onClick={() => onInjectAsInput(fitData.bestFit.distribution, fitData.bestFit.params)}
                  title="Convierte esta salida en una nueva variable de entrada inyectándola en una celda vacía."
                >
                  Usar como Entrada
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="stats-val" style={{ color: 'hsl(var(--accent-primary))' }}>{fitData.bestFit.distribution}</span>
            <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))' }}>
              {fitData.bestFit.distribution === 'Normal' && `(Media: ${formatNum(fitData.bestFit.params.mean)}, Desv: ${formatNum(fitData.bestFit.params.stdDev)})`}
              {fitData.bestFit.distribution === 'Lognormal' && `(Media Log: ${formatNum(fitData.bestFit.params.logMean)}, Desv Log: ${formatNum(fitData.bestFit.params.logStdDev)})`}
              {fitData.bestFit.distribution === 'Uniforme' && `(Min: ${formatNum(fitData.bestFit.params.min)}, Max: ${formatNum(fitData.bestFit.params.max)})`}
            </span>
          </div>
        </div>
      )}

      {/* View Mode Toggle */}
      {isOutput && (
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid hsl(var(--border-color))', paddingBottom: '8px' }}>
          <button 
            className={`btn ${viewMode === 'distribution' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('distribution')}
            style={{ flex: 1, padding: '6px', fontSize: '0.75rem', gap: '4px' }}
          >
            <BarChart size={14} /> PDF
          </button>
          <button 
            className={`btn ${viewMode === 'cumulative' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('cumulative')}
            style={{ flex: 1, padding: '6px', fontSize: '0.75rem', gap: '4px' }}
          >
            <BarChart size={14} /> CDF (Curva S)
          </button>
          <button 
            className={`btn ${viewMode === 'sensitivity' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('sensitivity')}
            style={{ flex: 1, padding: '6px', fontSize: '0.75rem', gap: '4px' }}
          >
            <BarChart size={14} style={{ transform: 'rotate(90deg)' }} /> Tornado
          </button>
        </div>
      )}

      {/* Custom SVG Histogram Chart */}
      {viewMode === 'distribution' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
            Distribución de Frecuencia Monte Carlo
          </span>
          
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
            <defs>
              <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent-primary))" stopOpacity="0.8" />
                <stop offset="100%" stopColor="hsl(var(--accent-primary))" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Grid lines (horizontal) */}
            <line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} className="chart-grid-line" />
            <line x1={paddingLeft} y1={paddingTop + graphHeight/2} x2={chartWidth - paddingRight} y2={paddingTop + graphHeight/2} className="chart-grid-line" />
            <line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} stroke="hsl(var(--border-color))" strokeWidth="1" />

            {/* Draw Histogram Bars */}
            {bars.map((bar, i) => (
              <g key={i}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  className="chart-bar"
                >
                  <title>{`Rango: >= ${formatNum(bar.label)} - Cuenta: ${bar.count}`}</title>
                </rect>
              </g>
            ))}

            {/* statistical indicators lines */}
            <line x1={p10X} y1={paddingTop} x2={p10X} y2={chartHeight - paddingBottom} className="chart-p10-line" />
            <line x1={p90X} y1={paddingTop} x2={p90X} y2={chartHeight - paddingBottom} className="chart-p90-line" />
            <line x1={meanX} y1={paddingTop} x2={meanX} y2={chartHeight - paddingBottom} className="chart-mean-line" />

            {/* Labels for statistical lines */}
            <text x={p10X} y={paddingTop - 3} fill="hsl(0 80% 70%)" fontSize="7" textAnchor="middle" fontWeight="bold">P{lowerPercentileNum}</text>
            <text x={p90X} y={paddingTop - 3} fill="hsl(150 80% 50%)" fontSize="7" textAnchor="middle" fontWeight="bold">P{upperPercentileNum}</text>
            <text x={meanX} y={paddingTop - 3} fill="hsl(45 90% 65%)" fontSize="7" textAnchor="middle" fontWeight="bold">Media</text>

            {/* X axis labels (Min and Max) */}
            <text x={paddingLeft} y={chartHeight - 6} className="chart-label" textAnchor="start">{formatNum(stats.min)}</text>
            <text x={chartWidth - paddingRight} y={chartHeight - 6} className="chart-label" textAnchor="end">{formatNum(stats.max)}</text>
            <text x={chartWidth / 2} y={chartHeight - 6} className="chart-label" textAnchor="middle">Valores Simulados</text>

            {/* Y axis labels */}
            <text x={paddingLeft - 5} y={paddingTop + 3} className="chart-label" textAnchor="end">{maxCount}</text>
            <text x={paddingLeft - 5} y={chartHeight - paddingBottom} className="chart-label" textAnchor="end">0</text>
          </svg>
        </div>
      )}
      {/* Custom SVG Cumulative Chart */}
      {viewMode === 'cumulative' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
            Probabilidad Acumulada (Curva S)
          </span>
          
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
            <defs>
              <linearGradient id="chart-cumulative-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(150 80% 50%)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(150 80% 50%)" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} className="chart-grid-line" />
            <line x1={paddingLeft} y1={paddingTop + graphHeight/2} x2={chartWidth - paddingRight} y2={paddingTop + graphHeight/2} className="chart-grid-line" />
            <line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} stroke="hsl(var(--border-color))" strokeWidth="1" />

            {/* Draw Area under S-Curve */}
            <path 
              d={`${cumulativePath} L ${chartWidth - paddingRight} ${chartHeight - paddingBottom} L ${paddingLeft} ${chartHeight - paddingBottom} Z`} 
              fill="url(#chart-cumulative-gradient)" 
            />
            {/* Draw Line for S-Curve */}
            <path d={cumulativePath} fill="none" stroke="hsl(150 80% 50%)" strokeWidth="2" />

            {/* Draw Percentile indicators horizontally on S-Curve */}
            <line x1={paddingLeft} y1={chartHeight - paddingBottom - (lowerPercentileNum/100)*graphHeight} x2={p10X} y2={chartHeight - paddingBottom - (lowerPercentileNum/100)*graphHeight} stroke="hsl(0 80% 70%)" strokeDasharray="3 3" strokeWidth="1" />
            <line x1={p10X} y1={chartHeight - paddingBottom - (lowerPercentileNum/100)*graphHeight} x2={p10X} y2={chartHeight - paddingBottom} stroke="hsl(0 80% 70%)" strokeDasharray="3 3" strokeWidth="1" />
            
            <line x1={paddingLeft} y1={chartHeight - paddingBottom - (upperPercentileNum/100)*graphHeight} x2={p90X} y2={chartHeight - paddingBottom - (upperPercentileNum/100)*graphHeight} stroke="hsl(150 80% 50%)" strokeDasharray="3 3" strokeWidth="1" />
            <line x1={p90X} y1={chartHeight - paddingBottom - (upperPercentileNum/100)*graphHeight} x2={p90X} y2={chartHeight - paddingBottom} stroke="hsl(150 80% 50%)" strokeDasharray="3 3" strokeWidth="1" />

            {/* X axis labels (Min and Max) */}
            <text x={paddingLeft} y={chartHeight - 6} className="chart-label" textAnchor="start">{formatNum(stats.min)}</text>
            <text x={chartWidth - paddingRight} y={chartHeight - 6} className="chart-label" textAnchor="end">{formatNum(stats.max)}</text>
            <text x={chartWidth / 2} y={chartHeight - 6} className="chart-label" textAnchor="middle">Valores Simulados</text>

            {/* Y axis labels (Probabilities) */}
            <text x={paddingLeft - 5} y={paddingTop + 3} className="chart-label" textAnchor="end">100%</text>
            <text x={paddingLeft - 5} y={paddingTop + graphHeight/2 + 3} className="chart-label" textAnchor="end">50%</text>
            <text x={paddingLeft - 5} y={chartHeight - paddingBottom} className="chart-label" textAnchor="end">0%</text>
          </svg>
        </div>
      )}

      {/* Tornado Sensitivity Chart */}
      {viewMode === 'sensitivity' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--text-secondary))' }}>
            Impacto en el Resultado (Correlación de Pearson)
          </span>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 0' }}>
            {sensitivityData.map((item) => (
              <div key={item.inputId} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '80px', fontSize: '0.7rem', textAlign: 'right', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={item.inputName}>
                  {item.inputName}
                </div>
                
                {/* Zero line reference container */}
                <div style={{ flex: 1, position: 'relative', height: '16px', borderLeft: '1px solid hsl(var(--border-color))', display: 'flex', alignItems: 'center', background: 'hsl(var(--bg-tertiary) / 0.3)' }}>
                  {/* Central zero line marker */}
                  <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'hsl(var(--text-muted))', zIndex: 1 }} />
                  
                  {/* Bar */}
                  {item.correlation > 0 ? (
                    <div style={{ 
                      position: 'absolute', 
                      left: '50%', 
                      width: `${item.correlation * 50}%`, 
                      height: '100%', 
                      background: 'hsl(150, 60%, 50%)', // Green for positive correlation
                      borderRadius: '0 4px 4px 0' 
                    }} />
                  ) : (
                    <div style={{ 
                      position: 'absolute', 
                      right: '50%', 
                      width: `${Math.abs(item.correlation) * 50}%`, 
                      height: '100%', 
                      background: 'hsl(0, 60%, 55%)', // Red for negative correlation
                      borderRadius: '4px 0 0 4px' 
                    }} />
                  )}
                </div>
                
                <div style={{ width: '40px', fontSize: '0.7rem', fontWeight: 600 }}>
                  {item.correlation.toFixed(2)}
                </div>
              </div>
            ))}
            
            {sensitivityData.length === 0 && (
              <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '20px' }}>
                No hay suficientes datos de sensibilidad.
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'distribution' && (
        <div style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          background: 'hsl(var(--bg-secondary) / 0.5)',
          borderRadius: '8px',
          padding: '8px',
          fontSize: '0.75rem',
          color: 'hsl(var(--text-secondary))'
        }}>
          <Info size={14} style={{ color: 'hsl(var(--accent-secondary))', flexShrink: 0 }} />
          <span>
            El percentil <strong>P10</strong> representa el peor escenario probable, mientras que <strong>P90</strong> representa el mejor escenario optimista.
          </span>
        </div>
      )}
      </div> {/* Close pdf-content */}
    </div>
  );
};

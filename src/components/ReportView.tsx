import React, { useState } from 'react';
import { Download, Info, CheckCircle2 } from 'lucide-react';
import type { VariableInput, VariableOutput } from '../utils/mathUtils';
import { exportInputsToExcel, exportOutputsToExcel } from '../services/excelService';

interface ReportViewProps {
  type: 'inputs' | 'outputs';
  inputs: VariableInput[];
  outputs: VariableOutput[];
}

export const ReportView: React.FC<ReportViewProps> = ({ type, inputs, outputs }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const isInput = type === 'inputs';
  const dataList = isInput ? inputs : outputs;
  const title = isInput ? 'Resumen de Entradas' : 'Resumen de Salidas';
  const emptyMessage = isInput 
    ? 'Aún no has definido ninguna variable de entrada en tu modelo.'
    : 'Aún no has definido ninguna variable de salida en tu modelo.';

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    try {
      if (isInput) {
        await exportInputsToExcel(inputs);
      } else {
        await exportOutputsToExcel(outputs);
      }
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error("Error al exportar:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="card animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={20} color="var(--accent-primary)" />
          {title}
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginTop: '4px' }}>
          Visualiza todas las variables {isInput ? 'de entrada' : 'de salida'} configuradas en el libro actual.
        </p>
      </div>

      {dataList.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem' }}>{emptyMessage}</p>
        </div>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1, marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 4px', color: 'hsl(var(--text-secondary))' }}>Nombre</th>
                <th style={{ padding: '8px 4px', color: 'hsl(var(--text-secondary))' }}>Celda</th>
                {isInput && <th style={{ padding: '8px 4px', color: 'hsl(var(--text-secondary))' }}>Distribución</th>}
              </tr>
            </thead>
            <tbody>
              {dataList.map((item: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 4px', fontWeight: '500' }}>{item.name}</td>
                  <td style={{ padding: '8px 4px', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                    {item.cellAddress}
                  </td>
                  {isInput && (
                    <td style={{ padding: '8px 4px', textTransform: 'capitalize' }}>
                      {item.type}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dataList.length > 0 && (
        <button 
          className="btn btn-primary" 
          onClick={handleExport}
          disabled={isExporting}
          style={{ marginTop: 'auto', justifyContent: 'center' }}
        >
          {exportSuccess ? (
            <>
              <CheckCircle2 size={16} />
              Exportado Exitosamente
            </>
          ) : (
            <>
              <Download size={16} />
              {isExporting ? 'Exportando...' : 'Exportar a Hoja de Excel'}
            </>
          )}
        </button>
      )}
    </div>
  );
};

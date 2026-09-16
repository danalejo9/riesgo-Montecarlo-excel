import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VariableConfig } from './components/VariableConfig';
import { SimulationControl } from './components/SimulationControl';
import { ResultsDashboard } from './components/ResultsDashboard';
import { SettingsPanel } from './components/SettingsPanel';
import { FittingTool } from './components/FittingTool';
import { HelpDocs } from './components/HelpDocs';
import { ReportView } from './components/ReportView';
import { setSeed, getExcelFormulaForDistribution } from './utils/mathUtils';
import type { VariableInput, VariableOutput } from './utils/mathUtils';
import type { GlobalSettings } from './services/excelService';
import { 
  initializeOffice, 
  runMonteCarloSimulation, 
  saveConfigToDocument,
  loadConfigFromDocument,
  highlightCell, 
  clearCellFormat,
  getSelectedCell,
  writeCellValue,
  addNamedRange,
  removeNamedRange,
  getNamedRangeAddress
} from './services/excelService';


type Tab = 'config' | 'simulate' | 'results' | 'settings' | 'fitting' | 'help' | 'reportInputs' | 'reportOutputs';

function App() {
  const [excelReady, setExcelReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [inputs, setInputs] = useState<VariableInput[]>([]);
  const [outputs, setOutputs] = useState<VariableOutput[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({ iterations: 1000 });
  const [isRunning, setIsRunning] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [simulationData, setSimulationData] = useState<{ outputs: { [outputId: string]: number[] }, inputs: { [inputId: string]: number[] } } | null>(null);

  // Initialize Office.js, load settings, and parse URL routing
  useEffect(() => {
    // Parse URL parameters for routing from custom ribbon tab
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['config', 'simulate', 'results', 'settings', 'fitting', 'help', 'reportInputs', 'reportOutputs'].includes(tabParam)) {
      setActiveTab(tabParam as Tab);
    }

    initializeOffice().then(async () => {
      setExcelReady(true);
      const config = await loadConfigFromDocument();
      if (config) {
        const resolvedInputs = await Promise.all((config.inputs || []).map(async (inp) => {
          const newAddress = await getNamedRangeAddress(inp.id);
          return newAddress ? { ...inp, cellAddress: newAddress } : inp;
        }));
        const resolvedOutputs = await Promise.all((config.outputs || []).map(async (out) => {
          const newAddress = await getNamedRangeAddress(out.id);
          return newAddress ? { ...out, cellAddress: newAddress } : out;
        }));
        
        setInputs(resolvedInputs);
        setOutputs(resolvedOutputs);
        if (config.globalSettings) setGlobalSettings(config.globalSettings);
      }

      // Listen for changes made by Ribbon commands
      if (Office && Office.context && Office.context.document && Office.context.document.settings) {
        Office.context.document.settings.addHandlerAsync(Office.EventType.SettingsChanged, async () => {
          // Check for forced tab navigation from headless commands
          const forceTab = Office.context.document.settings.get("forceTab");
          if (forceTab) {
            setActiveTab(forceTab as Tab);
            Office.context.document.settings.remove("forceTab");
            Office.context.document.settings.remove("forceTabTime");
            Office.context.document.settings.saveAsync();
          }

          const newConfig = await loadConfigFromDocument();
          if (newConfig) {
            const resolvedInputs = await Promise.all((newConfig.inputs || []).map(async (inp) => {
              const newAddress = await getNamedRangeAddress(inp.id);
              return newAddress ? { ...inp, cellAddress: newAddress } : inp;
            }));
            const resolvedOutputs = await Promise.all((newConfig.outputs || []).map(async (out) => {
              const newAddress = await getNamedRangeAddress(out.id);
              return newAddress ? { ...out, cellAddress: newAddress } : out;
            }));
            setInputs(resolvedInputs);
            setOutputs(resolvedOutputs);
            if (newConfig.globalSettings) setGlobalSettings(newConfig.globalSettings);
          }
        });
      }
    });
  }, []);

  const handleSaveSettings = (newSettings: GlobalSettings) => {
    setGlobalSettings(newSettings);
    saveConfigToDocument(inputs, outputs, newSettings);
  };

  const handleAddInput = async (newInput: VariableInput) => {
    setInputs(prev => {
      const filtered = prev.filter(i => i.cellAddress !== newInput.cellAddress);
      const newInputs = [...filtered, newInput];
      saveConfigToDocument(newInputs, outputs, globalSettings);
      return newInputs;
    });
    await addNamedRange(newInput.id, newInput.cellAddress);
    await highlightCell(newInput.cellAddress, '#d4edda'); // Light green
  };

  const handleAddOutput = async (newOutput: VariableOutput) => {
    setOutputs(prev => {
      const filtered = prev.filter(o => o.cellAddress !== newOutput.cellAddress);
      const newOutputs = [...filtered, newOutput];
      saveConfigToDocument(inputs, newOutputs, globalSettings);
      return newOutputs;
    });
    await addNamedRange(newOutput.id, newOutput.cellAddress);
    await highlightCell(newOutput.cellAddress, '#f8d7da'); // Light red/pink
  };

  const handleRemoveInput = async (id: string) => {
    const inputToRemove = inputs.find(i => i.id === id);
    setInputs(prev => {
      const newInputs = prev.filter(i => i.id !== id);
      saveConfigToDocument(newInputs, outputs, globalSettings);
      return newInputs;
    });
    if (inputToRemove) await clearCellFormat(inputToRemove.cellAddress, inputToRemove.id);
    await removeNamedRange(id);
  };

  const handleRemoveOutput = async (id: string) => {
    const outputToRemove = outputs.find(o => o.id === id);
    setOutputs(prev => {
      const newOutputs = prev.filter(o => o.id !== id);
      saveConfigToDocument(inputs, newOutputs, globalSettings);
      return newOutputs;
    });
    if (outputToRemove) await clearCellFormat(outputToRemove.cellAddress, outputToRemove.id);
    await removeNamedRange(id);
  };

  const handleRunSimulation = async () => {
    const iterations = globalSettings.iterations || 1000;
    setIsRunning(true);
    setSimulationData(null);

    // Set the random seed if specified, otherwise use a random seed to ensure uniqueness per run
    if (globalSettings.seed !== undefined) {
      setSeed(globalSettings.seed);
    } else {
      setSeed(Math.floor(Math.random() * 2147483647));
    }

    try {
      const results = await runMonteCarloSimulation(
        inputs,
        outputs,
        iterations,
        (prog) => {
          setProgress(prog.iteration / prog.total);
        }
      );
      setSimulationData(results);
      setSimulationError(null);
      setActiveTab('results'); // Auto-switch to results tab
    } catch (err: any) {
      console.error("Error executing simulation:", err);
      setSimulationError(err.message || String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setSimulationData(null);
    setActiveTab('config');
  };

  const handleInjectAsInput = async (distType: string, params: any) => {
    try {
      const cell = await getSelectedCell();
      
      let internalDistType = distType.toLowerCase();
      // Map display names to internal type IDs
      if (distType === 'Normal') internalDistType = 'normal';
      if (distType === 'Lognormal') internalDistType = 'lognormal';
      if (distType === 'Uniforme') internalDistType = 'uniform';
      if (distType === 'Triangular') internalDistType = 'triangular';

      let type: VariableInput['type'] = internalDistType as any;
      let initialValue: number | string = 0;
      
      // Use static expected values instead of custom function formulas
      // to avoid #NAME? or #¿NOMBRE? errors in Excel Online
      if (type === 'normal' || type === 'lognormal') initialValue = params.mean || 0;
      else if (type === 'uniform') initialValue = ((params.min || 0) + (params.max || 0)) / 2;
      else if (type === 'triangular' || type === 'pert') initialValue = params.mostLikely || 0;
      else if (type === 'bernoulli') initialValue = params.probability || 0;
      else if (type === 'poisson') initialValue = Math.round(params.lambda || 0);
      else if (type === 'binomial') initialValue = Math.round((params.trials || 0) * (params.probability || 0));
      else if (type === 'discrete_uniform') initialValue = Math.round(((params.min || 0) + (params.max || 0)) / 2);
      else if (type === 'custom_discrete') initialValue = params.discreteValues?.[0]?.value || 0;

      const newId = 'input_' + Date.now();
      const newInput: VariableInput = {
        id: newId,
        name: `Var_${cell.address.split('!').pop()}`,
        cellAddress: cell.address,
        type: type,
        params: params,
        currentValue: initialValue
      };
      
      // Escribir solo el valor esperado
      await writeCellValue(cell.address, initialValue);
      await handleAddInput(newInput);
      
      setActiveTab('config');
    } catch (err) {
      console.error("Error al inyectar como entrada", err);
    }
  };

  return (
    <div className="app-container">
      <Header excelReady={excelReady} />
      
      {/* Tab Navigation */}
      {/* Menú de Navegación (Selector) */}
      <div style={{ padding: '0 4px', marginBottom: '16px' }}>
        <div style={{ position: 'relative' }}>
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value as Tab)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: '0.95rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'white',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              appearance: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              fontWeight: 500
            }}
          >
            <option value="config">🔧 Definición del Modelo (Variables)</option>
            <option value="fitting">🪄 Ajuste de Datos (Data Fitting)</option>
            <option value="simulate">▶️ Ejecutar Simulación</option>
            <option value="results" disabled={!simulationData && !isRunning}>📊 Análisis de Resultados</option>
            <option value="settings">⚙️ Ajustes Globales</option>
            <option value="help">📖 Documentación y Ayuda</option>
          </select>
          <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>
            ▼
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'config' && (
          <VariableConfig
            inputs={inputs}
            outputs={outputs}
            onAddInput={handleAddInput}
            onAddOutput={handleAddOutput}
            onRemoveInput={handleRemoveInput}
            onRemoveOutput={handleRemoveOutput}
          />
        )}

        {activeTab === 'simulate' && (
          <SimulationControl
            inputs={inputs}
            outputs={outputs}
            isRunning={isRunning}
            progress={progress}
            error={simulationError}
            globalIterations={globalSettings.iterations || 1000}
            onRunSimulation={handleRunSimulation}
            onReset={() => setSimulationData(null)}
            hasResults={!!simulationData}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'fitting' && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FittingTool onInject={handleInjectAsInput} />
          </div>
        )}

        {activeTab === 'results' && (
          <ResultsDashboard
            inputs={inputs}
            outputs={outputs}
            simulationData={simulationData}
            onInjectAsInput={handleInjectAsInput}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            settings={globalSettings}
            onSaveSettings={handleSaveSettings}
          />
        )}

        {activeTab === 'help' && (
          <HelpDocs />
        )}
        {activeTab === 'reportInputs' && (
          <ReportView type="inputs" inputs={inputs} outputs={outputs} />
        )}
        {activeTab === 'reportOutputs' && (
          <ReportView type="outputs" inputs={inputs} outputs={outputs} />
        )}
      </div>
    </div>
  );
}

export default App;

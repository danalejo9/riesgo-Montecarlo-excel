/// <reference types="office-js" />
/* global Excel, Office */
import type { VariableInput, VariableOutput } from '../utils/mathUtils';
import { sampleDistribution, analyzeResults, calculateCorrelation } from '../utils/mathUtils';

// Helper to determine if we are running inside Excel
export function isOfficeInitialized(): boolean {
  return typeof Office !== 'undefined' && Office.context !== undefined;
}

// Wait for Office to be ready
export function initializeOffice(): Promise<void> {
  return new Promise((resolve) => {
    if (isOfficeInitialized()) {
      resolve();
    } else {
      // Office.onReady will fire when the Office.js library is loaded and ready
      if (typeof Office !== 'undefined') {
        Office.onReady(() => {
          resolve();
        });
      } else {
        // Fallback for browser testing (not inside Excel)
        console.warn("Office.js not found. Running in browser fallback mode.");
        resolve();
      }
    }
  });
}

export interface ExcelCellInfo {
  address: string;
  value: number | string;
  formula: string;
}

// Get details of the currently selected cell
export async function getSelectedCell(): Promise<ExcelCellInfo> {
  if (!isOfficeInitialized()) {
    // Mock for browser testing
    return {
      address: 'Sheet1!B5',
      value: 120,
      formula: '120'
    };
  }

  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(['address', 'values', 'formulas']);
    await context.sync();

    // Clean address (e.g. Sheet1!A1 instead of just A1 if we can, or we can use active sheet)
    const activeSheet = context.workbook.worksheets.getActiveWorksheet();
    activeSheet.load('name');
    await context.sync();

    const address = `${activeSheet.name}!${range.address.split('!').pop()}`;
    const value = range.values[0][0];
    const formula = range.formulas[0][0];

    return {
      address,
      value: typeof value === 'number' ? value : 0,
      formula: String(formula)
    };
  });
}

// Writes a value to a cell address
export async function writeCellValue(address: string, value: number | string): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    const sheetName = address.split('!')[0].replace(/^'|'$/g, '');
    const cellRange = address.split('!')[1];
    const sheet = context.workbook.worksheets.getItem(sheetName);
    const range = sheet.getRange(cellRange);
    if (typeof value === 'string' && value.startsWith('=')) {
      range.formulas = [[value]];
    } else {
      range.values = [[value]];
    }
    await context.sync();
  });
}

// Colorize a cell
export async function highlightCell(address: string, color: string): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    const parts = address.split('!');
    const sheetName = parts[0].replace(/^'|'$/g, '');
    const cellRange = parts[1];
    const sheet = context.workbook.worksheets.getItem(sheetName);
    const range = sheet.getRange(cellRange);
    range.format.fill.color = color;
    await context.sync();
  });
}

// Create a hidden named range
export async function addNamedRange(id: string, address: string): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    const parts = address.split('!');
    const sheetName = parts[0].replace(/^'|'$/g, '');
    const cellRange = parts[1];
    const sheet = context.workbook.worksheets.getItem(sheetName);
    const range = sheet.getRange(cellRange);
    
    const safeId = id.replace(/[^a-zA-Z0-9_]/g, '');
    const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
    
    // Delete if exists
    const existing = context.workbook.names.getItemOrNullObject(nameStr);
    existing.load("name");
    await context.sync();
    if (!existing.isNullObject) {
      existing.delete();
      await context.sync();
    }
    
    const namedItem = context.workbook.names.add(nameStr, range);
    namedItem.visible = false;
    await context.sync();
  });
}

// Remove named range
export async function removeNamedRange(id: string): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    const safeId = id.replace(/[^a-zA-Z0-9_]/g, '');
    const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
    const namedItem = context.workbook.names.getItemOrNullObject(nameStr);
    namedItem.load("name");
    await context.sync();
    if (!namedItem.isNullObject) {
      namedItem.delete();
      await context.sync();
    }
  });
}

// Get the actual address of a named range
export async function getNamedRangeAddress(id: string): Promise<string | null> {
  if (!isOfficeInitialized()) return null;
  return Excel.run(async (context) => {
    const safeId = id.replace(/[^a-zA-Z0-9_]/g, '');
    const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
    const namedItem = context.workbook.names.getItemOrNullObject(nameStr);
    namedItem.load("type");
    await context.sync();
    
    if (!namedItem.isNullObject) {
      const range = namedItem.getRange();
      range.load(['address', 'worksheet']);
      await context.sync();
      
      range.worksheet.load('name');
      await context.sync();
      
      return `${range.worksheet.name}!${range.address.split('!').pop()}`;
    }
    return null;
  });
}

// Clear highlight from cell
export async function clearCellFormat(cellAddress: string, id?: string): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    try {
      let range: Excel.Range;
      if (id) {
        const safeId = id.replace(/[^a-zA-Z0-9_]/g, '');
        const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
        const namedItem = context.workbook.names.getItemOrNullObject(nameStr);
        namedItem.load("type");
        await context.sync();
        if (!namedItem.isNullObject) {
          range = namedItem.getRange();
        }
      }
      
      if (!range) {
        const parts = cellAddress.split('!');
        const sheetName = parts[0].replace(/'/g, '');
        const cellRange = parts[1];
        range = context.workbook.worksheets.getItem(sheetName).getRange(cellRange);
      }
      
      range.format.fill.clear();
      await context.sync();
    } catch(e) {}
  });
}

// Export inputs to a new Excel sheet
export async function exportInputsToExcel(inputs: VariableInput[]): Promise<void> {
  if (!isOfficeInitialized() || inputs.length === 0) return;
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.add("Reporte_Entradas_" + Math.floor(Math.random() * 1000));
    
    sheet.getRangeByIndexes(0, 0, 1, 4).values = [["Variable de Entrada", "Celda", "Distribución", "Parámetros"]];
    sheet.getRangeByIndexes(0, 0, 1, 4).format.font.bold = true;
    
    let row = 1;
    for (const input of inputs) {
      sheet.getRangeByIndexes(row, 0, 1, 4).values = [[
        input.name,
        input.cellAddress,
        input.type,
        JSON.stringify(input.params)
      ]];
      row++;
    }
    
    sheet.getRange().format.autofitColumns();
    sheet.activate();
    await context.sync();
  });
}

// Export outputs to a new Excel sheet
export async function exportOutputsToExcel(outputs: VariableOutput[]): Promise<void> {
  if (!isOfficeInitialized() || outputs.length === 0) return;
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.add("Reporte_Salidas_" + Math.floor(Math.random() * 1000));
    
    sheet.getRangeByIndexes(0, 0, 1, 2).values = [["Variable de Salida", "Celda"]];
    sheet.getRangeByIndexes(0, 0, 1, 2).format.font.bold = true;
    
    let row = 1;
    for (const output of outputs) {
      sheet.getRangeByIndexes(row, 0, 1, 2).values = [[
        output.name,
        output.cellAddress
      ]];
      row++;
    }
    
    sheet.getRange().format.autofitColumns();
    sheet.activate();
    await context.sync();
  });
}

export interface GlobalSettings {
  iterations: number;
  seed?: number;
}

// Save configuration to document metadata
export async function saveConfigToDocument(inputs: VariableInput[], outputs: VariableOutput[], globalSettings?: GlobalSettings): Promise<void> {
  if (!isOfficeInitialized()) return;
  return Excel.run(async (context) => {
    // preserve old globalSettings if none provided
    let settingsToSave = globalSettings;
    if (!settingsToSave) {
      const existingSettings = context.workbook.settings.getItemOrNullObject("MonteCarloConfig");
      existingSettings.load("value");
      await context.sync();
      if (!existingSettings.isNullObject) {
        try {
          const parsed = JSON.parse(existingSettings.value as string);
          settingsToSave = parsed.globalSettings;
        } catch(e){}
      }
    }
    const config = { inputs, outputs, globalSettings: settingsToSave || { iterations: 1000 } };
    context.workbook.settings.add("MonteCarloConfig", JSON.stringify(config));
    await context.sync();
  });
}

// Load configuration from document metadata
export async function loadConfigFromDocument(): Promise<{ inputs: VariableInput[], outputs: VariableOutput[], globalSettings: GlobalSettings } | null> {
  if (!isOfficeInitialized()) return null;
  return Excel.run(async (context) => {
    const settings = context.workbook.settings;
    const configSetting = settings.getItemOrNullObject("MonteCarloConfig");
    configSetting.load("value");
    await context.sync();
    
    if (configSetting.isNullObject) return null;
    try {
      const parsed = JSON.parse(configSetting.value as string);
      return {
        inputs: parsed.inputs || [],
        outputs: parsed.outputs || [],
        globalSettings: parsed.globalSettings || { iterations: 1000 }
      };
    } catch {
      return null;
    }
  });
}

export interface MonteCarloRunProgress {
  iteration: number;
  total: number;
  currentOutputs: { [outputId: string]: number };
}

// Executes the Monte Carlo Simulation loop
export async function runMonteCarloSimulation(
  inputs: VariableInput[],
  outputs: VariableOutput[],
  iterations: number,
  onProgress: (progress: MonteCarloRunProgress) => void
): Promise<{ outputs: { [outputId: string]: number[] }, inputs: { [inputId: string]: number[] } }> {
  const results: { [outputId: string]: number[] } = {};
  outputs.forEach(out => {
    results[out.id] = [];
  });
  
  const inputSamples: { [inputId: string]: number[] } = {};

  if (!isOfficeInitialized()) {
    // Browser Mock Simulation
    for (let i = 0; i < iterations; i++) {
      // Sample inputs
      const sampleValues: { [key: string]: number } = {};
      inputs.forEach(input => {
        const val = sampleDistribution(input.type, input.params);
        sampleValues[input.id] = val;
        if (!inputSamples[input.id]) inputSamples[input.id] = [];
        inputSamples[input.id].push(val);
      });

      // Calculate mock outputs (let's assume output is just the sum of inputs + some random noise)
      const currentOutputs: { [outputId: string]: number } = {};
      outputs.forEach(out => {
        const base = Object.values(sampleValues).reduce((sum, val) => sum + val, 0);
        // Add some noise to make outputs interesting
        currentOutputs[out.id] = base * (1 + (Math.random() - 0.5) * 0.1);
        results[out.id].push(currentOutputs[out.id]);
      });

      if (i % Math.ceil(iterations / 20) === 0 || i === iterations - 1) {
        onProgress({ iteration: i + 1, total: iterations, currentOutputs });
        // Small delay for UI reactivity
        await new Promise(r => setTimeout(r, 10));
      }
    }
    return { outputs: results, inputs: inputSamples };
  }

  // Real Excel Monte Carlo Simulation
  return Excel.run(async (context) => {
    // 1. Get references to sheets and ranges (Dynamic via NamedRanges with Fallback)
    const inputRangesRaw = inputs.map(input => {
      const safeId = input.id.replace(/[^a-zA-Z0-9_]/g, '');
      const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
      const namedItem = context.workbook.names.getItemOrNullObject(nameStr);
      namedItem.load(['type']);
      return { input, namedItem, nameStr };
    });

    const outputRangesRaw = outputs.map(output => {
      const safeId = output.id.replace(/[^a-zA-Z0-9_]/g, '');
      const nameStr = safeId.match(/^[a-zA-Z_]/) ? safeId : `MC_${safeId}`;
      const namedItem = context.workbook.names.getItemOrNullObject(nameStr);
      namedItem.load(['type']);
      return { output, namedItem, nameStr };
    });

    await context.sync();

    const inputRanges = inputRangesRaw.map(({input, namedItem}) => {
      let range: Excel.Range;
      if (!namedItem.isNullObject) {
        range = namedItem.getRange();
      } else {
        const parts = input.cellAddress.split('!');
        const sheetName = parts[0].replace(/^'|'$/g, '');
        const cellRange = parts[1];
        range = context.workbook.worksheets.getItem(sheetName).getRange(cellRange);
      }
      range.load(['values']);
      return { id: input.id, range, originalValue: input.currentValue };
    });

    const outputRanges = outputRangesRaw.map(({output, namedItem}) => {
      let range: Excel.Range;
      if (!namedItem.isNullObject) {
        range = namedItem.getRange();
      } else {
        const parts = output.cellAddress.split('!');
        const sheetName = parts[0].replace(/^'|'$/g, '');
        const cellRange = parts[1];
        range = context.workbook.worksheets.getItem(sheetName).getRange(cellRange);
      }
      range.load(['values']);
      return { id: output.id, range };
    });

    await context.sync();

    let originalCalcMode: Excel.CalculationMode | null = null;
    let tempSheetName = `MCTemp_${new Date().getTime()}`;
    const precalculatedSamples: { [inputId: string]: number[] } = {};

    try {
      // Delete any leftover temp sheets just in case
      context.workbook.worksheets.load("items/name");
      await context.sync();
      const existingSheet = context.workbook.worksheets.items.find(s => s.name === tempSheetName);
      if (existingSheet) {
        existingSheet.delete();
        await context.sync();
      }

      // Create temporary sheet to store all results
      const tempSheet = context.workbook.worksheets.add(tempSheetName);
      tempSheet.visibility = Excel.SheetVisibility.hidden;

      // Save original calculation mode and set to manual for speed
      context.workbook.application.load("calculationMode");
      await context.sync();
      originalCalcMode = context.workbook.application.calculationMode as Excel.CalculationMode;
      
      context.workbook.application.calculationMode = Excel.CalculationMode.manual;
      await context.sync();

      // Pre-calculate all random samples in JavaScript memory
      inputs.forEach(input => {
        precalculatedSamples[input.id] = [];
        for (let i = 0; i < iterations; i++) {
          precalculatedSamples[input.id].push(sampleDistribution(input.type, input.params));
        }
      });

      // Report initial progress
      onProgress({ iteration: 0, total: iterations, currentOutputs: {} });

        // Process loop with chunked syncs to maintain high performance while avoiding payload limits
        const BATCH_SIZE = 250; // Batch operations to prevent timeout and reduce network calls
        for (let i = 0; i < iterations; i++) {
          context.workbook.application.suspendScreenUpdatingUntilNextSync();
          
          // A. Set inputs
          inputs.forEach((input, idx) => {
            inputRanges[idx].range.values = [[ precalculatedSamples[input.id][i] ]];
          });

          // B. Calculate
          context.workbook.application.calculate(Excel.CalculationType.full);

          // C. Copy outputs to temp sheet
          outputs.forEach((_, idx) => {
            const destCell = tempSheet.getCell(i, idx);
            destCell.copyFrom(outputRanges[idx].range, Excel.RangeCopyType.values);
          });

          // D. Sync in batches to ensure calculation finishes without freezing the API
          if ((i + 1) % BATCH_SIZE === 0 || i === iterations - 1) {
            await context.sync();
            onProgress({ iteration: i + 1, total: iterations, currentOutputs: {} });
            // Yield to browser UI thread to update progress bar
            await new Promise(r => setTimeout(r, 10));
          }
        }
      
      // Load all results at once
      const resultsRange = tempSheet.getRangeByIndexes(0, 0, iterations, outputs.length);
      resultsRange.load("values");
      await context.sync();

      const finalValues = resultsRange.values;

      // Map values back to our results object
      for (let i = 0; i < iterations; i++) {
        outputs.forEach((output, idx) => {
          const val = finalValues[i][idx];
          const numericVal = typeof val === 'number' ? val : 0;
          results[output.id].push(numericVal);
        });
      }

      // Report 100% completion
      const finalCurrentOutputs: { [outputId: string]: number } = {};
      outputs.forEach((output, idx) => {
        const val = finalValues[iterations - 1][idx];
        finalCurrentOutputs[output.id] = typeof val === 'number' ? val : 0;
      });
      onProgress({ iteration: iterations, total: iterations, currentOutputs: finalCurrentOutputs });

      // Delete temp sheet
      tempSheet.delete();

    } finally {
      // Restore inputs
      inputRanges.forEach((inputRange) => {
        inputRange.range.values = [[inputRange.originalValue]];
      });
      context.workbook.application.calculate("Full");
      
      // Restore calculation mode
      if (originalCalcMode) {
        context.workbook.application.calculationMode = originalCalcMode;
      }
      
      await context.sync();
    }

    return { outputs: results, inputs: precalculatedSamples };
  });
}

// Exports a detailed statistical report sheet directly inside the Excel workbook
export async function exportReportToExcel(
  simulationData: { outputs: { [outputId: string]: number[] }, inputs: { [inputId: string]: number[] } },
  inputs: VariableInput[],
  outputs: VariableOutput[]
): Promise<void> {
  if (!isOfficeInitialized()) {
    console.log("Mock Exporting Report to Excel", { simulationData });
    alert("Reporte exportado con éxito (Simulación en Navegador)");
    return;
  }

  return Excel.run(async (context) => {
    const sheets = context.workbook.worksheets;
    
    // --- 1. HOJA RESUMEN ---
    const summarySheetName = `Resumen_MC`;
    sheets.load('items');
    await context.sync();
    let summarySheet = sheets.items.find(s => s.name === summarySheetName);
    if (summarySheet) summarySheet.delete();
    
    summarySheet = sheets.add(summarySheetName);
    
    const titleRange = summarySheet.getRange("A1:D1");
    titleRange.values = [[`Reporte Ejecutivo - Simulación Monte Carlo`, "", "", ""]];
    titleRange.merge();
    titleRange.format.font.bold = true;
    titleRange.format.font.size = 18;
    titleRange.format.font.color = "#0F172A";

    const subRange = summarySheet.getRange("A2:D2");
    subRange.values = [[`Generado el: ${new Date().toLocaleString()} | Iteraciones: ${simulationData.outputs[outputs[0].id]?.length || 0}`, "", "", ""]];
    subRange.merge();
    subRange.format.font.italic = true;
    
    // Variables de Salida Resumen
    summarySheet.getRange("A4").values = [["Resumen de Salidas"]];
    summarySheet.getRange("A4").format.font.bold = true;
    summarySheet.getRange("A4").format.font.size = 14;
    
    const outHeaders = summarySheet.getRange("A5:H5");
    outHeaders.values = [["Nombre Variable", "Celda", "Media Esperada", "Mínimo", "P10", "P50 (Mediana)", "P90", "Máximo"]];
    outHeaders.format.font.bold = true;
    outHeaders.format.fill.color = "#4F46E5";
    outHeaders.format.font.color = "#FFFFFF";
    
    let currentRow = 6;
    outputs.forEach(out => {
      const data = simulationData.outputs[out.id];
      const stats = analyzeResults(data);
      
      const calculatePercentile = (sortedData: number[], p: number) => {
        if (sortedData.length === 0) return 0;
        const index = (p / 100) * (sortedData.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper >= sortedData.length) return sortedData[lower];
        return sortedData[lower] * (1 - weight) + sortedData[upper] * weight;
      };

      const p10 = calculatePercentile(stats.dataPoints, 10);
      const p50 = calculatePercentile(stats.dataPoints, 50);
      const p90 = calculatePercentile(stats.dataPoints, 90);

      summarySheet.getRange(`A${currentRow}:H${currentRow}`).values = [
        [out.name, out.cellAddress, stats.mean, stats.min, p10, p50, p90, stats.max]
      ];
      currentRow++;
    });
    
    summarySheet.getRange(`C6:H${currentRow - 1}`).numberFormat = [["#,##0.00"]];
    
    // Variables de Entrada Resumen
    currentRow += 2;
    summarySheet.getRange(`A${currentRow}`).values = [["Resumen de Entradas Simuladas"]];
    summarySheet.getRange(`A${currentRow}`).format.font.bold = true;
    summarySheet.getRange(`A${currentRow}`).format.font.size = 14;
    
    const inHeaders = summarySheet.getRange(`A${currentRow+1}:E${currentRow+1}`);
    inHeaders.values = [["Nombre Variable", "Celda", "Distribución Teórica", "Media Muestreada", "Desv. Estándar"]];
    inHeaders.format.font.bold = true;
    inHeaders.format.fill.color = "#10B981";
    inHeaders.format.font.color = "#FFFFFF";
    
    let inRow = currentRow + 2;
    inputs.forEach(inp => {
      const data = simulationData.inputs[inp.id];
      if (data && data.length > 0) {
        const stats = analyzeResults(data);
        summarySheet.getRange(`A${inRow}:E${inRow}`).values = [
          [inp.name, inp.cellAddress, inp.type, stats.mean, stats.stdDev]
        ];
        inRow++;
      }
    });
    summarySheet.getRange(`D${currentRow+2}:E${inRow - 1}`).numberFormat = [["#,##0.00"]];
    
    summarySheet.getUsedRange().format.autofitColumns();

    // --- GRÁFICO DE TORNADO (Sensibilidad para la primera Salida) ---
    if (outputs.length > 0 && inputs.length > 0) {
      const primaryOutput = outputs[0];
      const outData = simulationData.outputs[primaryOutput.id];
      if (outData) {
        // Calcular correlación con todas las entradas
        const sensitivities = inputs.map(inp => {
          const inData = simulationData.inputs[inp.id];
          let corr = 0;
          if (inData && inData.length === outData.length) {
            corr = calculateCorrelation(inData, outData);
          }
          return { name: inp.name, correlation: corr };
        });

        // Ordenar por valor absoluto de mayor a menor impacto
        sensitivities.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));

        // Preparar datos en Excel
        const tornadoStartCol = "J";
        const tornadoRow = 4;
        
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow}`).values = [[`Sensibilidad de: ${primaryOutput.name}`]];
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow}`).format.font.bold = true;
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow}`).format.font.size = 14;

        summarySheet.getRange(`${tornadoStartCol}${tornadoRow+1}:K${tornadoRow+1}`).values = [["Variable", "Correlación (Impacto)"]];
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow+1}:K${tornadoRow+1}`).format.font.bold = true;
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow+1}:K${tornadoRow+1}`).format.fill.color = "#F59E0B";
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow+1}:K${tornadoRow+1}`).format.font.color = "#FFFFFF";

        const tornadoData = sensitivities.map(s => [s.name, s.correlation]);
        summarySheet.getRange(`${tornadoStartCol}${tornadoRow+2}:K${tornadoRow+1+tornadoData.length}`).values = tornadoData;

        // Crear Gráfico BarClustered
        const chartDataRange = summarySheet.getRange(`K${tornadoRow+1}:K${tornadoRow+1+tornadoData.length}`);
        const tornadoChart = summarySheet.charts.add(Excel.ChartType.barClustered, chartDataRange, Excel.ChartSeriesBy.columns);
        
        const catRange = summarySheet.getRange(`${tornadoStartCol}${tornadoRow+2}:${tornadoStartCol}${tornadoRow+1+tornadoData.length}`);
        tornadoChart.axes.categoryAxis.setCategoryNames(catRange);
        
        tornadoChart.title.text = `Gráfico de Tornado (Sensibilidad)`;
        tornadoChart.legend.visible = false;
        tornadoChart.setPosition("M4", "U20");
      }
    }

    summarySheet.activate();

    // Helper to create detailed sheets with charts
    const createDetailSheet = async (name: string, address: string, data: number[], isInput: boolean) => {
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
      const sheetName = `${isInput ? 'IN' : 'OUT'}_${safeName}`;
      
      let detailSheet = sheets.items.find(s => s.name === sheetName);
      if (detailSheet) detailSheet.delete();
      detailSheet = sheets.add(sheetName);
      
      const stats = analyzeResults(data);
      
      detailSheet.getRange("A1").values = [[`${isInput ? 'Variable de Entrada' : 'Variable de Salida'}: ${name}`]];
      detailSheet.getRange("A1").format.font.bold = true;
      detailSheet.getRange("A1").format.font.size = 14;
      detailSheet.getRange("A2").values = [[`Celda: ${address}`]];
      
      // Histograma Data
      detailSheet.getRange("A4:B4").values = [["Rango (>=)", "Frecuencia"]];
      detailSheet.getRange("A4:B4").format.font.bold = true;
      detailSheet.getRange("A4:B4").format.fill.color = isInput ? "#10B981" : "#4F46E5";
      detailSheet.getRange("A4:B4").format.font.color = "#FFFFFF";
      
      const histData = stats.histogram.map(bin => [bin.binStart, bin.count]);
      detailSheet.getRange(`A5:B${4 + histData.length}`).values = histData;
      detailSheet.getRange(`A5:A${4 + histData.length}`).numberFormat = [["#,##0.00"]];
      
      // Chart
      const chartRange = detailSheet.getRange(`B4:B${4 + histData.length}`);
      const chart = detailSheet.charts.add(Excel.ChartType.columnClustered, chartRange, Excel.ChartSeriesBy.columns);
      const catRange = detailSheet.getRange(`A5:A${4 + histData.length}`);
      chart.axes.categoryAxis.setCategoryNames(catRange);
      chart.title.text = `Distribución - ${name}`;
      chart.legend.visible = false;
      chart.setPosition("D4", "M20");
      
      detailSheet.getUsedRange().format.autofitColumns();
    };

    // --- 2. HOJAS DE SALIDAS ---
    for (const out of outputs) {
      if (simulationData.outputs[out.id]) {
        await createDetailSheet(out.name, out.cellAddress, simulationData.outputs[out.id], false);
      }
    }

    // --- 3. HOJAS DE ENTRADAS ---
    for (const inp of inputs) {
      if (simulationData.inputs[inp.id]) {
        await createDetailSheet(inp.name, inp.cellAddress, simulationData.inputs[inp.id], true);
      }
    }

    await context.sync();
  });
}

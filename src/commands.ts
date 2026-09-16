import { loadConfigFromDocument, saveConfigToDocument, highlightCell } from './services/excelService';

Office.onReady(() => {
  console.log("Comandos Headless cargados");
});

// Acción para Definir Entrada Rápida
async function addInputQuick(event: Office.AddinCommands.Event) {
  try {
    let cellAddress = '';
    let cellValue = 0;
    
    await Excel.run(async (context) => {
      const cell = context.workbook.getActiveCell();
      cell.load(["address", "values"]);
      await context.sync();
      cellAddress = cell.address;
      cellValue = cell.values[0][0];
      if (typeof cellValue !== 'number') {
        cellValue = parseFloat(cellValue) || 0;
      }
    });

    const dialogUrl = `${window.location.origin}/dialog.html?address=${encodeURIComponent(cellAddress)}&value=${encodeURIComponent(cellValue)}`;
    
    Office.context.ui.displayDialogAsync(dialogUrl, { height: 50, width: 30, displayInIframe: true }, (asyncResult) => {
      if (asyncResult.status === Office.AsyncResultStatus.Failed) {
        console.error("Error abriendo diálogo", asyncResult.error.message);
        event.completed();
        return;
      }

      const dialog = asyncResult.value;
      
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, async (arg: any) => {
        const message = JSON.parse(arg.message);
        dialog.close();
        
        if (message.action === 'saveInput') {
          await processNewInput({ ...message.data, address: cellAddress, value: cellValue });
        }
        event.completed();
      });

      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
        event.completed();
      });
    });
  } catch (error) {
    console.error(error);
    event.completed();
  }
}

// Lógica para guardar la variable en la configuración sin inyectar fórmula
async function processNewInput(data: any) {
  try {
    const config = await loadConfigFromDocument();
    const inputs = config ? config.inputs : [];
    const outputs = config ? config.outputs : [];
    const globalSettings = config ? config.globalSettings : undefined;

    // Remove old input if it existed in the same cell
    const newInputs = inputs.filter(i => i.cellAddress !== data.address);
    
    const newVariable = {
      id: `input_${Date.now()}`,
      name: `Entrada_${data.address.split('!').pop()}`,
      cellAddress: data.address,
      type: data.type,
      params: data.params,
      currentValue: data.value
    };
    
    newInputs.push(newVariable);
    
    await saveConfigToDocument(newInputs, outputs, globalSettings);
    
    await Excel.run(async (context) => {
      // Resaltar en verde
      await highlightCell(data.address, '#D1FAE5'); // Verde claro
      await context.sync();
    });
  } catch (error) {
    console.error(error);
  }
}

// Acción para Definir Salida Rápida (Sin Dialog)
async function addOutputQuick(event: Office.AddinCommands.Event) {
  try {
    let cellAddress = '';
    
    await Excel.run(async (context) => {
      const cell = context.workbook.getActiveCell();
      cell.load("address");
      await context.sync();
      cellAddress = cell.address;
      
      // Resaltar en rojo (salida)
      await highlightCell(cell.address, '#FEE2E2');
      await context.sync();
    });
    
    // Guardar en configuración
    const config = await loadConfigFromDocument();
    const inputs = config ? config.inputs : [];
    const outputs = config ? config.outputs : [];
    const globalSettings = config ? config.globalSettings : undefined;

    const newOutputs = outputs.filter(o => o.cellAddress !== cellAddress);
    newOutputs.push({
      id: `output_${Date.now()}`,
      name: `Salida_${cellAddress.split('!').pop()}`,
      cellAddress: cellAddress,
      currentValue: 0
    });

    await saveConfigToDocument(inputs, newOutputs, globalSettings);

  } catch (error) {
    console.error(error);
  } finally {
    event.completed();
  }
}


// Acción para Abrir la Herramienta de Ajuste (Fallback para caché)
async function openFittingTool(event: Office.AddinCommands.Event) {
  try {
    if (Office.addin && Office.addin.showAsTaskpane) {
      Office.addin.showAsTaskpane().catch(err => console.error(err));
    }
    // Forzar el cambio de pestaña a través de los settings
    Office.context.document.settings.set("forceTab", "fitting");
    // Usar una marca de tiempo para forzar que el evento se dispare siempre
    Office.context.document.settings.set("forceTabTime", Date.now());
    Office.context.document.settings.saveAsync();
  } catch (error) {
    console.error(error);
  } finally {
    event.completed();
  }
}

// Acción para Resaltar Celdas de Entradas y Salidas
async function highlightAllCells(event: Office.AddinCommands.Event) {
  try {
    const config = await loadConfigFromDocument();
    if (config) {
      await Excel.run(async (context) => {
        for (const input of config.inputs) {
          const sheetName = input.cellAddress.split('!')[0].replace(/'/g, '');
          const cellRef = input.cellAddress.split('!')[1];
          const cell = context.workbook.worksheets.getItem(sheetName).getRange(cellRef);
          cell.format.fill.color = '#D1FAE5'; // Verde claro
        }
        for (const output of config.outputs) {
          const sheetName = output.cellAddress.split('!')[0].replace(/'/g, '');
          const cellRef = output.cellAddress.split('!')[1];
          const cell = context.workbook.worksheets.getItem(sheetName).getRange(cellRef);
          cell.format.fill.color = '#FEE2E2'; // Rojo claro
        }
        await context.sync();
      });
    }
  } catch (error) {
    console.error(error);
  } finally {
    event.completed();
  }
}

// Registrar funciones
(window as any).addInputQuick = addInputQuick;
(window as any).addOutputQuick = addOutputQuick;
(window as any).openFittingTool = openFittingTool;
(window as any).highlightAllCells = highlightAllCells;

if (typeof Office !== 'undefined' && Office.actions) {
  Office.actions.associate("addInputQuick", addInputQuick);
  Office.actions.associate("addOutputQuick", addOutputQuick);
  Office.actions.associate("openFittingTool", openFittingTool);
  Office.actions.associate("highlightAllCells", highlightAllCells);
}

// Ejecutar eventos pendientes si Office llamó a los stubs globales antes de que este módulo cargara
setTimeout(() => {
  if ((window as any).addInputQuickEvent) {
    addInputQuick((window as any).addInputQuickEvent);
    delete (window as any).addInputQuickEvent;
  }
  if ((window as any).addOutputQuickEvent) {
    addOutputQuick((window as any).addOutputQuickEvent);
    delete (window as any).addOutputQuickEvent;
  }
  if ((window as any).openFittingToolEvent) {
    openFittingTool((window as any).openFittingToolEvent);
    delete (window as any).openFittingToolEvent;
  }

  if ((window as any).highlightAllCellsEvent) {
    highlightAllCells((window as any).highlightAllCellsEvent);
    delete (window as any).highlightAllCellsEvent;
  }
}, 100);

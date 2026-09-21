/**
 * Acciones de la cinta que no abren el panel.
 *
 * Todavía no hay ninguna: el único botón del manifiesto usa `ShowTaskpane`.
 * El archivo existe porque `FunctionFile` apunta a `commands.html` y Office
 * carga esa página al iniciar el complemento.
 */

Office.onReady(() => {
  // Cuando haya acciones directas (marcar la celda activa como entrada, por
  // ejemplo) se registran aquí con `Office.actions.associate`.
});

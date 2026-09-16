import React from 'react';
import { BookOpen, Info, Target, TrendingUp, ShieldCheck } from 'lucide-react';

export const HelpDocs: React.FC = () => {
  return (
    <div className="card animate-fade-in" style={{ gap: '16px', overflowY: 'auto', maxHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <BookOpen size={20} color="var(--accent-primary)" />
        <h2 style={{ margin: 0 }}>Documentación y Ayuda</h2>
      </div>

      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <p style={{ marginBottom: '12px' }}>
          Bienvenido al <strong>Motor de Simulación Monte Carlo</strong> para Excel. Este complemento te permite evaluar el riesgo financiero, simular escenarios probabilísticos y generar reportes ejecutivos.
        </p>

        <h3 style={{ color: 'var(--text-primary)', marginTop: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Target size={14} /> 1. ¿Cómo Funciona?
        </h3>
        <ol style={{ paddingLeft: '20px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <li><strong>Define Variables de Entrada:</strong> Selecciona celdas en tu Excel que representen incertidumbre (ej. Costos, Demanda) y asígnales una "Distribución de Probabilidad".</li>
          <li><strong>Define Variables de Salida:</strong> Selecciona celdas que representen tus resultados clave (ej. VPN, TIR, Ganancia).</li>
          <li><strong>Ejecuta la Simulación:</strong> Ve a la pestaña "Simular" y el programa iterará miles de veces recalculando tu modelo de Excel con valores aleatorios de las distribuciones.</li>
          <li><strong>Analiza los Resultados:</strong> Revisa el Histograma, la Curva S (Probabilidad Acumulada), y el Gráfico de Tornado (Análisis de Sensibilidad). Exporta los reportes directamente a Excel.</li>
        </ol>

        <h3 style={{ color: 'var(--text-primary)', marginTop: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={14} /> 2. Ajuste de Datos (Data Fitting)
        </h3>
        <p style={{ marginBottom: '16px' }}>
          Si tienes una columna con datos históricos, puedes ir a la pestaña <strong>Ajuste de Datos</strong>. Selecciona el rango y el sistema aplicará la prueba estadística de Kolmogorov-Smirnov (KS) para decirte qué distribución se ajusta mejor a tu historial.
        </p>

        <h3 style={{ color: 'var(--text-primary)', marginTop: '16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck size={14} /> 3. Distribuciones Disponibles
        </h3>
        <p style={{ marginBottom: '8px' }}>Al configurar una variable de entrada, puedes elegir entre distribuciones continuas y discretas:</p>
        
        <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>Continuas (Valores decimales)</strong>
          <ul style={{ paddingLeft: '20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><strong>Triangular:</strong> <code>=RIESGO.TRIANGULAR(min; moda; max)</code><br/>Ideal para estimaciones. Requiere Mínimo, Más Probable (Moda) y Máximo.</li>
            <li><strong>PERT:</strong> <code>=RIESGO.PERT(min; moda; max)</code><br/>Concentra más probabilidad cerca de la moda. Ideal para tiempos de proyectos.</li>
            <li><strong>Normal:</strong> <code>=RIESGO.NORMAL(media; desviacion)</code><br/>Curva de campana clásica. Requiere Media y Desviación Estándar.</li>
            <li><strong>Lognormal:</strong> <code>=RIESGO.LOGNORMAL(media; desviacion)</code><br/>Curva asimétrica para finanzas (precios, ingresos que no pueden ser negativos).</li>
            <li><strong>Uniforme:</strong> <code>=RIESGO.UNIFORME(min; max)</code><br/>Cualquier valor entre un Mínimo y Máximo tiene la misma probabilidad.</li>
          </ul>

          <strong style={{ color: 'var(--accent-secondary)', display: 'block', marginBottom: '4px' }}>Discretas (Valores enteros / Conteo)</strong>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li><strong>Poisson:</strong> <code>=RIESGO.POISSON(lambda)</code><br/>Modela número de eventos en un tiempo dado. Requiere Lambda (λ).</li>
            <li><strong>Binomial:</strong> <code>=RIESGO.BINOMIAL(ensayos; prob)</code><br/>Número de éxitos en <em>n</em> intentos. Requiere Ensayos y Probabilidad de éxito.</li>
            <li><strong>Bernoulli:</strong> <code>=RIESGO.BERNOULLI(prob)</code><br/>Resultado binario (1 o 0) dado un porcentaje de probabilidad.</li>
            <li><strong>Uniforme Discreta:</strong> <code>=RANDBETWEEN(min; max)</code><br/>Valores enteros entre un rango.</li>
            <li><strong>Discreta Personalizada:</strong> Tabla de valores manuales (Ejecutada internamente).</li>
          </ul>
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '10px', background: 'hsl(45, 90%, 55%, 0.1)', border: '1px solid hsl(45, 90%, 55%, 0.3)', borderRadius: '8px' }}>
          <Info size={16} color="hsl(45, 90%, 55%)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            <strong>Funciones de Excel:</strong> Cuando registras una entrada, el complemento inyecta una fórmula nativa en la celda (ej. <code>=NORM.INV(...)</code>). Esto hace que tu modelo responda dinámicamente si presionas <strong>F9</strong>.
          </span>
        </div>
      </div>
    </div>
  );
};

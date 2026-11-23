import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);

/** Escala general de la pantalla (ver main.tsx). En pantallas anchas es mayor que 1. */
const leerEscala = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;

function useEscala() {
  const [z, setZ] = useState(leerEscala);
  useEffect(() => {
    const f = () => setZ(leerEscala());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return z;
}

/** Multiplica los tamaños de letra y de símbolos de la opción por la escala, sin tocar los datos. */
function escalar(v: unknown, z: number): unknown {
  if (z === 1 || v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => escalar(x, z));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[k] = (k === 'fontSize' || k === 'symbolSize') && typeof x === 'number' ? x * z : escalar(x, z);
  }
  return out;
}

/*
 * El gráfico se dibuja a tamaño real (sin el zoom de pantallas anchas) y se agranda por dentro.
 * Así el mouse y los tooltips caen en el lugar correcto y el dibujo se ve nítido.
 */
export function Grafico({ opcion, alto = 260, etiqueta }: { opcion: echarts.EChartsCoreOption; alto?: number; etiqueta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const z = useEscala();

  useEffect(() => {
    if (!ref.current) return;
    chart.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.current?.dispose();
    };
  }, []);

  const final = useMemo(() => {
    const base = opcion as Record<string, any>;
    // Los ejes no heredan el tamaño de letra general: se les da 12 px por defecto para poder escalarlos.
    const eje = (e: any) => (e && typeof e === 'object' ? { ...e, axisLabel: { fontSize: 12, ...(e.axisLabel ?? {}) } } : e);
    const ejes = (e: any) => (Array.isArray(e) ? e.map(eje) : eje(e));
    const o: Record<string, any> = { ...base, ...(base.xAxis ? { xAxis: ejes(base.xAxis) } : {}), ...(base.yAxis ? { yAxis: ejes(base.yAxis) } : {}) };
    return escalar(
      {
        textStyle: { fontFamily: 'Barlow, sans-serif', color: '#6A707A', fontSize: 12 },
        animationDuration: 400,
        ...o,
        ...(o.tooltip ? { tooltip: { ...o.tooltip, textStyle: { fontSize: 14, ...(o.tooltip.textStyle ?? {}) } } } : {}),
      },
      z,
    ) as echarts.EChartsCoreOption;
  }, [opcion, z]);

  useEffect(() => {
    chart.current?.setOption(final, true);
    chart.current?.resize();
  }, [final]);

  return (
    <div style={{ zoom: 1 / z }}>
      <div ref={ref} role="img" aria-label={etiqueta} style={{ height: alto * z }} className="w-full" />
    </div>
  );
}

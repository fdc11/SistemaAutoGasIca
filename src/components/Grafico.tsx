import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);

export function Grafico({ opcion, alto = 260, etiqueta }: { opcion: echarts.EChartsCoreOption; alto?: number; etiqueta: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

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

  useEffect(() => {
    chart.current?.setOption(
      {
        textStyle: { fontFamily: 'Barlow, sans-serif', color: '#6A707A' },
        animationDuration: 400,
        ...opcion,
      },
      true,
    );
  }, [opcion]);

  return <div ref={ref} role="img" aria-label={etiqueta} style={{ height: alto }} className="w-full" />;
}

import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useDatos } from '../data/store';
import { FORMATOS, descargar, type Rango } from '../lib/exportar';
import { hoyISO } from '../lib/utils';
import { Boton, Campo, Encabezado, Entrada, Panel, useAvisos } from '../components/ui';

const PRESETS: { id: string; nombre: string; rango: () => Rango }[] = [
  { id: 'todo', nombre: 'Todo', rango: () => ({}) },
  {
    id: 'mes',
    nombre: 'Este mes',
    rango: () => ({ desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() }),
  },
  {
    id: 'anterior',
    nombre: 'Mes anterior',
    rango: () => {
      const d = new Date();
      const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const fin = new Date(d.getFullYear(), d.getMonth(), 0);
      const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      return { desde: f(ini), hasta: f(fin) };
    },
  },
  { id: 'anio', nombre: 'Este año', rango: () => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: hoyISO() }) },
];

export default function Exportar() {
  const { datos } = useDatos();
  const avisar = useAvisos();
  const [rango, setRango] = useState<Rango>({});
  const [preset, setPreset] = useState('todo');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const conteos = useMemo(() => Object.fromEntries(FORMATOS.map((f) => [f.id, f.construir(datos as any, rango).length])), [datos, rango]);
  const sufijo = rango.desde || rango.hasta ? `${rango.desde ?? 'inicio'}_a_${rango.hasta ?? hoyISO()}` : hoyISO();

  const bajar = async (ids: string[]) => {
    setOcupado(ids.length > 1 ? 'todo' : ids[0]);
    try {
      const fs = FORMATOS.filter((f) => ids.includes(f.id));
      const nombre = ids.length > 1 ? `autogas-exportacion-completa-${sufijo}.xlsx` : `autogas-${fs[0].id}-${sufijo}.xlsx`;
      await descargar(fs, datos as any, rango, nombre);
      avisar(ids.length > 1 ? 'Exportación completa descargada.' : `${fs[0].nombre}: archivo descargado.`);
    } catch {
      avisar('No se pudo generar el archivo.', 'error');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Exportar Excel"
        descripcion="Descarga la información con las mismas columnas de los Excel que usaba el taller. Un archivo exportado se puede volver a importar."
        acciones={
          <Boton icono={<Download className="h-4 w-4" />} onClick={() => bajar(FORMATOS.map((f) => f.id))} disabled={!!ocupado}>
            {ocupado === 'todo' ? 'Generando…' : 'Descargar todo en un archivo'}
          </Boton>
        }
      />

      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Periodo</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPreset(p.id);
                    setRango(p.rango());
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${preset === p.id ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta'}`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
          <Campo etiqueta="Desde" className="w-44">
            <Entrada type="date" value={rango.desde ?? ''} onChange={(e) => { setPreset(''); setRango({ ...rango, desde: e.target.value || undefined }); }} />
          </Campo>
          <Campo etiqueta="Hasta" className="w-44">
            <Entrada type="date" value={rango.hasta ?? ''} onChange={(e) => { setPreset(''); setRango({ ...rango, hasta: e.target.value || undefined }); }} />
          </Campo>
        </div>
      </Panel>

      <Panel sinRelleno>
        <ul className="divide-y divide-linea">
          {FORMATOS.map((f) => (
            <li key={f.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <FileSpreadsheet className="hidden h-5 w-5 shrink-0 text-ok sm:block" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{f.nombre}</p>
                <p className="text-[13px] text-gris">{f.descripcion}</p>
              </div>
              <span className="text-sm text-gris num sm:w-28 sm:text-right">
                {conteos[f.id].toLocaleString('es-PE')} {conteos[f.id] === 1 ? 'fila' : 'filas'}
                {!f.filtraFecha && <span className="block text-xs">sin filtro de fecha</span>}
              </span>
              <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={() => bajar([f.id])} disabled={!!ocupado || !conteos[f.id]}>
                {ocupado === f.id ? 'Generando…' : 'Descargar'}
              </Boton>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

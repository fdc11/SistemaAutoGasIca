import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useDatos } from '../data/store';
import { FORMATOS, descargar, type Fila, type Formato, type Rango } from '../lib/exportar';
import { cx, hoyISO } from '../lib/utils';
import { Boton, Campo, Entrada, Modal, useAvisos } from './ui';

const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const PERIODOS: { id: string; nombre: string; rango: () => Rango }[] = [
  { id: 'todo', nombre: 'Todo', rango: () => ({}) },
  { id: 'mes', nombre: 'Este mes', rango: () => ({ desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() }) },
  {
    id: 'anterior',
    nombre: 'Mes anterior',
    rango: () => {
      const d = new Date();
      return { desde: f(new Date(d.getFullYear(), d.getMonth() - 1, 1)), hasta: f(new Date(d.getFullYear(), d.getMonth(), 0)) };
    },
  },
  { id: 'anio', nombre: 'Este año', rango: () => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: hoyISO() }) },
  { id: 'rango', nombre: 'Entre fechas', rango: () => ({}) },
];

/** Formato extra propio de la pantalla (p. ej., «la lista con los filtros que tienes puestos»). */
export interface FormatoExtra {
  id: string;
  nombre: string;
  descripcion: string;
  filas: () => Fila[];
  hoja: string;
}

/**
 * Exportar a Excel desde cada sección. Usa los mismos formatos (columnas de los Excel del taller)
 * que antes estaban en la pantalla «Exportar Excel».
 */
export function ExportadorExcel({ formatos: ids, extras = [], titulo = 'Exportar a Excel', onCerrar }: { formatos: string[]; extras?: FormatoExtra[]; titulo?: string; onCerrar: () => void }) {
  const { datos } = useDatos();
  const avisar = useAvisos();
  const formatos = FORMATOS.filter((x) => ids.includes(x.id));
  const [periodo, setPeriodo] = useState('todo');
  const [rango, setRango] = useState<Rango>({});
  const [elegido, setElegido] = useState(extras[0]?.id ?? formatos[0]?.id);
  const [ocupado, setOcupado] = useState(false);

  const opciones: (Formato | (FormatoExtra & { extra: true }))[] = [...extras.map((e) => ({ ...e, extra: true as const })), ...formatos];
  const actual = opciones.find((o) => o.id === elegido);
  const esExtra = actual && 'extra' in actual;
  const conteo = useMemo(
    () => Object.fromEntries(opciones.map((o) => [o.id, 'extra' in o ? o.filas().length : o.construir(datos as any, rango).length])),
    [datos, rango, elegido], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sufijo = rango.desde || rango.hasta ? `${rango.desde ?? 'inicio'}_a_${rango.hasta ?? hoyISO()}` : hoyISO();

  const bajar = async () => {
    if (!actual) return;
    setOcupado(true);
    try {
      const fmt: Formato =
        'extra' in actual
          ? { id: actual.id, nombre: actual.nombre, hoja: actual.hoja, descripcion: actual.descripcion, filtraFecha: false, construir: () => actual.filas() }
          : actual;
      await descargar([fmt], datos as any, 'extra' in actual ? {} : rango, `autogas-${actual.id}-${'extra' in actual ? hoyISO() : sufijo}.xlsx`);
      avisar(`${actual.nombre}: archivo descargado.`);
      onCerrar();
    } catch {
      avisar('No se pudo generar el archivo.', 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion="Mismas columnas que los Excel del taller: el archivo se puede volver a importar."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono={<Download className="h-4 w-4" />} onClick={bajar} disabled={ocupado || !actual || !conteo[actual.id]}>
            {ocupado ? 'Generando…' : `Descargar${actual ? ` (${conteo[actual.id] ?? 0})` : ''}`}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium">Qué descargar</p>
          <ul className="space-y-2">
            {opciones.map((o) => (
              <li key={o.id}>
                <label
                  className={cx(
                    'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5',
                    elegido === o.id ? 'border-carbon bg-fondo' : 'border-linea hover:border-linea-fuerte',
                  )}
                >
                  <input type="radio" name="formato" className="mt-1 h-4 w-4 accent-rojo" checked={elegido === o.id} onChange={() => setElegido(o.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{o.nombre}</span>
                      <span className="text-xs text-gris num">{conteo[o.id] ?? 0} filas</span>
                    </span>
                    <span className="block text-[13px] text-gris">{o.descripcion}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        {actual && !esExtra && (actual as Formato).filtraFecha && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Periodo</p>
            <div className="flex flex-wrap gap-1.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPeriodo(p.id);
                    if (p.id !== 'rango') setRango(p.rango());
                  }}
                  className={cx(
                    'rounded-full border px-3 py-1 text-[13px] font-semibold',
                    periodo === p.id ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
                  )}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
            {periodo === 'rango' && (
              <div className="mt-3 grid max-w-sm grid-cols-2 gap-3">
                <Campo etiqueta="Desde">
                  <Entrada type="date" value={rango.desde ?? ''} onChange={(e) => setRango({ ...rango, desde: e.target.value || undefined })} />
                </Campo>
                <Campo etiqueta="Hasta">
                  <Entrada type="date" value={rango.hasta ?? ''} onChange={(e) => setRango({ ...rango, hasta: e.target.value || undefined })} />
                </Campo>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

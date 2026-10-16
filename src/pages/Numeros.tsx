import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addMonths, format, getDay, getDaysInMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownRight, ArrowUpRight, Download, FileUp, MessageCircle, Minus, PhoneIncoming, Plus, UserCheck, UserPlus } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { Grafico } from '../components/Grafico';
import { leerArchivo, type Hoja } from '../import/lectura';
import { detectarEncabezado, leerNumeros, type ResultadoLectura } from '../import/numeros';
import { ESTADOS_NUMERO, estadoNumero } from '../lib/catalogos';
import type { Canal, EstadoCliente, NumeroNuevo } from '../lib/types';
import { celularValido, cx, enlaceWhatsApp, uid, fechaCorta, formatoCelular, hoyISO, normalizarCelular, normalizarPlaca, placaValida, plano } from '../lib/utils';
import {
  AreaTexto,
  Boton,
  Buscador,
  Campo,
  Confirmar,
  Encabezado,
  Entrada,
  Etiqueta,
  Grupo,
  Modal,
  Panel,
  Pestanas,
  Selector,
  Tabla,
  Td,
  Th,
  Vacio,
  useAvisos,
} from '../components/ui';

type Vista = 'registro' | 'analisis';
const mesDe = (iso: string) => iso.slice(0, 7);
const mesActual = () => hoyISO().slice(0, 7);
const nombreMes = (ym: string, corto = false) => format(parseISO(ym + '-01'), corto ? 'MMM yy' : "MMMM 'de' yyyy", { locale: es });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

// Paleta categórica validada (orden fijo, nunca se cicla). «Otros» siempre gris.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTROS = '#9AA0A9';
const MAGNITUD = '#2a78d6';
const MAGNITUD_SUAVE = '#BFD4F2';

/** «Facebook Ads» → canal y anuncio del cliente al pasarlo a la base. */
function canalDeTipo(tipo: string): { canal: Canal; subcanal?: string } {
  const t = plano(tipo);
  if (/facebook|tiktok|instagram|google|ads|anuncio|publicidad/.test(t))
    return { canal: 'publicidad', subcanal: /tiktok/.test(t) ? 'TikTok Ads' : /instagram/.test(t) ? 'Instagram' : /google/.test(t) ? 'Google' : 'Facebook Ads' };
  if (/llamada|telefon/.test(t)) return { canal: 'llamada' };
  if (/presencial|local|cliente/.test(t)) return { canal: 'presencial' };
  if (/referid|recomend/.test(t)) return { canal: 'referido' };
  return { canal: 'whatsapp' };
}
const ESTADO_CLIENTE: Record<NumeroNuevo['estado'], EstadoCliente> = {
  nuevo: 'nuevo',
  contactado: 'contactado',
  sin_respuesta: 'seguimiento',
  cotizacion: 'cotizacion',
  cita: 'cita',
  concretado: 'atendido',
  perdido: 'perdido',
};

/** Cuenta por clave y ordena de mayor a menor. */
function contar<T>(xs: T[], clave: (x: T) => string | undefined) {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = clave(x) || 'Sin dato';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Deja los N primeros y junta el resto en «Otros». */
function top(lista: [string, number][], n: number) {
  if (lista.length <= n + 1) return lista;
  const resto = lista.slice(n).reduce((s, [, v]) => s + v, 0);
  return [...lista.slice(0, n), ['Otros', resto] as [string, number]];
}

export default function Numeros() {
  const numeros = useActivos('numeros');
  const [vista, setVista] = useState<Vista>('registro');
  const [editar, setEditar] = useState<NumeroNuevo | 'nuevo' | null>(null);
  const [importar, setImportar] = useState(false);
  return (
    <>
      <Encabezado
        titulo="Números nuevos"
        descripcion="Cada número que escribe o llama por primera vez: por dónde llegó, qué busca y en qué terminó. En «Análisis» ves el tráfico de cada mes."
        acciones={
          <>
            <Boton variante="secundario" icono={<FileUp className="h-4 w-4" />} onClick={() => setImportar(true)}>
              Importar
            </Boton>
            <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditar('nuevo')}>
              Registrar número
            </Boton>
          </>
        }
      />
      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { id: 'registro', nombre: 'Registro', cuenta: numeros.length },
          { id: 'analisis', nombre: 'Análisis' },
        ]}
      />
      {vista === 'registro' ? <Registro onEditar={setEditar} onNuevo={() => setEditar('nuevo')} /> : <Analisis />}
      {editar && <FormNumero numero={editar === 'nuevo' ? undefined : editar} onCerrar={() => setEditar(null)} />}
      {importar && <ImportarNumeros onCerrar={() => setImportar(false)} />}
    </>
  );
}

/* ---------------- Filtro de fechas: mes, día exacto o rango ---------------- */

type Periodo = { modo: 'mes' | 'dia' | 'rango' | 'todo'; mes: string; dia: string; desde: string; hasta: string };

function enPeriodo(fecha: string, p: Periodo) {
  if (p.modo === 'mes') return !p.mes || fecha.startsWith(p.mes);
  if (p.modo === 'dia') return !p.dia || fecha === p.dia;
  if (p.modo === 'rango') return (!p.desde || fecha >= p.desde) && (!p.hasta || fecha <= p.hasta);
  return true;
}
const etiquetaPeriodo = (p: Periodo) =>
  p.modo === 'mes' ? p.mes || 'todo' : p.modo === 'dia' ? p.dia : p.modo === 'rango' ? `${p.desde || 'inicio'}_a_${p.hasta || 'hoy'}` : 'todo';

function FiltroPeriodo({ valor, onCambio, meses }: { valor: Periodo; onCambio: (p: Periodo) => void; meses: string[] }) {
  const set = (x: Partial<Periodo>) => onCambio({ ...valor, ...x });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Campo etiqueta="Fecha" className="w-36">
        <Selector value={valor.modo} onChange={(e) => set({ modo: e.target.value as Periodo['modo'] })}>
          <option value="mes">Por mes</option>
          <option value="dia">Un día</option>
          <option value="rango">Entre fechas</option>
          <option value="todo">Todo</option>
        </Selector>
      </Campo>
      {valor.modo === 'mes' && (
        <Campo etiqueta="Mes" className="w-44">
          <Selector value={valor.mes} onChange={(e) => set({ mes: e.target.value })}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mayus(nombreMes(m))}
              </option>
            ))}
          </Selector>
        </Campo>
      )}
      {valor.modo === 'dia' && (
        <Campo etiqueta="Día" className="w-44">
          <Entrada type="date" value={valor.dia} onChange={(e) => set({ dia: e.target.value })} />
        </Campo>
      )}
      {valor.modo === 'rango' && (
        <>
          <Campo etiqueta="Desde" className="w-40">
            <Entrada type="date" value={valor.desde} max={valor.hasta || undefined} onChange={(e) => set({ desde: e.target.value })} />
          </Campo>
          <Campo etiqueta="Hasta" className="w-40">
            <Entrada type="date" value={valor.hasta} min={valor.desde || undefined} onChange={(e) => set({ hasta: e.target.value })} />
          </Campo>
        </>
      )}
    </div>
  );
}

/* ---------------- Importar el Excel FORMATO CONTROL NUMEROS ---------------- */

function ImportarNumeros({ onCerrar }: { onCerrar: () => void }) {
  const { datos, listas, crearVarios, crear, autor } = useDatos();
  const avisar = useAvisos();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hoja, setHoja] = useState(0);
  const [area, setArea] = useState('');
  const [deducir, setDeducir] = useState(true);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const existentes = useMemo(() => new Set(datos.numeros.filter((n) => !n.eliminado).map((n) => n.celular)), [datos.numeros]);
  const res: ResultadoLectura | null = useMemo(
    () => (hojas[hoja] ? leerNumeros(hojas[hoja], existentes, { area: area || undefined, deducirArea: deducir, areas: listas.areasCliente }) : null),
    [hojas, hoja, existentes, area, deducir, listas.areasCliente],
  );
  const meses = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of res?.docs ?? []) m.set(mesDe(d.fecha), (m.get(mesDe(d.fecha)) ?? 0) + 1);
    return [...m.entries()].sort();
  }, [res]);

  const elegirArchivo = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setCargando(true);
    try {
      const hs = (await leerArchivo(f)).filter((h) => detectarEncabezado(h));
      if (!hs.length) {
        setError('No encontré ninguna hoja con las columnas «FECHA DE CONTACTO» y «TELEFONO».');
        return;
      }
      setArchivo(f);
      setHojas(hs);
      // Por defecto, la hoja más reciente (la del año más alto)
      const idx = hs.map((h, i) => [Number(h.nombre.match(/20\d{2}/)?.[0] ?? 0), i]).sort((a, b) => b[0] - a[0])[0][1];
      setHoja(idx);
    } catch {
      setError('No se pudo leer el archivo. ¿Es un Excel (.xlsx)?');
    } finally {
      setCargando(false);
    }
  };

  const importar = async () => {
    if (!res?.docs.length || !archivo) return;
    setCargando(true);
    try {
      const importacionId = uid();
      const ids = await crearVarios('numeros', res.docs.map((d) => ({ ...d, importacionId })));
      await crear('importaciones', {
        id: importacionId,
        archivo: `${archivo.name} · ${hojas[hoja].nombre}`,
        plantilla: 'Números nuevos',
        leidas: res.leidas,
        creadas: ids.length,
        fusionadas: res.unidas,
        omitidas: res.yaRegistrados.length + res.sinTelefono.length,
        ids: { numeros: ids },
      });
      avisar(`${ids.length} números importados con su fecha de contacto. Se puede revertir desde Ajustes → Importaciones.`);
      onCerrar();
    } catch (e) {
      console.error(e);
      setError('No se pudo importar. Revisa la conexión e inténtalo otra vez.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Importar números desde Excel"
      descripcion="Hoja tipo «TABLA DE PROSPECTOS»: cada número entra con la fecha de contacto y el último contacto del Excel."
      ancho="lg"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={importar} disabled={cargando || !res?.docs.length}>
            {cargando ? 'Importando…' : res ? `Importar ${res.docs.length} números` : 'Importar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-linea-fuerte px-4 py-6 text-center hover:border-tinta/40">
          <FileUp className="h-6 w-6 text-gris" />
          <span className="text-sm font-semibold">{archivo ? archivo.name : 'Elegir archivo Excel'}</span>
          <span className="text-xs text-gris">{archivo ? 'Toca para cambiar de archivo' : 'Por ejemplo, FORMATO CONTROL NUMEROS.xlsx'}</span>
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={(e) => elegirArchivo(e.target.files?.[0])} />
        </label>

        {hojas.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Hoja">
              <Selector value={hoja} onChange={(e) => setHoja(Number(e.target.value))}>
                {hojas.map((h, i) => (
                  <option key={h.nombre} value={i}>
                    {h.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Área" ayuda={area ? 'Se pone a todos los números de esta hoja.' : undefined}>
              <Selector value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Según el interés de cada uno</option>
                {listas.areasCliente.map((a) => (
                  <option key={a} value={a}>
                    Todos: {a}
                  </option>
                ))}
              </Selector>
            </Campo>
            {!area && (
              <label className="flex items-center gap-2 text-sm text-gris sm:col-span-2">
                <input type="checkbox" className="h-4 w-4 accent-rojo" checked={deducir} onChange={(e) => setDeducir(e.target.checked)} />
                Deducir el área del interés (conversión → Conversiones; gas → Gas; aceite y mantenimiento → Mecánica). Los dudosos quedan sin área.
              </label>
            )}
          </div>
        )}

        {res && (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-linea bg-linea sm:grid-cols-4">
              {[
                ['Se importan', res.docs.length, 'ok'],
                ['Repetidos en el archivo (se unen)', res.unidas, ''],
                ['Ya estaban en el sistema', res.yaRegistrados.length, ''],
                ['Sin teléfono válido', res.sinTelefono.length, res.sinTelefono.length ? 'aviso' : ''],
              ].map(([t, n, tono]) => (
                <div key={t as string} className="bg-white px-3 py-2.5">
                  <p className="text-xs text-gris">{t}</p>
                  <p className={cx('font-display text-2xl font-bold num', tono === 'ok' && 'text-ok', tono === 'aviso' && 'text-aviso')}>{n as number}</p>
                </div>
              ))}
            </div>
            {meses.length > 0 && (
              <p className="text-[13px] text-gris">
                Quedan en sus meses:{' '}
                {meses.map(([m, n]) => (
                  <span key={m} className="mr-2 inline-block">
                    <span className="font-semibold text-tinta">{mayus(nombreMes(m, true))}</span> {n}
                  </span>
                ))}
              </p>
            )}
            {res.docs.length > 0 && (
              <div className="overflow-hidden rounded-md border border-linea">
                <p className="border-b border-linea bg-fondo px-3 py-1.5 text-xs font-semibold text-gris">Vista previa (primeros 6)</p>
                <table className="w-full text-[13px]">
                  <tbody>
                    {[...res.docs]
                      .sort((a, b) => b.fecha.localeCompare(a.fecha))
                      .slice(0, 6)
                      .map((d) => (
                        <tr key={d.celular} className="border-t border-linea first:border-0">
                          <td className="px-3 py-1.5 num">{fechaCorta(d.fecha)}</td>
                          <td className="px-3 py-1.5 num">{formatoCelular(d.celular)}</td>
                          <td className="px-3 py-1.5">{d.nombre || <span className="text-gris">Sin nombre</span>}</td>
                          <td className="px-3 py-1.5">{d.tipoContacto}</td>
                          <td className="px-3 py-1.5">{d.interes || '—'}</td>
                          <td className="px-3 py-1.5 text-gris">{d.area || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {(res.sinTelefono.length > 0 || res.fechasCorregidas.length > 0) && (
              <details className="rounded-md border border-linea px-3 py-2 text-[13px]">
                <summary className="cursor-pointer font-semibold">Ver detalles ({res.sinTelefono.length + res.fechasCorregidas.length})</summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-gris">
                  {res.sinTelefono.map((x) => (
                    <li key={'s' + x.fila}>Fila {x.fila}: no se importa, {x.detalle}.</li>
                  ))}
                  {res.fechasCorregidas.map((x, i) => (
                    <li key={'f' + i}>Fila {x.fila}: {x.detalle}.</li>
                  ))}
                </ul>
              </details>
            )}
            {res.yaRegistrados.length > 0 && res.docs.length === 0 && (
              <p className="rounded-md bg-info-suave px-3 py-2 text-sm text-info">Todos los números de esta hoja ya están en el sistema. No hay nada nuevo que importar.</p>
            )}
          </>
        )}
        {error && <p className="rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
        <p className="text-xs text-gris">Registrado por: {autor}. Después de importar, cada fecha se puede corregir abriendo el número.</p>
      </div>
    </Modal>
  );
}

/* ---------------- Registro (la tabla del Excel) ---------------- */

function Registro({ onEditar, onNuevo }: { onEditar: (n: NumeroNuevo) => void; onNuevo: () => void }) {
  const numeros = useActivos('numeros');
  const { listas } = useDatos();
  const [periodo, setPeriodo] = useState<Periodo>({ modo: 'mes', mes: mesActual(), dia: hoyISO(), desde: '', hasta: '' });
  const [tipo, setTipo] = useState('');
  const [estado, setEstado] = useState('');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const meses = useMemo(() => [...new Set([mesActual(), ...numeros.map((n) => mesDe(n.fecha))])].sort().reverse(), [numeros]);

  const lista = useMemo(() => {
    const t = plano(q).replace(/\s+/g, '');
    return numeros
      .filter((n) => enPeriodo(n.fecha, periodo) && (!tipo || n.tipoContacto === tipo) && (!estado || n.estado === estado) && (!area || n.area === area))
      .filter((n) => !t || plano(`${n.nombre}${n.celular}${n.placa}${n.interes}${n.interesDetalle}${n.comentarios}`).replace(/\s+/g, '').includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [numeros, periodo, tipo, estado, area, q]);

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const filas = [...lista]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((n) => ({
        'FECHA DE CONTACTO': parseISO(n.fecha),
        TELEFONO: n.celular,
        'NOMBRE COMPLETO/CONTACTO': n.nombre ?? '',
        'TIPO DE CONTACTO': n.tipoContacto,
        INTERES: n.interesDetalle || n.interes || '',
        AREA: n.area ?? '',
        PLACA: n.placa ?? '',
        MARCA: n.marca ?? '',
        'MODELO Y AÑO': n.modelo ?? '',
        'FECHA DE CITA': n.fechaCita ? parseISO(n.fechaCita) : '',
        'ULTIMO CONTACTO': n.ultimoContacto ? parseISO(n.ultimoContacto) : '',
        COMENTARIOS: n.comentarios ?? '',
        ESTADO: estadoNumero(n.estado).nombre,
      }));
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin datos': 'No hay números con esos filtros' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = Object.keys(filas[0] ?? { x: '' }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NUMEROS NUEVOS');
    XLSX.writeFile(wb, `numeros-nuevos-${etiquetaPeriodo(periodo)}.xlsx`, { cellDates: true });
  };

  return (
    <Panel sinRelleno>
      <div className="flex flex-wrap items-end gap-3 border-b border-linea p-4">
        <FiltroPeriodo valor={periodo} onCambio={setPeriodo} meses={meses} />
        <Campo etiqueta="Tipo de contacto" className="w-44">
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {listas.tiposContacto.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Área" className="w-36">
          <Selector value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {listas.areasCliente.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Estado" className="w-40">
          <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_NUMERO.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Buscador valor={q} onCambio={setQ} placeholder="Nombre, celular, placa o comentario" className="min-w-[200px] flex-1" />
        <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={exportar} disabled={!lista.length}>
          Exportar
        </Boton>
      </div>

      {lista.length === 0 ? (
        <Vacio
          icono={<PhoneIncoming className="h-8 w-8" />}
          titulo={numeros.length === 0 ? 'Todavía no hay números registrados' : 'No hay números con esos filtros'}
          texto={numeros.length === 0 ? 'Registra cada número nuevo que escriba o llame al taller. Con eso se arma el análisis del mes.' : 'Prueba con otro mes o quita algún filtro.'}
          accion={numeros.length === 0 ? <Boton onClick={onNuevo}>Registrar el primero</Boton> : undefined}
        />
      ) : (
        <>
          <p className="border-b border-linea px-4 py-2 text-[13px] text-gris">
            <span className="font-semibold text-tinta num">{lista.length}</span> número{lista.length === 1 ? '' : 's'}
          </p>
          <Tabla>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Teléfono · nombre</Th>
                <Th>Tipo de contacto</Th>
                <Th>Interés</Th>
                <Th>Vehículo</Th>
                <Th>Cita</Th>
                <Th>Último contacto</Th>
                <Th>Comentarios</Th>
                <Th>Estado</Th>
                <Th className="w-10">
                  <span className="sr-only">WhatsApp</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((n) => {
                const e = estadoNumero(n.estado);
                return (
                  <tr key={n.id} className="cursor-pointer hover:bg-[#FAFAFB]" onClick={() => onEditar(n)}>
                    <Td className="whitespace-nowrap num">{fechaCorta(n.fecha)}</Td>
                    <Td>
                      <p className="font-semibold num">{formatoCelular(n.celular)}</p>
                      <p className="text-[13px] text-gris">{n.nombre || 'Sin nombre'}</p>
                    </Td>
                    <Td className="whitespace-nowrap">{n.tipoContacto}</Td>
                    <Td className="max-w-[180px]">
                      <p className="truncate">{n.interes || '—'}</p>
                      {n.area && <p className="text-[12px] text-gris">{n.area}</p>}
                    </Td>
                    <Td className="text-[13px]">
                      {n.placa && <p className="font-display font-semibold tracking-wide num">{n.placa}</p>}
                      <p className="text-gris">{[n.marca, n.modelo].filter(Boolean).join(' ') || (n.placa ? '' : '—')}</p>
                    </Td>
                    <Td className="whitespace-nowrap num">{fechaCorta(n.fechaCita)}</Td>
                    <Td className="whitespace-nowrap num">{fechaCorta(n.ultimoContacto)}</Td>
                    <Td className="max-w-[220px]">
                      <p className="line-clamp-2 text-[13px] text-gris">{n.comentarios || '—'}</p>
                    </Td>
                    <Td>
                      <Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>
                      {n.clienteId && <p className="mt-1 text-[11px] font-semibold text-ok">En la base</p>}
                    </Td>
                    <Td onClick={(ev) => ev.stopPropagation()}>
                      <a href={enlaceWhatsApp(n.celular)} target="_blank" rel="noreferrer" title="Abrir WhatsApp" className="flex h-8 w-8 items-center justify-center rounded-md text-ok hover:bg-ok-suave">
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        </>
      )}
    </Panel>
  );
}

/* ---------------- Registrar / editar número ---------------- */

function FormNumero({ numero, onCerrar }: { numero?: NumeroNuevo; onCerrar: () => void }) {
  const { crear, editar, eliminar, listas, datos } = useDatos();
  const { registrar } = useAcciones();
  const avisar = useAvisos();
  const [f, setF] = useState({
    fecha: numero?.fecha ?? hoyISO(),
    celular: numero?.celular ?? '',
    nombre: numero?.nombre ?? '',
    tipoContacto: numero?.tipoContacto ?? listas.tiposContacto[0] ?? 'WhatsApp',
    interes: numero?.interes ?? '',
    interesDetalle: numero?.interesDetalle ?? '',
    area: numero?.area ?? '',
    placa: numero?.placa ?? '',
    marca: numero?.marca ?? '',
    modelo: numero?.modelo ?? '',
    fechaCita: numero?.fechaCita ?? '',
    ultimoContacto: numero?.ultimoContacto ?? '',
    comentarios: numero?.comentarios ?? '',
    estado: numero?.estado ?? ('nuevo' as NumeroNuevo['estado']),
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const cel = normalizarCelular(f.celular);
  const pla = normalizarPlaca(f.placa);

  // ¿Ya escribió antes o ya es cliente?
  const previo = celularValido(cel) ? datos.numeros.find((n) => !n.eliminado && n.celular === cel && n.id !== numero?.id) : undefined;
  const cliente = celularValido(cel)
    ? datos.clientes.find((c) => !c.eliminado && (c.id === numero?.clienteId || c.celular === cel))
    : numero?.clienteId
      ? datos.clientes.find((c) => c.id === numero.clienteId && !c.eliminado)
      : undefined;

  const datosDoc = () => ({
    fecha: f.fecha,
    celular: cel,
    nombre: f.nombre.trim() || undefined,
    tipoContacto: f.tipoContacto,
    interes: f.interes || undefined,
    interesDetalle: f.interesDetalle.trim() || undefined,
    area: f.area || undefined,
    placa: placaValida(pla) ? pla : undefined,
    marca: f.marca.trim() || undefined,
    modelo: f.modelo.trim() || undefined,
    fechaCita: f.fechaCita || undefined,
    ultimoContacto: f.ultimoContacto || undefined,
    comentarios: f.comentarios.trim() || undefined,
    estado: f.estado,
  });

  const validar = () => {
    if (!f.fecha) return 'Pon la fecha de contacto.';
    if (!celularValido(cel)) return 'El teléfono debe tener 9 dígitos y empezar en 9.';
    if (!f.tipoContacto) return 'Elige el tipo de contacto.';
    if (f.placa && !placaValida(pla)) return 'La placa debe tener 6 caracteres.';
    return '';
  };

  const guardar = async () => {
    const e = validar();
    if (e) return setError(e);
    setGuardando(true);
    try {
      if (numero) await editar('numeros', numero.id, { ...datosDoc(), clienteId: numero.clienteId ?? cliente?.id });
      else await crear('numeros', { ...datosDoc(), clienteId: cliente?.id });
      avisar(numero ? 'Número actualizado.' : `${formatoCelular(cel)} registrado.`);
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const pasarACliente = async () => {
    const e = validar();
    if (e) return setError(e);
    if (!f.nombre.trim()) return setError('Para pasarlo a la Base de clientes escribe su nombre.');
    setGuardando(true);
    try {
      const c = canalDeTipo(f.tipoContacto);
      const r = await registrar({
        nombre: f.nombre.trim(),
        celular: cel,
        canal: c.canal,
        subcanal: c.subcanal,
        interes: f.interes || undefined,
        estado: ESTADO_CLIENTE[f.estado],
        areas: f.area ? [f.area] : undefined,
        placa: placaValida(pla) ? pla : undefined,
        marca: f.marca.trim() || undefined,
        modelo: f.modelo.trim() || undefined,
        tipoInteraccion: c.canal === 'llamada' ? 'llamada' : c.canal === 'presencial' ? 'presencial' : 'whatsapp',
        comentario: `Llegó como número nuevo el ${fechaCorta(f.fecha)} por ${f.tipoContacto}${f.comentarios.trim() ? `: ${f.comentarios.trim()}` : ''}`,
      });
      const doc = { ...datosDoc(), clienteId: r.clienteId };
      if (numero) await editar('numeros', numero.id, doc);
      else await crear('numeros', doc);
      avisar(r.nuevo ? `${f.nombre.trim()} pasó a la Base de clientes.` : 'Ya estaba en la base: se sumó el contacto a su ficha.');
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={numero ? 'Número nuevo' : 'Registrar número nuevo'}
      descripcion={numero ? `Registrado por ${numero.creadoPor} el ${fechaCorta(numero.creadoEn)}` : 'Alguien que escribió o llamó al taller.'}
      ancho="lg"
      pie={
        <>
          {numero && (
            <Boton variante="peligro" className="mr-auto" onClick={() => setBorrar(true)}>
              Eliminar
            </Boton>
          )}
          {!cliente && (
            <Boton variante="secundario" icono={<UserPlus className="h-4 w-4" />} onClick={pasarACliente} disabled={guardando} className={numero ? '' : 'mr-auto'}>
              Guardar y pasar a cliente
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Fecha de contacto" requerido>
            <Entrada type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono" requerido>
            <Entrada value={f.celular} onChange={(e) => set('celular', e.target.value)} inputMode="tel" placeholder="987 654 321" invalido={!!f.celular && !celularValido(cel)} autoFocus={!numero} />
          </Campo>
          <Campo etiqueta="Nombre / contacto">
            <Entrada value={f.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Como aparece en WhatsApp" />
          </Campo>
        </div>

        {(previo || cliente) && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-info-suave px-3 py-2.5 text-sm text-info">
            <UserCheck className="h-4 w-4 shrink-0" />
            {cliente ? (
              <span>
                Ya está en la Base de clientes:{' '}
                <Link to={`/clientes/${cliente.id}`} className="font-semibold underline">
                  {cliente.nombre || 'ver ficha'}
                </Link>
                .
              </span>
            ) : (
              <span>
                Este número ya escribió el <strong className="num">{fechaCorta(previo!.fecha)}</strong> ({previo!.tipoContacto}). Si es el mismo contacto, edita ese registro en vez de crear otro.
              </span>
            )}
          </div>
        )}

        <Grupo etiqueta="Tipo de contacto" requerido>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...listas.tiposContacto, f.tipoContacto])].filter(Boolean).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set('tipoContacto', t)}
                className={cx(
                  'rounded-full border px-3 py-1 text-[13px] font-semibold',
                  f.tipoContacto === t ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Grupo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Interés">
            <Selector value={f.interes} onChange={(e) => set('interes', e.target.value)}>
              <option value="">Elegir</option>
              {listas.servicios.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Detalle del interés">
            <Entrada value={f.interesDetalle} onChange={(e) => set('interesDetalle', e.target.value)} placeholder="Ej.: promo Castrol, GLP para Haval" />
          </Campo>
          <Campo etiqueta="Área">
            <Selector value={f.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">—</option>
              {listas.areasCliente.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Selector>
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Placa">
            <Entrada value={f.placa} onChange={(e) => set('placa', e.target.value.toUpperCase())} placeholder="ABC123" invalido={!!f.placa && !placaValida(pla)} />
          </Campo>
          <Campo etiqueta="Marca">
            <Entrada value={f.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Toyota" />
          </Campo>
          <Campo etiqueta="Modelo y año">
            <Entrada value={f.modelo} onChange={(e) => set('modelo', e.target.value)} placeholder="Yaris 2016" />
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Estado">
            <Selector value={f.estado} onChange={(e) => set('estado', e.target.value as NumeroNuevo['estado'])}>
              {ESTADOS_NUMERO.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha de cita">
            <Entrada type="date" value={f.fechaCita} onChange={(e) => set('fechaCita', e.target.value)} />
          </Campo>
          <Campo etiqueta="Último contacto">
            <Entrada type="date" value={f.ultimoContacto} onChange={(e) => set('ultimoContacto', e.target.value)} />
          </Campo>
        </div>

        <Campo etiqueta="Comentarios">
          <AreaTexto value={f.comentarios} onChange={(e) => set('comentarios', e.target.value)} className="min-h-[64px]" placeholder="Ej.: se le envió cotización de conversión GLP" />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
      <Confirmar
        abierto={borrar}
        titulo="Eliminar número"
        texto="Se quitará este número del registro (queda en la papelera de Ajustes)."
        accion="Eliminar"
        onCerrar={() => setBorrar(false)}
        onConfirmar={async () => {
          if (!numero) return;
          await eliminar('numeros', numero.id);
          avisar('Número eliminado.');
          onCerrar();
        }}
      />
    </Modal>
  );
}

/* ---------------- Análisis del tráfico (dashboard) ---------------- */

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function Analisis() {
  const numeros = useActivos('numeros');
  const meses = useMemo(() => [...new Set([mesActual(), ...numeros.map((n) => mesDe(n.fecha))])].sort().reverse(), [numeros]);
  const [mes, setMes] = useState(mesActual());

  const a = useMemo(() => {
    const delMes = numeros.filter((n) => n.fecha.startsWith(mes));
    const mesAnt = format(addMonths(parseISO(mes + '-01'), -1), 'yyyy-MM');
    const ant = numeros.filter((n) => n.fecha.startsWith(mesAnt));
    const hoy = hoyISO();
    const esActual = mes === mesActual();
    // Días transcurridos (para no castigar el promedio del mes en curso)
    const dias = esActual ? Number(hoy.slice(8, 10)) : getDaysInMonth(parseISO(mes + '-01'));
    // Mes anterior hasta el mismo día, para comparar justo
    const antMismoCorte = esActual ? ant.filter((n) => Number(n.fecha.slice(8, 10)) <= dias) : ant;

    const tipos = contar(delMes, (n) => n.tipoContacto);
    const tiposAnt = new Map(contar(ant, (n) => n.tipoContacto));
    const intereses = contar(delMes, (n) => n.interes);
    const areas = contar(delMes, (n) => n.area);
    const estados = contar(delMes, (n) => n.estado);
    const avanzaron = delMes.filter((n) => ['cita', 'concretado'].includes(n.estado) || n.clienteId).length;
    const sinRespuesta = delMes.filter((n) => n.estado === 'sin_respuesta').length;
    const conNombre = delMes.filter((n) => n.nombre).length;
    const conPlaca = delMes.filter((n) => n.placa).length;

    const porDia = Array.from({ length: getDaysInMonth(parseISO(mes + '-01')) }, (_, i) => {
      const d = `${mes}-${String(i + 1).padStart(2, '0')}`;
      return { d, n: delMes.filter((x) => x.fecha === d).length };
    });
    const porSemana = DIAS_SEMANA.map((nombre, i) => ({
      nombre,
      n: delMes.filter((x) => (getDay(parseISO(x.fecha)) + 6) % 7 === i).length,
    }));
    const picoDia = [...porDia].sort((x, y) => y.n - x.n)[0];

    // Últimos 12 meses hasta el elegido
    const historico = Array.from({ length: 12 }, (_, i) => {
      const m = format(addMonths(parseISO(mes + '-01'), i - 11), 'yyyy-MM');
      const xs = numeros.filter((n) => n.fecha.startsWith(m));
      return { m, n: xs.length, avanzaron: xs.filter((n) => ['cita', 'concretado'].includes(n.estado) || n.clienteId).length };
    });
    const conDatos = historico.filter((h) => h.n > 0);
    const promedio12 = conDatos.length ? Math.round(conDatos.reduce((s, h) => s + h.n, 0) / conDatos.length) : 0;

    return { delMes, ant, antMismoCorte, mesAnt, dias, esActual, tipos, tiposAnt, intereses, areas, estados, avanzaron, sinRespuesta, conNombre, conPlaca, porDia, porSemana, picoDia, historico, promedio12 };
  }, [numeros, mes]);

  const total = a.delMes.length;
  const variacion = a.antMismoCorte.length ? Math.round(((total - a.antMismoCorte.length) / a.antMismoCorte.length) * 100) : null;
  const tiposTop = top(a.tipos, 5);
  const colorTipo = (k: string, i: number) => (k === 'Otros' || k === 'Sin dato' ? OTROS : SERIES[i % SERIES.length]);

  const resumen = useMemo(() => {
    if (!total) return [];
    const r: string[] = [];
    const mesTxt = nombreMes(mes).split(' de ')[0];
    r.push(
      `En ${mesTxt}${a.esActual ? ` (hasta el día ${a.dias})` : ''} entraron ${total} número${total === 1 ? '' : 's'} nuevo${total === 1 ? '' : 's'}, ` +
        `unos ${(total / a.dias).toFixed(1)} por día.` +
        (variacion === null
          ? ''
          : ` Es ${variacion === 0 ? 'igual que' : `${Math.abs(variacion)}% ${variacion > 0 ? 'más' : 'menos'} que`} ${nombreMes(a.mesAnt).split(' de ')[0]}${a.esActual ? ' al mismo corte' : ''}.`),
    );
    const [t1, n1] = a.tipos[0];
    r.push(`El canal principal fue ${t1} con el ${pct(n1, total)}% de los números${a.tipos[1] ? `, seguido de ${a.tipos[1][0]} (${pct(a.tipos[1][1], total)}%)` : ''}.`);
    const subio = a.tipos
      .map(([k, v]) => ({ k, d: pct(v, total) - pct(a.tiposAnt.get(k) ?? 0, a.ant.length) }))
      .filter((x) => a.ant.length && Math.abs(x.d) >= 5)
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    if (subio) r.push(`${subio.k} ${subio.d > 0 ? 'ganó' : 'perdió'} ${Math.abs(subio.d)} puntos de participación frente al mes anterior.`);
    const intConDato = a.intereses.filter(([k]) => k !== 'Sin dato');
    if (intConDato.length) r.push(`Lo más buscado: ${intConDato.slice(0, 3).map(([k, v]) => `${k.toLowerCase().replace(/\b(gnv|glp)\b/g, (x) => x.toUpperCase())} (${pct(v, total)}%)`).join(', ')}.`);
    r.push(`${pct(a.avanzaron, total)}% llegó a cita o a cliente${a.sinRespuesta ? ` y ${pct(a.sinRespuesta, total)}% no respondió` : ''}.`);
    if (a.picoDia?.n) r.push(`El día con más ingresos fue el ${fechaCorta(a.picoDia.d)} (${a.picoDia.n}).`);
    const sinNombre = total - a.conNombre;
    if (pct(sinNombre, total) >= 30) r.push(`Ojo: a ${pct(sinNombre, total)}% no se le anotó el nombre. Pedirlo en el primer mensaje mejora el seguimiento.`);
    return r;
  }, [a, total, mes, variacion]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Campo etiqueta="Mes a analizar" className="w-52">
          <Selector value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {mayus(nombreMes(m))}
              </option>
            ))}
          </Selector>
        </Campo>
        {a.esActual && total > 0 && <p className="text-[13px] text-gris">Mes en curso: las comparaciones usan el mes anterior hasta el mismo día ({a.dias}).</p>}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Números nuevos" valor={String(total)} delta={variacion} detalle={variacion === null ? 'Sin datos del mes anterior' : `vs ${a.antMismoCorte.length} en ${nombreMes(a.mesAnt, true)}`} />
        <Kpi titulo="Promedio por día" valor={total ? (total / a.dias).toFixed(1) : '0'} detalle={`Promedio mensual (12 meses): ${a.promedio12}`} />
        <Kpi titulo="Llegaron a cita o cliente" valor={`${pct(a.avanzaron, total)}%`} detalle={`${a.avanzaron} de ${total}`} />
        <Kpi titulo="Canal principal" valor={a.tipos[0]?.[0] ?? '—'} detalle={a.tipos[0] ? `${pct(a.tipos[0][1], total)}% de los números` : 'Sin datos'} pequeno />
      </div>

      {total === 0 ? (
        <Panel>
          <Vacio icono={<PhoneIncoming className="h-8 w-8" />} titulo="No hay números en este mes" texto="Cuando registres números nuevos, aquí verás de dónde llegan, qué buscan y cómo se compara con otros meses." />
        </Panel>
      ) : (
        <>
          <Panel titulo="Resumen del mes">
            <ul className="space-y-2 text-[15px] leading-relaxed">
              {resumen.map((t, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rojo" />
                  {t}
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel titulo="Tipo de contacto">
              <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Grafico
                  etiqueta="Distribución de números nuevos por tipo de contacto"
                  alto={240}
                  opcion={{
                    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
                    series: [
                      {
                        type: 'pie',
                        radius: ['52%', '82%'],
                        avoidLabelOverlap: true,
                        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
                        label: { show: true, position: 'inside', formatter: (p: any) => (p.percent >= 8 ? `${Math.round(p.percent)}%` : ''), color: '#fff', fontWeight: 600, fontSize: 12 },
                        data: tiposTop.map(([k, v], i) => ({ name: k, value: v, itemStyle: { color: colorTipo(k, i) } })),
                      },
                    ],
                  }}
                />
                <TablaLeyenda filas={tiposTop.map(([k, v], i) => ({ k, v, color: colorTipo(k, i), ant: a.tiposAnt.get(k) }))} total={total} totalAnt={a.ant.length} />
              </div>
            </Panel>

            <Panel titulo="Interés">
              <BarrasH filas={top(a.intereses, 7)} total={total} />
            </Panel>
          </div>

          <Panel titulo="Comparación con meses anteriores">
            <Grafico
              etiqueta="Números nuevos por mes, últimos 12 meses"
              alto={260}
              opcion={{
                grid: { left: 36, right: 12, top: 24, bottom: 28 },
                tooltip: {
                  trigger: 'axis',
                  axisPointer: { type: 'shadow' },
                  formatter: (ps: any) => {
                    const h = a.historico[ps[0].dataIndex];
                    return `<b>${mayus(nombreMes(h.m))}</b><br/>${h.n} números nuevos<br/>${h.avanzaron} llegaron a cita o cliente`;
                  },
                },
                xAxis: {
                  type: 'category',
                  data: a.historico.map((h) => mayus(nombreMes(h.m, true))),
                  axisTick: { show: false },
                  axisLine: { lineStyle: { color: '#CDD1D7' } },
                },
                yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#EEF0F2' } } },
                series: [
                  {
                    type: 'bar',
                    barMaxWidth: 34,
                    data: a.historico.map((h) => ({
                      value: h.n,
                      itemStyle: { color: h.m === mes ? MAGNITUD : MAGNITUD_SUAVE, borderRadius: [4, 4, 0, 0] },
                    })),
                    label: { show: true, position: 'top', color: '#6A707A', fontSize: 11, formatter: (p: any) => (p.value ? p.value : '') },
                    markLine: a.promedio12
                      ? { symbol: 'none', silent: true, label: { formatter: `Promedio ${a.promedio12}`, position: 'insideEndTop', color: '#6A707A', fontSize: 11 }, lineStyle: { color: '#9AA0A9', type: 'dashed' }, data: [{ yAxis: a.promedio12 }] }
                      : undefined,
                  },
                ],
              }}
            />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel titulo="Ingresos por día">
              <Grafico
                etiqueta="Números nuevos por día del mes"
                alto={220}
                opcion={{
                  grid: { left: 30, right: 8, top: 16, bottom: 26 },
                  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: any) => `${fechaCorta(a.porDia[ps[0].dataIndex].d)}: <b>${ps[0].value}</b>` },
                  xAxis: { type: 'category', data: a.porDia.map((x) => Number(x.d.slice(8))), axisTick: { show: false }, axisLine: { lineStyle: { color: '#CDD1D7' } }, axisLabel: { interval: 1 } },
                  yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#EEF0F2' } } },
                  series: [{ type: 'bar', barMaxWidth: 14, data: a.porDia.map((x) => x.n), itemStyle: { color: MAGNITUD, borderRadius: [3, 3, 0, 0] } }],
                }}
              />
            </Panel>
            <Panel titulo="Por día de la semana">
              <BarrasH filas={a.porSemana.map((x) => [x.nombre, x.n] as [string, number])} total={total} ordenFijo />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel titulo="En qué terminaron">
              <BarrasH filas={a.estados.map(([k, v]) => [estadoNumero(k).nombre, v] as [string, number])} total={total} />
            </Panel>
            <Panel titulo="Calidad del registro">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Dato titulo="Con nombre" valor={`${pct(a.conNombre, total)}%`} />
                <Dato titulo="Con placa" valor={`${pct(a.conPlaca, total)}%`} />
                <Dato titulo="Con área" valor={`${pct(total - (a.areas.find(([k]) => k === 'Sin dato')?.[1] ?? 0), total)}%`} />
                <Dato titulo="Sin respuesta" valor={`${pct(a.sinRespuesta, total)}%`} />
              </dl>
              {a.areas.some(([k]) => k !== 'Sin dato') && (
                <div className="mt-5 border-t border-linea pt-4">
                  <p className="mb-2 text-[13px] font-medium text-gris">Por área</p>
                  <BarrasH filas={a.areas} total={total} />
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, detalle, delta, pequeno }: { titulo: string; valor: string; detalle?: string; delta?: number | null; pequeno?: boolean }) {
  return (
    <div className="rounded-lg border border-linea bg-white px-4 py-3.5">
      <p className="text-[13px] text-gris">{titulo}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className={cx('font-display font-bold leading-tight text-tinta num', pequeno ? 'truncate text-2xl' : 'text-[32px]')}>{valor}</p>
        {delta != null && (
          <span className={cx('flex items-center text-[13px] font-semibold num', delta > 0 ? 'text-ok' : delta < 0 ? 'text-rojo' : 'text-gris')}>
            {delta > 0 ? <ArrowUpRight className="h-4 w-4" /> : delta < 0 ? <ArrowDownRight className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {detalle && <p className="mt-0.5 truncate text-xs text-gris">{detalle}</p>}
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[13px] text-gris">{titulo}</dt>
      <dd className="font-display text-2xl font-bold num">{valor}</dd>
    </div>
  );
}

/** Leyenda en forma de tabla: identidad por color + nombre, cantidad, % y cambio vs mes anterior. */
function TablaLeyenda({ filas, total, totalAnt }: { filas: { k: string; v: number; color: string; ant?: number }[]; total: number; totalAnt: number }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[12px] text-gris">
          <th className="pb-1.5 font-medium">Tipo</th>
          <th className="pb-1.5 text-right font-medium">N.°</th>
          <th className="pb-1.5 text-right font-medium">%</th>
          <th className="pb-1.5 text-right font-medium" title="Puntos de diferencia frente al mes anterior">vs ant.</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => {
          const d = totalAnt ? pct(f.v, total) - pct(f.ant ?? 0, totalAnt) : null;
          return (
            <tr key={f.k} className="border-t border-linea">
              <td className="py-1.5">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: f.color }} />
                  <span className="truncate">{f.k}</span>
                </span>
              </td>
              <td className="py-1.5 text-right num">{f.v}</td>
              <td className="py-1.5 text-right font-semibold num">{pct(f.v, total)}%</td>
              <td className={cx('py-1.5 text-right text-[13px] num', d == null || d === 0 ? 'text-gris' : d > 0 ? 'text-ok' : 'text-rojo')}>
                {d == null ? '—' : `${d > 0 ? '+' : ''}${d} pts`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Barras horizontales simples (un solo color = magnitud), con cantidad y %. */
function BarrasH({ filas, total, ordenFijo }: { filas: [string, number][]; total: number; ordenFijo?: boolean }) {
  const lista = ordenFijo ? filas : [...filas].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...lista.map(([, v]) => v));
  return (
    <ul className="space-y-2">
      {lista.map(([k, v]) => (
        <li key={k} className="grid grid-cols-[minmax(90px,150px)_minmax(0,1fr)_64px] items-center gap-3 text-sm" title={`${k}: ${v} (${pct(v, total)}%)`}>
          <span className="truncate">{k}</span>
          <span className="h-3 overflow-hidden rounded-r bg-fondo">
            <span className="block h-full rounded-r" style={{ width: `${(v / max) * 100}%`, background: k === 'Otros' || k === 'Sin dato' ? OTROS : MAGNITUD }} />
          </span>
          <span className="text-right num">
            <span className="font-semibold">{v}</span> <span className="text-[12px] text-gris">{pct(v, total)}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Check, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useDatos } from '../data/store';
import { useAuth } from '../data/auth';
import { leerArchivo, texto, type Hoja } from '../import/lectura';
import {
  PLANTILLAS,
  construirAgenda,
  construirTabla,
  detectarEncabezado,
  esAgenda,
  mapeoAutomatico,
  sugerirPlantilla,
  type Plantilla,
  type PlantillaTabla,
} from '../import/plantillas';
import { integrar, revisar, type EstadoFila, type Revision } from '../import/integrar';
import { cx, uid } from '../lib/utils';
import type { NombreColeccion } from '../lib/types';
import { Boton, Entrada, Etiqueta, Modal, Paginacion, Panel, Selector, Tabla, Td, Th, useAvisos } from './ui';

type Paso = 1 | 2 | 3 | 4;

const PASOS = ['Archivo', 'Formato', 'Revisión', 'Listo'];

const ESTADO_FILA: Record<EstadoFila, { nombre: string; tono: 'ok' | 'info' | 'gris' | 'rojo' | 'aviso' }> = {
  nuevo: { nombre: 'Nuevo', tono: 'ok' },
  existe: { nombre: 'Ya existe', tono: 'info' },
  enArchivo: { nombre: 'Se une', tono: 'info' },
  repetido: { nombre: 'Repetido', tono: 'gris' },
  error: { nombre: 'Error', tono: 'rojo' },
};

/**
 * Importador de Excel en una ventana. Cada sección lo abre con sus formatos
 * (Agenda → «Agenda de citas», Cambio de aceite → «Seguimiento de aceite», etc.).
 */
export function ImportadorExcel({ plantillas: ids, titulo = 'Importar Excel', onCerrar }: { plantillas: string[]; titulo?: string; onCerrar: () => void }) {
  const PERMITIDAS = useMemo(() => PLANTILLAS.filter((p) => ids.includes(p.id)), [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugerir = (h: Hoja) => {
    const s = sugerirPlantilla(h);
    return PERMITIDAS.some((p) => p.id === s.id) ? s : PERMITIDAS[0];
  };
  const { datos, crearVarios, editar, crear } = useDatos();
  const { usuario } = useAuth();
  const avisar = useAvisos();
  const input = useRef<HTMLInputElement>(null);
  const [paso, setPaso] = useState<Paso>(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hoja, setHoja] = useState(0);
  const [hojasAgenda, setHojasAgenda] = useState<number[]>([]);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, number | null>>({});
  const [revisiones, setRevisiones] = useState<Revision[]>([]);
  const [filtro, setFiltro] = useState<EstadoFila | 'todas' | 'avisos'>('todas');
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<{ creadas: number; fusionadas: number; omitidas: number; registros: Record<string, number> } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const enc = useMemo(() => (hojas[hoja] ? detectarEncabezado(hojas[hoja]) : null), [hojas, hoja]);

  const elegirHoja = (i: number, hs = hojas) => {
    setHoja(i);
    const p = sugerir(hs[i]);
    setPlantilla(p);
    if (p.tipo === 'tabla') setMapeo(mapeoAutomatico(p, detectarEncabezado(hs[i]).columnas));
    if (p.tipo === 'agenda') setHojasAgenda(hs.map((h, k) => (esAgenda(h) ? k : -1)).filter((k) => k >= 0));
  };

  const abrir = async (f: File) => {
    setError('');
    if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) {
      setError('El archivo debe ser de Excel (.xlsx o .xls).');
      return;
    }
    setCargando(true);
    try {
      const hs = (await leerArchivo(f)).filter((h) => h.filas.some((r) => (r ?? []).some((c) => texto(c))));
      if (!hs.length) throw new Error('vacío');
      setArchivo(f);
      setHojas(hs);
      // Elige la hoja más grande que no esté vacía
      const mayor = hs.reduce((m, h, i) => (h.filas.length > hs[m].filas.length && !/stock/i.test(h.nombre) ? i : m), 0);
      elegirHoja(mayor, hs);
      setPaso(2);
    } catch {
      setError('No se pudo leer el archivo. Revisa que no esté protegido con contraseña ni dañado.');
    } finally {
      setCargando(false);
    }
  };

  const faltanRequeridos =
    plantilla?.tipo === 'tabla' ? plantilla.campos.filter((c) => c.requerido && mapeo[c.id] == null).map((c) => c.nombre) : [];

  const revisarDatos = () => {
    if (!plantilla) return;
    const props =
      plantilla.tipo === 'agenda'
        ? construirAgenda(hojasAgenda.map((i) => hojas[i]), anio)
        : construirTabla(hojas[hoja], plantilla, mapeo, enc!.fila);
    if (!props.length) {
      setError('No se encontraron filas con datos en esta hoja con el formato elegido.');
      return;
    }
    setError('');
    setRevisiones(revisar(props, datos));
    setFiltro('todas');
    setPagina(1);
    setPaso(3);
  };

  const conteo = useMemo(() => {
    const m: Record<string, number> = { todas: revisiones.length, avisos: 0 };
    for (const r of revisiones) {
      m[r.estado] = (m[r.estado] ?? 0) + 1;
      if (r.p.avisos.length) m.avisos++;
    }
    return m;
  }, [revisiones]);
  const aImportar = revisiones.filter((r) => r.importar).length;
  const visibles = revisiones.filter((r) => (filtro === 'todas' ? true : filtro === 'avisos' ? r.p.avisos.length > 0 : r.estado === filtro));

  const importar = async () => {
    if (!plantilla || !archivo) return;
    setCargando(true);
    try {
      const impId = uid();
      const res = integrar(revisiones, datos, impId, usuario?.nombre ?? 'Sistema');
      const ids: Record<string, string[]> = {};
      const registros: Record<string, number> = {};
      for (const [col, docs] of Object.entries(res.creados)) {
        if (!docs?.length) continue;
        ids[col] = await crearVarios(col as NombreColeccion, docs as any);
        registros[col] = docs.length;
      }
      for (const x of res.parches) await editar(x.col, x.id, x.patch as any);
      await crear('importaciones', {
        id: impId,
        archivo: archivo.name,
        plantilla: plantilla.nombre,
        leidas: revisiones.length,
        creadas: res.creadas,
        fusionadas: res.fusionadas,
        omitidas: res.omitidas,
        ids,
      });
      setResultado({ creadas: res.creadas, fusionadas: res.fusionadas, omitidas: res.omitidas, registros });
      setPaso(4);
      avisar(`Importación terminada: ${res.creadas + res.fusionadas} filas guardadas.`);
    } catch (e) {
      console.error(e);
      avisar('La importación se detuvo por un error de conexión. Revisa el historial en Ajustes antes de reintentar.', 'error');
    } finally {
      setCargando(false);
    }
  };

  const reiniciar = () => {
    setPaso(1);
    setArchivo(null);
    setHojas([]);
    setRevisiones([]);
    setResultado(null);
    setError('');
  };

  const muestra = (indice: number) =>
    hojas[hoja]?.filas
      .slice((enc?.fila ?? 0) + 1)
      .map((f) => texto((f ?? [])[indice] ?? null))
      .filter(Boolean)
      .slice(0, 3)
      .join(' · ');

  const NOMBRE_COL: Record<string, string> = {
    clientes: 'clientes',
    vehiculos: 'vehículos',
    interacciones: 'contactos en el historial',
    serviciosAceite: 'servicios de aceite',
    citas: 'citas',
    bloqueos: 'bloqueos de agenda',
    empresas: 'empresas',
    filtros: 'filtros',
    movimientos: 'movimientos de inventario',
    productos: 'productos',
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion="El sistema reconoce las columnas, limpia celulares, placas y fechas, y evita duplicados antes de guardar."
      ancho="xl"
    >

      <ol className="mb-6 flex flex-wrap gap-x-6 gap-y-2" aria-label="Pasos">
        {PASOS.map((n, i) => {
          const k = (i + 1) as Paso;
          const hecho = paso > k;
          return (
            <li key={n} className={cx('flex items-center gap-2 text-sm font-semibold', paso === k ? 'text-tinta' : hecho ? 'text-ok' : 'text-gris-claro')}>
              <span
                className={cx(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  paso === k ? 'bg-carbon text-white' : hecho ? 'bg-ok-suave text-ok' : 'border border-linea-fuerte',
                )}
              >
                {hecho ? <Check className="h-3.5 w-3.5" /> : k}
              </span>
              {n}
            </li>
          );
        })}
      </ol>

      {paso === 1 && (
        <Panel>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              const f = e.dataTransfer.files[0];
              if (f) void abrir(f);
            }}
            className={cx(
              'flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
              arrastrando ? 'border-rojo bg-rojo-suave/40' : 'border-linea-fuerte',
            )}
          >
            <UploadCloud className="h-10 w-10 text-gris-claro" />
            <p className="mt-4 font-display text-2xl font-bold uppercase tracking-tight">Arrastra tu Excel aquí</p>
            <p className="mt-1 text-sm text-gris">Archivos .xlsx o .xls</p>
            <Boton className="mt-5" variante="secundario" onClick={() => input.current?.click()} disabled={cargando}>
              {cargando ? 'Leyendo archivo…' : 'Elegir archivo'}
            </Boton>
            <input
              ref={input}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void abrir(f);
                e.target.value = '';
              }}
            />
          </div>
          {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Formatos que reconoce</p>
            <ul className="grid gap-x-6 gap-y-2 text-sm text-gris sm:grid-cols-2">
              {PERMITIDAS.map((p) => (
                <li key={p.id}>
                  <span className="font-medium text-tinta">{p.nombre}.</span> {p.descripcion}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      {paso === 2 && plantilla && (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Panel titulo="Archivo">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{archivo?.name}</p>
                <p className="text-[13px] text-gris">{hojas.length} hojas con datos</p>
              </div>
            </div>
            <div className="mt-5 space-y-4">
              {plantilla.tipo === 'tabla' && (
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium">Hoja</span>
                  <Selector value={hoja} onChange={(e) => elegirHoja(Number(e.target.value))}>
                    {hojas.map((h, i) => (
                      <option key={h.nombre} value={i}>
                        {h.nombre} ({h.filas.length} filas)
                      </option>
                    ))}
                  </Selector>
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Formato</span>
                <Selector
                  value={plantilla.id}
                  onChange={(e) => {
                    const p = PERMITIDAS.find((x) => x.id === e.target.value)!;
                    setPlantilla(p);
                    if (p.tipo === 'tabla') setMapeo(mapeoAutomatico(p, enc!.columnas));
                    else setHojasAgenda(hojas.map((h, k) => (esAgenda(h) ? k : -1)).filter((k) => k >= 0));
                  }}
                >
                  {PERMITIDAS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Selector>
                <span className="mt-1 block text-xs text-gris">{plantilla.descripcion}</span>
              </label>
              <Boton variante="fantasma" tam="sm" onClick={reiniciar}>
                Elegir otro archivo
              </Boton>
            </div>
          </Panel>

          {plantilla.tipo === 'tabla' ? (
            <Panel titulo="Columnas" acciones={<span className="text-[13px] text-gris">Encabezados en la fila {(enc?.fila ?? 0) + 1}</span>} sinRelleno>
              <p className="border-b border-linea px-5 py-3 text-sm text-gris">
                Revisa que cada dato apunte a la columna correcta. Las que se reconocieron solas ya están elegidas.
              </p>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Dato del sistema</Th>
                    <Th className="w-[34%]">Columna del Excel</Th>
                    <Th>Ejemplo</Th>
                  </tr>
                </thead>
                <tbody>
                  {(plantilla as PlantillaTabla).campos.map((c) => (
                    <tr key={c.id}>
                      <Td className="font-medium">
                        {c.nombre}
                        {c.requerido && <span className="ml-0.5 text-rojo">*</span>}
                      </Td>
                      <Td>
                        <Selector
                          value={mapeo[c.id] ?? ''}
                          onChange={(e) => setMapeo({ ...mapeo, [c.id]: e.target.value === '' ? null : Number(e.target.value) })}
                          invalido={c.requerido && mapeo[c.id] == null}
                          className="h-9"
                        >
                          <option value="">No importar</option>
                          {enc?.columnas.map((col) => (
                            <option key={col.indice} value={col.indice}>
                              {col.nombre}
                            </option>
                          ))}
                        </Selector>
                      </Td>
                      <Td className="max-w-[320px] truncate text-[13px] text-gris">{mapeo[c.id] != null ? muestra(mapeo[c.id]!) || '—' : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-linea px-5 py-3.5">
                {faltanRequeridos.length > 0 && <p className="text-sm text-rojo">Falta elegir: {faltanRequeridos.join(', ')}</p>}
                {error && <p className="text-sm text-rojo">{error}</p>}
                <Boton onClick={revisarDatos} disabled={faltanRequeridos.length > 0}>
                  Revisar datos
                </Boton>
              </div>
            </Panel>
          ) : (
            <Panel titulo="Hojas de la agenda">
              <p className="text-sm text-gris">Elige los meses que quieres pasar al sistema. Cada semana, día, área y hora se lee del calendario.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {hojas.map((h, i) =>
                  esAgenda(h) ? (
                    <label key={h.nombre} className="flex items-center gap-2.5 rounded-md border border-linea px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-rojo"
                        checked={hojasAgenda.includes(i)}
                        onChange={(e) => setHojasAgenda(e.target.checked ? [...hojasAgenda, i] : hojasAgenda.filter((x) => x !== i))}
                      />
                      {h.nombre}
                    </label>
                  ) : null,
                )}
              </div>
              <label className="mt-5 block max-w-[200px]">
                <span className="mb-1.5 block text-[13px] font-medium">Año de las fechas</span>
                <Entrada inputMode="numeric" value={anio} onChange={(e) => setAnio(Number(e.target.value.replace(/\D/g, '')) || anio)} />
                <span className="mt-1 block text-xs text-gris">El calendario solo dice «Lunes 12/10».</span>
              </label>
              <p className="mt-5 text-[13px] text-gris">
                Las citas de fechas pasadas se guardan como «Asistió». Las celdas con nombres o «no agenden» se guardan como bloqueos.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3 border-t border-linea pt-4">
                {error && <p className="text-sm text-rojo">{error}</p>}
                <Boton onClick={revisarDatos} disabled={!hojasAgenda.length}>
                  Revisar datos
                </Boton>
              </div>
            </Panel>
          )}
        </div>
      )}

      {paso === 3 && (
        <Panel sinRelleno>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todas', 'Todas'],
                  ['nuevo', 'Nuevas'],
                  ['existe', 'Ya existen'],
                  ['enArchivo', 'Se unen'],
                  ['repetido', 'Repetidas'],
                  ['error', 'Con error'],
                  ['avisos', 'Con avisos'],
                ] as [typeof filtro, string][]
              )
                .filter(([k]) => k === 'todas' || conteo[k])
                .map(([k, n]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setFiltro(k);
                      setPagina(1);
                    }}
                    className={cx(
                      'rounded-full border px-3 py-1 text-[13px] font-semibold',
                      filtro === k ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
                    )}
                  >
                    {n} <span className="opacity-60">{conteo[k] ?? 0}</span>
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <Boton variante="secundario" onClick={() => setPaso(2)}>
                Volver
              </Boton>
              <Boton onClick={importar} disabled={cargando || !aImportar}>
                {cargando ? 'Importando…' : `Importar ${aImportar.toLocaleString('es-PE')} filas`}
              </Boton>
            </div>
          </div>
          <Tabla>
            <thead>
              <tr>
                <Th className="w-12">
                  <span className="sr-only">Importar</span>
                </Th>
                <Th className="w-16">Fila</Th>
                <Th>Registro</Th>
                <Th>Estado</Th>
                <Th>Observaciones</Th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice((pagina - 1) * 50, pagina * 50).map((r) => {
                const e = ESTADO_FILA[r.estado];
                return (
                  <tr key={r.p.fila + r.p.resumen} className={!r.importar ? 'bg-[#FAFAFB] text-gris' : ''}>
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Importar fila ${r.p.fila}`}
                        className="h-4 w-4 accent-rojo"
                        disabled={r.estado === 'error'}
                        checked={r.importar}
                        onChange={(ev) => setRevisiones((rs) => rs.map((x) => (x === r ? { ...x, importar: ev.target.checked } : x)))}
                      />
                    </Td>
                    <Td className="num text-gris">{r.p.fila}</Td>
                    <Td className="max-w-[420px] truncate font-medium">{r.p.resumen}</Td>
                    <Td>
                      <Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>
                    </Td>
                    <Td className="text-[13px] text-gris">{[r.detalle, ...r.p.avisos].filter(Boolean).join(' · ') || '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
          <Paginacion pagina={pagina} total={visibles.length} porPagina={50} onCambio={setPagina} />
        </Panel>
      )}

      {paso === 4 && resultado && (
        <Panel>
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold">Importación terminada</h2>
              <p className="mt-1 text-sm text-gris">
                {resultado.creadas.toLocaleString('es-PE')} filas nuevas, {resultado.fusionadas.toLocaleString('es-PE')} unidas a registros existentes y{' '}
                {resultado.omitidas.toLocaleString('es-PE')} omitidas.
              </p>
              <ul className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
                {Object.entries(resultado.registros).map(([k, n]) => (
                  <li key={k}>
                    <span className="font-semibold num">{n.toLocaleString('es-PE')}</span> {NOMBRE_COL[k] ?? k}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] text-gris">Si algo no quedó bien, puedes revertir esta importación desde Ajustes, en Importaciones.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Boton onClick={onCerrar}>Listo</Boton>
                <Boton variante="secundario" onClick={reiniciar}>
                  Importar otro archivo
                </Boton>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </Modal>
  );
}

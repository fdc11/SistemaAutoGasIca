import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { backend } from './backend';
import { useAuth } from './auth';
import { COLECCIONES, type Base, type Colecciones, type Listas, type NombreColeccion, type Nuevo } from '../lib/types';
import { LISTAS_INICIALES } from '../lib/catalogos';
import { ahoraISO, uid } from '../lib/utils';
import { sembrarDemo } from './demo';

type Estado = { [K in NombreColeccion]: Colecciones[K][] };

interface DatosCtx {
  datos: Estado;
  listo: boolean;
  modo: 'firebase' | 'demo';
  listas: Listas;
  /** Persona que está usando la computadora del taller en este momento. */
  asesor: string;
  setAsesor(nombre: string): void;
  autor: string;
  crear<K extends NombreColeccion>(col: K, data: Nuevo<Colecciones[K]>): Promise<string>;
  crearVarios<K extends NombreColeccion>(col: K, items: Nuevo<Colecciones[K]>[]): Promise<string[]>;
  editar<K extends NombreColeccion>(col: K, id: string, patch: Partial<Colecciones[K]>): Promise<void>;
  eliminar(col: NombreColeccion, id: string): Promise<void>;
  restaurar(col: NombreColeccion, id: string): Promise<void>;
  borrarDefinitivo(col: NombreColeccion, ids: string[]): Promise<void>;
  guardarListas(l: Partial<Listas>): Promise<void>;
}

const vacio = () => Object.fromEntries(COLECCIONES.map((c) => [c, []])) as unknown as Estado;

const Ctx = createContext<DatosCtx>(null as any);

export function DataProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [datos, setDatos] = useState<Estado>(vacio);
  const [cargadas, setCargadas] = useState<Set<string>>(new Set());
  const sembrado = useRef(false);
  const [asesor, setAsesorState] = useState<string>(() => {
    try {
      return localStorage.getItem('autogas-asesor') ?? '';
    } catch {
      return '';
    }
  });
  const setAsesor = (n: string) => {
    setAsesorState(n);
    try {
      localStorage.setItem('autogas-asesor', n);
    } catch {
      /* sin almacenamiento: se mantiene mientras la página esté abierta */
    }
  };
  const autor = asesor || usuario?.nombre || 'Sistema';

  useEffect(() => {
    if (!usuario) return;
    const unsubs = COLECCIONES.map((col) =>
      backend.subscribe(col, (docs) => {
        setDatos((d) => ({ ...d, [col]: docs }));
        setCargadas((s) => (s.has(col) ? s : new Set(s).add(col)));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [usuario]);

  const listo = cargadas.size === COLECCIONES.length;

  // En modo demostración se cargan datos de ejemplo la primera vez.
  useEffect(() => {
    if (!listo || sembrado.current || backend.modo !== 'demo') return;
    sembrado.current = true;
    if (datos.ajustes.length === 0 && datos.clientes.length === 0) void sembrarDemo(autor);
  }, [listo]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = useCallback(
    (): Pick<Base, 'creadoEn' | 'creadoPor'> => ({ creadoEn: ahoraISO(), creadoPor: autor }),
    [autor],
  );

  const crear: DatosCtx['crear'] = async (col, data) => {
    const id = (data as any).id || uid();
    await backend.set(col, id, { ...meta(), ...(data as any), id });
    return id;
  };

  const crearVarios: DatosCtx['crearVarios'] = async (col, items) => {
    const m = meta();
    const docs = items.map((x: any) => ({ ...m, ...x, id: x.id || uid() }));
    await backend.setMany(col, docs);
    return docs.map((x) => x.id);
  };

  const editar: DatosCtx['editar'] = async (col, id, patch) => {
    await backend.update(col, id, { ...(patch as any), actualizadoEn: ahoraISO(), actualizadoPor: autor });
  };

  const eliminar = async (col: NombreColeccion, id: string) => {
    await backend.update(col, id, { eliminado: true, eliminadoEn: ahoraISO(), actualizadoPor: autor });
  };
  const restaurar = async (col: NombreColeccion, id: string) => {
    await backend.update(col, id, { eliminado: false, eliminadoEn: null as any, actualizadoPor: autor });
  };
  const borrarDefinitivo = async (col: NombreColeccion, ids: string[]) => {
    await backend.removeMany(col, ids);
  };

  const listas: Listas = useMemo(() => {
    const l = datos.ajustes.find((x) => x.id === 'listas');
    return { id: 'listas', creadoEn: '', creadoPor: '', ...LISTAS_INICIALES, ...(l ?? {}) } as Listas;
  }, [datos.ajustes]);

  const guardarListas = async (l: Partial<Listas>) => {
    const existe = datos.ajustes.some((x) => x.id === 'listas');
    if (existe) await editar('ajustes', 'listas', l);
    else await backend.set('ajustes', 'listas', { ...meta(), ...LISTAS_INICIALES, ...l, id: 'listas' });
  };

  const value: DatosCtx = {
    datos,
    listo,
    modo: backend.modo,
    listas,
    asesor,
    setAsesor,
    autor,
    crear,
    crearVarios,
    editar,
    eliminar,
    restaurar,
    borrarDefinitivo,
    guardarListas,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDatos = () => useContext(Ctx);

/** Registros activos (sin los que están en la papelera). */
export function useActivos<K extends NombreColeccion>(col: K): Colecciones[K][] {
  const { datos } = useDatos();
  return useMemo(() => (datos[col] as any[]).filter((x) => !x.eliminado), [datos[col]]); // eslint-disable-line
}

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Search, X, AlertTriangle } from 'lucide-react';
import { cx } from '../lib/utils';
import type { Tono } from '../lib/catalogos';

/* ---------- Botones ---------- */

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-rojo text-white hover:bg-rojo-osc disabled:bg-rojo/50',
  secundario: 'bg-white text-tinta border border-linea-fuerte hover:bg-fondo disabled:text-gris-claro',
  fantasma: 'text-tinta hover:bg-fondo disabled:text-gris-claro',
  peligro: 'bg-white text-rojo border border-rojo/40 hover:bg-rojo-suave',
};

export const Boton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tam?: 'sm' | 'md'; icono?: ReactNode }
>(function Boton({ variante = 'primario', tam = 'md', icono, className, children, type = 'button', ...p }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        tam === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        VARIANTES[variante],
        className,
      )}
      {...p}
    >
      {icono}
      {children}
    </button>
  );
});

export function BotonIcono({
  titulo,
  children,
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { titulo: string }) {
  return (
    <button
      type="button"
      aria-label={titulo}
      title={titulo}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-md text-gris hover:bg-fondo hover:text-tinta', className)}
      {...p}
    >
      {children}
    </button>
  );
}

/* ---------- Campos ---------- */

const baseCampo =
  'w-full rounded-md border border-linea-fuerte bg-white px-3 text-sm text-tinta placeholder:text-gris-claro focus:border-tinta/60 focus:outline-none focus:ring-2 focus:ring-tinta/10 disabled:bg-fondo disabled:text-gris';

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(
  function Entrada({ className, invalido, ...p }, ref) {
    return <input ref={ref} className={cx(baseCampo, 'h-10', invalido && 'border-rojo', className)} {...p} />;
  },
);

export function Selector({
  className,
  children,
  invalido,
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean }) {
  return (
    <select className={cx(baseCampo, 'h-10 pr-8', invalido && 'border-rojo', className)} {...p}>
      {children}
    </select>
  );
}

export function AreaTexto({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(baseCampo, 'min-h-[84px] py-2 leading-relaxed', className)} {...p} />;
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className,
  requerido,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  requerido?: boolean;
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-tinta">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rojo">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rojo">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-gris">{ayuda}</span>
      ) : null}
    </label>
  );
}

/** Como Campo, pero sin <label>: para grupos de botones (un label activaría el primer botón al hacer clic en el título). */
export function Grupo({ etiqueta, ayuda, error, children, className, requerido }: { etiqueta: string; ayuda?: string; error?: string; children: ReactNode; className?: string; requerido?: boolean }) {
  return (
    <div role="group" aria-label={etiqueta} className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-tinta">
        {etiqueta}
        {requerido && <span className="ml-0.5 text-rojo">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rojo">{error}</span> : ayuda ? <span className="mt-1 block text-xs text-gris">{ayuda}</span> : null}
    </div>
  );
}

export function Buscador({
  valor,
  onCambio,
  placeholder = 'Buscar',
  className,
}: {
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris-claro" />
      <Entrada value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} className="pl-9" />
      {valor && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => onCambio('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gris hover:text-tinta"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------- Estructura ---------- */

export function Encabezado({
  titulo,
  descripcion,
  acciones,
  migas,
}: {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  migas?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {migas && <div className="mb-2 text-[13px] text-gris">{migas}</div>}
        <h1 className="font-display text-[32px] font-bold uppercase leading-none tracking-tight text-tinta sm:text-[38px]">
          {titulo}
        </h1>
        <div className="mt-2.5 h-[3px] w-10 rounded-full bg-rojo" />
        {descripcion && <p className="mt-3 max-w-2xl text-sm text-gris">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

export function Panel({
  titulo,
  acciones,
  children,
  className,
  sinRelleno,
}: {
  titulo?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  sinRelleno?: boolean;
}) {
  return (
    <section className={cx('rounded-lg border border-linea bg-white', className)}>
      {(titulo || acciones) && (
        <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3.5">
          {titulo && <h2 className="text-[15px] font-semibold text-tinta">{titulo}</h2>}
          {acciones && <div className="flex items-center gap-2">{acciones}</div>}
        </div>
      )}
      <div className={sinRelleno ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

const TONOS: Record<Tono, string> = {
  gris: 'bg-[#EEEFF1] text-[#4B5059]',
  info: 'bg-info-suave text-info',
  aviso: 'bg-aviso-suave text-aviso',
  ok: 'bg-ok-suave text-ok',
  rojo: 'bg-rojo-suave text-rojo-osc',
};

export function Etiqueta({ tono = 'gris', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Vacio({ titulo, texto, accion, icono }: { titulo: string; texto?: string; accion?: ReactNode; icono?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icono && <div className="mb-3 text-gris-claro">{icono}</div>}
      <p className="font-semibold text-tinta">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-gris">{texto}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  onCambio,
  className,
}: {
  opciones: { id: T; nombre: string; cuenta?: number }[];
  valor: T;
  onCambio: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-linea', className)}>
      {opciones.map((o) => (
        <button
          key={o.id}
          role="tab"
          type="button"
          aria-selected={valor === o.id}
          onClick={() => onCambio(o.id)}
          className={cx(
            '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
            valor === o.id ? 'border-rojo text-tinta' : 'border-transparent text-gris hover:text-tinta',
          )}
        >
          {o.nombre}
          {o.cuenta != null && (
            <span className={cx('rounded-full px-1.5 text-xs', valor === o.id ? 'bg-tinta text-white' : 'bg-fondo text-gris')}>
              {o.cuenta}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- Tablas ---------- */

export function Tabla({ children, className, compacta }: { children: ReactNode; className?: string; compacta?: boolean }) {
  return (
    <div className={cx('overflow-x-auto', className)}>
      <table className={cx('w-full border-collapse text-sm', !compacta && 'min-w-[640px]')}>{children}</table>
    </div>
  );
}
export function Th({ children, className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx('sticky top-0 z-[1] whitespace-nowrap border-b border-linea bg-[#F8F9FA] px-4 py-2.5 text-left text-[12.5px] font-semibold text-gris', className)}
      {...p}
    >
      {children}
    </th>
  );
}
export function Td({ children, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cx('border-b border-linea px-4 py-3 align-middle text-tinta', className)} {...p}>
      {children}
    </td>
  );
}

export function Paginacion({
  pagina,
  total,
  porPagina,
  onCambio,
}: {
  pagina: number;
  total: number;
  porPagina: number;
  onCambio: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-gris">
      <span>
        {desde.toLocaleString('es-PE')}–{hasta.toLocaleString('es-PE')} de {total.toLocaleString('es-PE')}
      </span>
      <div className="flex items-center gap-1">
        <BotonIcono titulo="Página anterior" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)} className="disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </BotonIcono>
        <span className="px-2 text-tinta">
          {pagina} / {paginas}
        </span>
        <BotonIcono titulo="Página siguiente" disabled={pagina >= paginas} onClick={() => onCambio(pagina + 1)} className="disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </BotonIcono>
      </div>
    </div>
  );
}

/* ---------- Ventana modal ---------- */

export function Modal({
  abierto,
  onCerrar,
  titulo,
  descripcion,
  children,
  pie,
  ancho = 'md',
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  const anchos = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-carbon/50 sm:items-center sm:p-6" onMouseDown={onCerrar}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-modal sm:rounded-xl', anchos[ancho])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-linea px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-gris">{descripcion}</p>}
          </div>
          <BotonIcono titulo="Cerrar" onClick={onCerrar}>
            <X className="h-4 w-4" />
          </BotonIcono>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {pie && <div className="flex justify-end gap-2 border-t border-linea px-6 py-3.5">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Avisos ---------- */

type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' };
const AvisosCtx = createContext<(texto: string, tipo?: 'ok' | 'error') => void>(() => {});

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg bg-carbon px-4 py-3 text-sm text-white shadow-modal"
          >
            {a.tipo === 'ok' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#6FD3A0]" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#FF8A8F]" />
            )}
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}
export const useAvisos = () => useContext(AvisosCtx);

/* ---------- Confirmación ---------- */

export function Confirmar({
  abierto,
  titulo,
  texto,
  accion,
  peligro,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  texto: string;
  accion: string;
  peligro?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={titulo}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            variante={peligro ? 'primario' : 'primario'}
            onClick={() => {
              onConfirmar();
              onCerrar();
            }}
          >
            {accion}
          </Boton>
        </>
      }
    >
      <p className="text-sm text-gris">{texto}</p>
    </Modal>
  );
}

/* ---------- Dato ---------- */

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-gris">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-tinta">{children || '—'}</dd>
    </div>
  );
}

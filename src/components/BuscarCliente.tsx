import { useMemo, useState } from 'react';
import { Search, UserCheck } from 'lucide-react';
import { useActivos } from '../data/store';
import type { Cliente } from '../lib/types';
import { esNombreRelleno, formatoCelular, normalizarPlaca, plano } from '../lib/utils';
import { Entrada } from './ui';

export type ClienteElegido = { cliente: Cliente; placas: string[] };

/** Buscador de clientes de la base por nombre, celular o placa (ignora tildes, espacios y guiones). */
export function useBuscarClientes() {
  const clientes = useActivos('clientes');
  const vehiculos = useActivos('vehiculos');
  const placasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of vehiculos) if (v.clienteId) m.set(v.clienteId, [...(m.get(v.clienteId) ?? []), v.placa]);
    return m;
  }, [vehiculos]);
  const buscar = (q: string, max = 6): ClienteElegido[] => {
    const t = plano(q);
    const dig = q.replace(/\D/g, '');
    const pla = normalizarPlaca(q);
    if (t.length < 2) return [];
    const out: ClienteElegido[] = [];
    for (const c of clientes) {
      const placas = placasDe.get(c.id) ?? [];
      const ok =
        (!esNombreRelleno(c.nombre) && plano(c.nombre).includes(t)) ||
        (dig.length >= 3 && c.celular.includes(dig)) ||
        (pla.length >= 3 && placas.some((p) => p.includes(pla)));
      if (ok) out.push({ cliente: c, placas });
      if (out.length >= max) break;
    }
    return out;
  };
  return { buscar, placasDe };
}

/** Campo de búsqueda con lista desplegable. Al elegir, llama a onElegir. */
export function BuscarCliente({
  onElegir,
  placeholder = 'Nombre, celular o placa',
  vacio = 'No está en la base. Llena sus datos abajo y se registrará solo.',
  extra,
}: {
  onElegir: (e: ClienteElegido) => void;
  placeholder?: string;
  vacio?: string;
  /** Texto adicional por cliente (p. ej., su empresa). */
  extra?: (c: Cliente) => string | undefined;
}) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const { buscar } = useBuscarClientes();
  const lista = buscar(q);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris-claro" />
      <Entrada
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        placeholder={placeholder}
        className="pl-9"
      />
      {abierto && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-linea bg-white shadow-modal">
          {lista.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-gris">{vacio}</p>
          ) : (
            <ul className="max-h-64 divide-y divide-linea overflow-y-auto">
              {lista.map((e) => (
                <li key={e.cliente.id}>
                  <button
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      onElegir(e);
                      setQ('');
                      setAbierto(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-fondo"
                  >
                    <UserCheck className="h-4 w-4 shrink-0 text-gris-claro" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{esNombreRelleno(e.cliente.nombre) ? 'Sin nombre' : e.cliente.nombre}</span>
                      <span className="block truncate text-xs text-gris num">
                        {[e.cliente.celular && formatoCelular(e.cliente.celular), e.placas.join(', '), extra?.(e.cliente)].filter(Boolean).join(' · ') ||
                          'Sin datos de contacto'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

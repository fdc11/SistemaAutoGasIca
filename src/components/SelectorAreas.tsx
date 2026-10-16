import { Check } from 'lucide-react';
import { useDatos } from '../data/store';
import { cx } from '../lib/utils';

/** Áreas del taller donde se atendió al cliente (Conversiones, Mecánica, Gas…). Se puede elegir más de una. */
export function SelectorAreas({ valor, onCambio, invalido }: { valor: string[]; onCambio: (v: string[]) => void; invalido?: boolean }) {
  const { listas } = useDatos();
  const opciones = [...new Set([...listas.areasCliente, ...valor])];
  return (
    <div className={cx('flex flex-wrap gap-1.5 rounded-md', invalido && 'ring-2 ring-rojo/40 ring-offset-2')}>
      {opciones.map((a) => {
        const on = valor.includes(a);
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onCambio(on ? valor.filter((x) => x !== a) : [...valor, a])}
            className={cx(
              'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
              on ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
            )}
          >
            {on && <Check className="h-3.5 w-3.5 text-[#FF8A8F]" />}
            {a}
          </button>
        );
      })}
    </div>
  );
}

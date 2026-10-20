import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Campo, Entrada } from './ui';
import { dniValido, nombrePorDni, normalizarDni } from '../lib/dni';
import { cx } from '../lib/utils';

/**
 * Campo DNI opcional. Al completar los 8 dígitos consulta RENIEC:
 * - si el nombre está vacío, lo llena solo;
 * - si ya hay un nombre escrito, ofrece reemplazarlo (no pisa lo que escribiste).
 */
export function CampoDni({
  valor,
  onCambio,
  nombreActual,
  onNombre,
  className,
  compacto,
  error,
}: {
  valor: string;
  onCambio: (dni: string) => void;
  nombreActual: string;
  onNombre: (nombre: string) => void;
  className?: string;
  compacto?: boolean;
  error?: string;
}) {
  const [estado, setEstado] = useState<'' | 'buscando' | 'ok' | 'error'>('');
  const [mensaje, setMensaje] = useState('');
  const [sugerido, setSugerido] = useState('');
  const consultado = useRef(dniValido(valor) ? valor : ''); // no reconsultar el DNI que ya traía el cliente
  const nombreRef = useRef(nombreActual);
  nombreRef.current = nombreActual;

  useEffect(() => {
    const dni = normalizarDni(valor);
    if (!dniValido(dni)) {
      consultado.current = '';
      setEstado('');
      setSugerido('');
      return;
    }
    if (consultado.current === dni) return;
    consultado.current = dni;
    let vigente = true;
    setEstado('buscando');
    setSugerido('');
    nombrePorDni(dni)
      .then((nombre) => {
        if (!vigente) return;
        setEstado('ok');
        if (!nombreRef.current.trim()) {
          onNombre(nombre);
          setMensaje(`Nombre traído de RENIEC.`);
        } else if (nombreRef.current.trim().toLowerCase() !== nombre.toLowerCase()) {
          setSugerido(nombre);
          setMensaje('');
        } else {
          setMensaje('Coincide con RENIEC.');
        }
      })
      .catch((e: Error) => {
        if (!vigente) return;
        setEstado('error');
        setMensaje(e.message);
      });
    return () => {
      vigente = false;
    };
  }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Campo etiqueta="DNI" className={className} error={error} ayuda={estado || error ? undefined : 'Opcional. Con 8 dígitos se trae el nombre solo.'}>
      <div className="relative">
        <Entrada
          inputMode="numeric"
          maxLength={8}
          value={valor}
          onChange={(e) => onCambio(normalizarDni(e.target.value))}
          className={cx('pr-9 num', compacto && 'h-9')}
          invalido={estado === 'error' || !!error}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {estado === 'buscando' && <Loader2 className="h-4 w-4 animate-spin text-gris" />}
          {estado === 'ok' && <Check className="h-4 w-4 text-ok" />}
        </span>
      </div>
      {estado === 'buscando' && <span className="mt-1 block text-xs text-gris">Buscando en RENIEC…</span>}
      {estado === 'error' && <span className="mt-1 block text-xs text-rojo">{mensaje}</span>}
      {estado === 'ok' && !sugerido && mensaje && <span className="mt-1 block text-xs text-ok">{mensaje}</span>}
      {estado === 'ok' && sugerido && (
        <span className="mt-1 block text-xs text-gris">
          RENIEC: <strong className="text-tinta">{sugerido}</strong>{' '}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onNombre(sugerido);
              setSugerido('');
              setMensaje('Nombre actualizado con RENIEC.');
            }}
            className="font-semibold text-info underline underline-offset-2"
          >
            Usar este nombre
          </button>
        </span>
      )}
    </Campo>
  );
}

// Busca el nombre de una persona por su DNI a través de /api/dni (el token queda en el servidor).
import { auth } from '../data/firebase';
import { titulo } from './utils';

export const normalizarDni = (v?: string) => (v ?? '').replace(/\D/g, '').slice(0, 8);
export const dniValido = (v?: string) => /^\d{8}$/.test(v ?? '');

const cache = new Map<string, string>();

/** Devuelve «Roxana Karina Delgado Huamani» o lanza un Error con un mensaje para mostrar. */
export async function nombrePorDni(dni: string): Promise<string> {
  const n = normalizarDni(dni);
  if (!dniValido(n)) throw new Error('El DNI debe tener 8 dígitos.');
  const guardado = cache.get(n);
  if (guardado) return guardado;
  const idToken = await auth?.currentUser?.getIdToken().catch(() => undefined);
  let r: Response;
  try {
    r = await fetch(`/api/dni?numero=${n}`, { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} });
  } catch {
    throw new Error('Sin conexión para consultar el DNI.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || 'No se pudo consultar el DNI.');
  const nombre = titulo([d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' '));
  if (!nombre) throw new Error('No se encontró ese DNI.');
  cache.set(n, nombre);
  return nombre;
}

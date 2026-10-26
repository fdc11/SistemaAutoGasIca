// Busca el nombre de una persona por su DNI a través de /api/dni (los tokens quedan en el servidor).
// Cada DNI se consulta a la API UNA sola vez: el resultado se guarda en Firestore (colección «dniCache»),
// así las consultas gratis del mes se usan solo en clientes nuevos.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../data/firebase';
import { titulo } from './utils';

export const normalizarDni = (v?: string) => (v ?? '').replace(/\D/g, '').slice(0, 8);
export const dniValido = (v?: string) => /^\d{8}$/.test(v ?? '');

const memoria = new Map<string, string>();
const CLAVE_DEMO = (dni: string) => `autogas:dniCache:${dni}`;

/** Busca el DNI ya consultado antes (Firestore, o el navegador en modo demostración). */
async function leerGuardado(dni: string): Promise<string | undefined> {
  try {
    if (db) {
      const s = await getDoc(doc(db, 'dniCache', dni));
      return s.exists() ? (s.data().nombre as string) || undefined : undefined;
    }
    return localStorage.getItem(CLAVE_DEMO(dni)) || undefined;
  } catch {
    return undefined; // si falla el caché, igual se consulta la API
  }
}

async function guardar(dni: string, nombre: string, fuente?: string) {
  try {
    if (db) await setDoc(doc(db, 'dniCache', dni), { nombre, fuente: fuente ?? '', consultadoEn: new Date().toISOString() });
    else localStorage.setItem(CLAVE_DEMO(dni), nombre);
  } catch {
    /* no guardar en caché no impide registrar al cliente */
  }
}

/** Devuelve «Roxana Karina Delgado Huamani» o lanza un Error con un mensaje para mostrar. */
export async function nombrePorDni(dni: string): Promise<string> {
  const n = normalizarDni(dni);
  if (!dniValido(n)) throw new Error('El DNI debe tener 8 dígitos.');
  const enMemoria = memoria.get(n);
  if (enMemoria) return enMemoria;
  const guardado = await leerGuardado(n);
  if (guardado) {
    memoria.set(n, guardado);
    return guardado;
  }

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
  memoria.set(n, nombre);
  await guardar(n, nombre, d.fuente);
  return nombre;
}

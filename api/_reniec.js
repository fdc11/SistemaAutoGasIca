// Consulta de nombres por DNI (RENIEC), del lado del SERVIDOR, con varios proveedores gratis.
// Si el primero se queda sin consultas del mes (o su token vence, o no responde), pasa solo al siguiente.
// Los tokens NUNCA van en el código ni llegan al navegador: se leen de variables de entorno
// (en .env.local en tu compu y en Vercel > Settings > Environment Variables):
//   DECOLECTA_TOKEN  → https://decolecta.com/profile
//   APISPERU_TOKEN   → https://apisperu.com
// Para agregar otro proveedor: súmalo a PROVEEDORES con su URL y cómo leer su respuesta.
// Este archivo empieza con «_» para que Vercel no lo publique como ruta propia.

const respuesta = (status, body) => ({ status, body });

/** Tokens de cada proveedor, sacados de las variables de entorno. */
export const tokensDni = (env) => ({
  decolecta: env.DECOLECTA_TOKEN,
  apisperu: env.APISPERU_TOKEN,
});

/**
 * Cada proveedor devuelve:
 *  { ok: datos }        → encontrado
 *  { noExiste: true }   → el DNI no existe (no se prueba con los demás, para no gastar sus consultas)
 *  { saltar: 'motivo' } → sin cupo, token malo o error: se prueba con el siguiente
 */
const PROVEEDORES = [
  {
    clave: 'decolecta',
    nombre: 'Decolecta',
    async consultar(numero, token, signal) {
      const r = await fetch(`https://api.decolecta.com/v1/reniec/dni?numero=${numero}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal,
      });
      if (r.status === 429) return { saltar: 'sin consultas este mes' };
      if (r.status === 401 || r.status === 403) return { saltar: 'token no válido o vencido' };
      if (r.status === 404 || r.status === 422) return { noExiste: true };
      if (!r.ok) return { saltar: `respondió ${r.status}` };
      const d = await r.json().catch(() => null);
      if (!d?.first_name && !d?.full_name) return { saltar: 'respuesta vacía' };
      return {
        ok: {
          dni: d.document_number || numero,
          nombres: d.first_name ?? '',
          apellidoPaterno: d.first_last_name ?? '',
          apellidoMaterno: d.second_last_name ?? '',
        },
      };
    },
  },
  {
    clave: 'apisperu',
    nombre: 'APIs Perú',
    async consultar(numero, token, signal) {
      const r = await fetch(`https://dniruc.apisperu.com/api/v1/dni/${numero}?token=${encodeURIComponent(token)}`, { signal });
      if (r.status === 429) return { saltar: 'sin consultas este mes' };
      if (r.status === 401 || r.status === 403) return { saltar: 'token no válido o vencido' };
      const d = await r.json().catch(() => null);
      if (r.ok && d?.nombres) {
        return {
          ok: {
            dni: d.dni || numero,
            nombres: d.nombres ?? '',
            apellidoPaterno: d.apellidoPaterno ?? '',
            apellidoMaterno: d.apellidoMaterno ?? '',
          },
        };
      }
      // APIs Perú avisa «No se encontraron resultados» cuando el DNI no existe.
      const msg = String(d?.message ?? d?.error ?? '').toLowerCase();
      if (r.status === 404 || /no se encontr|no existe|not found/.test(msg)) return { noExiste: true };
      return { saltar: msg || `respondió ${r.status}` };
    },
  },
];

/** Revisa que quien consulta tenga sesión iniciada en el sistema (evita que extraños gasten tus consultas). */
async function sesionValida(idToken, firebaseApiKey) {
  if (!idToken || !firebaseApiKey) return false;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!r.ok) return false;
    const d = await r.json();
    return Array.isArray(d.users) && d.users.length > 0;
  } catch {
    return false;
  }
}

/**
 * @param {{ dni?: string, idToken?: string, tokens: Record<string, string | undefined>, firebaseApiKey?: string, exigirSesion: boolean }} p
 */
export async function consultarDni({ dni, idToken, tokens, firebaseApiKey, exigirSesion }) {
  const numero = String(dni ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(numero)) return respuesta(400, { error: 'El DNI debe tener 8 dígitos.' });

  const activos = PROVEEDORES.filter((p) => tokens?.[p.clave]);
  if (!activos.length) return respuesta(503, { error: 'Falta configurar la consulta de DNI (DECOLECTA_TOKEN o APISPERU_TOKEN).' });
  if (exigirSesion && !(await sesionValida(idToken, firebaseApiKey))) return respuesta(401, { error: 'Inicia sesión para consultar DNI.' });

  const fallos = [];
  for (const p of activos) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await p.consultar(numero, tokens[p.clave], ctrl.signal);
      if (r.ok) return respuesta(200, { ...r.ok, fuente: p.nombre });
      if (r.noExiste) return respuesta(404, { error: 'No se encontró ese DNI.' });
      fallos.push(`${p.nombre}: ${r.saltar}`);
    } catch {
      fallos.push(`${p.nombre}: no respondió`);
    } finally {
      clearTimeout(t);
    }
  }
  console.warn('[dni] ningún proveedor respondió →', fallos.join(' | '));
  return respuesta(503, { error: 'Se acabaron las consultas de DNI de este mes. Escribe el nombre a mano.', detalle: fallos });
}

/** Saca el token de sesión de «Authorization: Bearer …». */
export const tokenDeSesion = (h) => (typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : undefined);

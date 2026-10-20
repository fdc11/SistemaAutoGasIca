// Consulta de nombres por DNI (Decolecta / RENIEC), del lado del SERVIDOR.
// El token NUNCA va en el código ni llega al navegador: se lee de la variable
// de entorno DECOLECTA_TOKEN (en .env.local en tu compu y en Vercel > Settings > Environment Variables).
// Este archivo empieza con «_» para que Vercel no lo publique como ruta propia.

const DECOLECTA = 'https://api.decolecta.com/v1/reniec/dni';

const respuesta = (status, body) => ({ status, body });

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
 * @param {{ dni?: string, idToken?: string, token?: string, firebaseApiKey?: string, exigirSesion: boolean }} p
 */
export async function consultarDni({ dni, idToken, token, firebaseApiKey, exigirSesion }) {
  const numero = String(dni ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(numero)) return respuesta(400, { error: 'El DNI debe tener 8 dígitos.' });
  if (!token) return respuesta(503, { error: 'Falta configurar la consulta de DNI (DECOLECTA_TOKEN).' });
  if (exigirSesion && !(await sesionValida(idToken, firebaseApiKey))) return respuesta(401, { error: 'Inicia sesión para consultar DNI.' });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${DECOLECTA}?numero=${numero}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: ctrl.signal,
    });
    if (r.status === 401 || r.status === 403) return respuesta(502, { error: 'El token de Decolecta no es válido o venció.' });
    if (r.status === 429) return respuesta(429, { error: 'Se acabaron las consultas de DNI por ahora. Intenta más tarde.' });
    if (!r.ok) return respuesta(404, { error: 'No se encontró ese DNI.' });
    const d = await r.json();
    if (!d?.first_name && !d?.full_name) return respuesta(404, { error: 'No se encontró ese DNI.' });
    return respuesta(200, {
      dni: d.document_number || numero,
      nombres: d.first_name ?? '',
      apellidoPaterno: d.first_last_name ?? '',
      apellidoMaterno: d.second_last_name ?? '',
    });
  } catch {
    return respuesta(504, { error: 'RENIEC no respondió. Escribe el nombre a mano o intenta de nuevo.' });
  } finally {
    clearTimeout(t);
  }
}

/** Saca el token de sesión de «Authorization: Bearer …». */
export const tokenDeSesion = (h) => (typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : undefined);

// Ruta /api/dni en Vercel. Uso: GET /api/dni?numero=12345678 con la sesión del sistema.
import { consultarDni, tokenDeSesion } from './_reniec.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }
  const r = await consultarDni({
    dni: req.query?.numero,
    idToken: tokenDeSesion(req.headers.authorization),
    token: process.env.DECOLECTA_TOKEN,
    firebaseApiKey: process.env.VITE_FIREBASE_API_KEY,
    exigirSesion: true,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.status).json(r.body);
}

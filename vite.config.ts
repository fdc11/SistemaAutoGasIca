import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore: módulo JS compartido con la función de Vercel (api/dni.js)
import { consultarDni, tokenDeSesion } from './api/_reniec.js';

/**
 * Cuando el sistema corre en la compu (INICIAR.bat / npm run dev), atiende /api/dni aquí mismo,
 * igual que lo hace Vercel en internet. El token se lee de .env.local y nunca llega al navegador
 * (solo las variables que empiezan con VITE_ se pasan al navegador).
 */
function apiDniLocal(env: Record<string, string>): Plugin {
  return {
    name: 'api-dni-local',
    configureServer(server) {
      server.middlewares.use('/api/dni', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const r = await consultarDni({
          dni: url.searchParams.get('numero') ?? '',
          idToken: tokenDeSesion(req.headers.authorization),
          token: env.DECOLECTA_TOKEN,
          firebaseApiKey: env.VITE_FIREBASE_API_KEY,
          // En modo demostración (sin Firebase) no hay sesión real que verificar.
          exigirSesion: Boolean(env.VITE_FIREBASE_API_KEY),
        });
        res.statusCode = r.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(r.body));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), apiDniLocal(env)],
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            echarts: ['echarts'],
            xlsx: ['xlsx'],
          },
        },
      },
    },
  };
});

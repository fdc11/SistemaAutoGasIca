import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseActivo } from './firebase';
import { titulo } from '../lib/utils';

export interface Usuario {
  email: string;
  nombre: string;
}

interface AuthCtx {
  usuario: Usuario | null;
  cargando: boolean;
  entrar(email: string, clave: string): Promise<void>;
  salir(): Promise<void>;
  recuperar(email: string): Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);

const nombreDe = (email: string, displayName?: string | null) =>
  displayName || titulo(email.split('@')[0].replace(/[._-]+/g, ' '));

const SESION_DEMO = 'autogas-sesion-demo';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (firebaseActivo && auth) {
      return onAuthStateChanged(auth, (u) => {
        setUsuario(u?.email ? { email: u.email, nombre: nombreDe(u.email, u.displayName) } : null);
        setCargando(false);
      });
    }
    try {
      const s = localStorage.getItem(SESION_DEMO);
      if (s) setUsuario(JSON.parse(s));
    } catch {
      /* sin sesión guardada */
    }
    setCargando(false);
  }, []);

  const entrar = async (email: string, clave: string) => {
    if (firebaseActivo && auth) {
      try {
        await signInWithEmailAndPassword(auth, email.trim(), clave);
      } catch (e: any) {
        const code = String(e?.code || '');
        if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
          throw new Error('El correo o la contraseña no coinciden.');
        if (code.includes('too-many-requests'))
          throw new Error('Demasiados intentos. Espera unos minutos o recupera tu contraseña.');
        if (code.includes('network')) throw new Error('No hay conexión a internet.');
        throw new Error('No se pudo iniciar sesión. Revisa tus datos.');
      }
      return;
    }
    if (!email.includes('@') || clave.length < 4)
      throw new Error('Escribe un correo válido y una contraseña de al menos 4 caracteres.');
    const u = { email: email.trim(), nombre: nombreDe(email.trim()) };
    localStorage.setItem(SESION_DEMO, JSON.stringify(u));
    setUsuario(u);
  };

  const salir = async () => {
    if (firebaseActivo && auth) await signOut(auth);
    localStorage.removeItem(SESION_DEMO);
    setUsuario(null);
  };

  const recuperar = async (email: string) => {
    if (firebaseActivo && auth) {
      await sendPasswordResetEmail(auth, email.trim());
      return;
    }
    throw new Error('En modo demostración no se envían correos.');
  };

  return <Ctx.Provider value={{ usuario, cargando, entrar, salir, recuperar }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

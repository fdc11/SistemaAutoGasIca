import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../data/auth';
import { firebaseActivo } from '../data/firebase';
import { Boton, Campo, Entrada } from '../components/ui';
import { Logo } from '../components/Layout';

export default function Login() {
  const { entrar, recuperar } = useAuth();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setAviso('');
    setEnviando(true);
    try {
      await entrar(email, clave);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const olvido = async () => {
    setError('');
    setAviso('');
    if (!email.includes('@')) {
      setError('Escribe tu correo arriba y vuelve a pulsar «Olvidé mi contraseña».');
      return;
    }
    try {
      await recuperar(email);
      setAviso(`Te enviamos un enlace a ${email} para crear una nueva contraseña.`);
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar el correo.');
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-carbon lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Logo />
        <div className="relative z-10 max-w-md">
          <p className="font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight text-white">
            Clientes, agenda y taller en un solo lugar
          </p>
          <p className="mt-5 text-[15px] leading-relaxed text-carbon-texto">
            Registro por canal, seguimiento de cambio de aceite, convenios e inventario de equipos de conversión.
          </p>
        </div>
        <p className="relative z-10 text-xs text-carbon-texto/70">AutoGas · Sede Ica</p>
        <svg className="absolute -bottom-10 -right-24 h-[420px] w-[620px] opacity-[0.09]" viewBox="0 0 620 420" aria-hidden="true">
          <path d="M40 300c80-120 190-170 300-170s200 40 250 110" fill="none" stroke="#fff" strokeWidth="2" />
          <path d="M80 330c70-95 165-135 260-135s170 30 215 85" fill="none" stroke="#D7141F" strokeWidth="6" strokeLinecap="round" />
          <circle cx="190" cy="350" r="44" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="470" cy="350" r="44" fill="none" stroke="#fff" strokeWidth="2" />
        </svg>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 lg:hidden">
            <Logo claro={false} />
          </div>
          <h1 className="font-display text-[34px] font-bold uppercase leading-none tracking-tight text-tinta">Iniciar sesión</h1>
          <div className="mt-2.5 h-[3px] w-10 rounded-full bg-rojo" />
          <p className="mt-4 text-sm text-gris">Entra con la cuenta del taller. Después eliges quién está atendiendo.</p>

          <form onSubmit={enviar} className="mt-8 space-y-5" noValidate>
            <Campo etiqueta="Correo">
              <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@autogas.pe" />
            </Campo>
            <Campo etiqueta="Contraseña">
              <div className="relative">
                <Entrada
                  type={ver ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setVer(!ver)}
                  aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gris hover:text-tinta"
                >
                  {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Campo>

            {error && <p className="rounded-md bg-rojo-suave px-3 py-2.5 text-sm text-rojo-osc">{error}</p>}
            {aviso && <p className="rounded-md bg-ok-suave px-3 py-2.5 text-sm text-ok">{aviso}</p>}

            <Boton type="submit" className="w-full" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </Boton>
            {firebaseActivo && (
              <button type="button" onClick={olvido} className="w-full text-center text-sm font-medium text-gris hover:text-tinta">
                Olvidé mi contraseña
              </button>
            )}
          </form>

          {!firebaseActivo && (
            <p className="mt-8 border-t border-linea pt-5 text-[13px] leading-relaxed text-gris">
              Modo demostración: entra con cualquier correo y una contraseña de 4 caracteres o más. Los datos de ejemplo se guardan solo en este navegador.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

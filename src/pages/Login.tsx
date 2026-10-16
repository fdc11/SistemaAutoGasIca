import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../data/auth';
import { firebaseActivo } from '../data/firebase';
import { Boton, Campo, Entrada } from '../components/ui';
import { Logo } from '../components/Layout';
import fotoTaller from '../assets/fotos/taller-ica.webp';
import fotoTallerMovil from '../assets/fotos/taller-ica-movil.webp';

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
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Foto del taller: banda arriba en celular, panel completo en computadora */}
      <aside className="relative isolate flex h-56 flex-col justify-between overflow-hidden bg-carbon p-6 sm:h-64 lg:h-auto lg:min-h-screen lg:p-12">
        <img
          src={fotoTaller}
          srcSet={`${fotoTallerMovil} 720w, ${fotoTaller} 1400w`}
          sizes="(min-width: 1024px) 55vw, 100vw"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[50%_62%]"
        />
        {/* Oscurece la foto para que el texto se lea siempre */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-carbon via-carbon/70 to-carbon/30" />
        <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-carbon/80 via-carbon/20 to-transparent lg:block" />
        <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-carbon/90 to-transparent" />

        <Logo className="h-10 lg:h-12" />

        <div className="hidden max-w-lg lg:block">
          <div className="mb-5 h-1 w-14 rounded-full bg-rojo" />
          <p className="font-display text-[52px] font-bold uppercase leading-[0.92] tracking-tight text-white">
            Clientes, agenda y taller en un solo lugar
          </p>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
            Registro por canal, seguimiento de cambio de aceite, convenios e inventario de equipos de conversión.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 text-xs text-white/60">
          <span>AutoGas · Sede Ica</span>
          <span className="hidden lg:inline">Conversiones y mantenimiento GNV · GLP</span>
        </div>
      </aside>

      <main className="flex items-start justify-center px-6 py-10 sm:py-14 lg:items-center lg:py-12">
        <div className="w-full max-w-[380px]">
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

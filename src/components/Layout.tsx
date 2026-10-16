import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LayoutGrid, UserPlus, Users, CalendarDays, Wrench, Droplet, Building2, Boxes, Settings, LogOut, Menu, X, PhoneIncoming } from 'lucide-react';
import { useAuth } from '../data/auth';
import { useDatos } from '../data/store';
import { cx } from '../lib/utils';
import logoClaro from '../assets/logo-autogas.webp';
import logoOscuro from '../assets/logo-autogas-oscuro.webp';

export function Logo({ claro = true, className }: { claro?: boolean; className?: string }) {
  return (
    <img
      src={claro ? logoClaro : logoOscuro}
      alt="AutoGas"
      width={393}
      height={92}
      draggable={false}
      className={cx('h-9 w-auto max-w-full shrink-0 select-none self-start object-contain', className)}
    />
  );
}

const NAV: { grupo?: string; items: { a: string; t: string; i: ReactNode; fin?: boolean }[] }[] = [
  { items: [{ a: '/', t: 'Inicio', i: <LayoutGrid />, fin: true }] },
  {
    grupo: 'Clientes',
    items: [
      { a: '/registrar', t: 'Registrar cliente', i: <UserPlus /> },
      { a: '/clientes', t: 'Base de clientes', i: <Users /> },
      { a: '/numeros', t: 'Números nuevos', i: <PhoneIncoming /> },
    ],
  },
  {
    grupo: 'Taller',
    items: [
      { a: '/agenda', t: 'Agenda', i: <CalendarDays /> },
      { a: '/taller', t: 'Control de taller', i: <Wrench /> },
      { a: '/aceite', t: 'Cambio de aceite', i: <Droplet /> },
    ],
  },
  {
    grupo: 'Gestión',
    items: [
      { a: '/convenios', t: 'Convenios', i: <Building2 /> },
      { a: '/inventario', t: 'Inventario', i: <Boxes /> },
    ],
  },
];

function Navegacion({ onIr }: { onIr?: () => void }) {
  const { salir } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Principal">
        {NAV.map((g, gi) => (
          <div key={gi} className={gi ? 'mt-5' : ''}>
            {g.grupo && <p className="mb-1.5 px-3 text-xs font-medium text-carbon-texto/70">{g.grupo}</p>}
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.a}>
                  <NavLink
                    to={it.a}
                    end={it.fin}
                    onClick={onIr}
                    className={({ isActive }) =>
                      cx(
                        'relative flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] font-medium transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0',
                        isActive
                          ? 'bg-carbon-3 text-white before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-rojo [&>svg]:text-rojo'
                          : 'text-carbon-texto hover:bg-carbon-2 hover:text-white',
                      )
                    }
                  >
                    {it.i}
                    {it.t}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-white/10 px-3 py-3">
        <NavLink
          to="/ajustes"
          onClick={onIr}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] font-medium [&>svg]:h-[18px] [&>svg]:w-[18px]',
              isActive ? 'bg-carbon-3 text-white' : 'text-carbon-texto hover:bg-carbon-2 hover:text-white',
            )
          }
        >
          <Settings />
          Ajustes
        </NavLink>
        <button
          type="button"
          onClick={() => void salir()}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14.5px] font-medium text-carbon-texto hover:bg-carbon-2 hover:text-white [&>svg]:h-[18px] [&>svg]:w-[18px]"
        >
          <LogOut />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function Reloj() {
  const [ahora, setAhora] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const txt = format(ahora, "EEEE d 'de' MMMM, HH:mm", { locale: es });
  return <span className="hidden text-sm text-gris md:inline">{txt.charAt(0).toUpperCase() + txt.slice(1)}</span>;
}

export default function Layout() {
  const { usuario } = useAuth();
  const { modo, listo, asesor, setAsesor, listas } = useDatos();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-screen bg-fondo">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] bg-carbon lg:block">
        <Navegacion />
      </aside>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-carbon/60" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-[268px] bg-carbon">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMenu(false)}
              className="absolute right-3 top-6 rounded p-1.5 text-carbon-texto hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <Navegacion onIr={() => setMenu(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-linea bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menú"
              onClick={() => setMenu(true)}
              className="-ml-1 rounded p-1.5 text-tinta hover:bg-fondo lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden">
              <Logo claro={false} />
            </div>
            <Reloj />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="hidden text-gris sm:inline">Atiende</span>
              <select
                value={asesor}
                onChange={(e) => setAsesor(e.target.value)}
                aria-label="Quién está usando el sistema"
                className={cx(
                  'h-9 rounded-md border bg-white pl-3 pr-8 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-tinta/10',
                  asesor ? 'border-linea-fuerte text-tinta' : 'border-rojo text-rojo',
                )}
              >
                <option value="">¿Quién atiende?</option>
                {listas.asesores.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <div
              title={usuario?.email}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-rojo font-display text-base font-bold text-white"
            >
              {(asesor || usuario?.nombre || '?').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {modo === 'demo' && (
          <div className="border-b border-aviso/20 bg-aviso-suave px-4 py-2 text-[13px] text-aviso sm:px-8">
            Modo demostración: los datos se guardan solo en este navegador.<span className="hidden md:inline"> Conecta Firebase en el archivo .env.local para trabajar en la nube.</span>
          </div>
        )}

        <main className="mx-auto max-w-[1360px] px-4 py-7 sm:px-8 sm:py-9">
          {listo && !asesor && listas.asesores.length > 0 && <ElegirAsesor nombres={listas.asesores} onElegir={setAsesor} />}
          {listo ? (
            <Outlet />
          ) : (
            <div className="flex items-center gap-3 py-24 text-sm text-gris">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-linea-fuerte border-t-rojo" />
              Cargando datos del taller
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ElegirAsesor({ nombres, onElegir }: { nombres: string[]; onElegir: (n: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-6" role="dialog" aria-modal="true" aria-label="Quién atiende">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-modal">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">¿Quién está atendiendo?</h2>
        <div className="mt-2 h-[3px] w-10 rounded-full bg-rojo" />
        <p className="mt-3 text-sm text-gris">Tu nombre quedará en las citas y clientes que registres. Puedes cambiarlo arriba, en «Atiende».</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {nombres.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onElegir(n)}
              className="rounded-md border border-linea-fuerte px-3 py-2.5 text-left text-sm font-semibold hover:border-tinta hover:bg-fondo"
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

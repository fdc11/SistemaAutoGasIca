import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Store, Phone, MessageCircle, Megaphone, Building2, UserCheck, AlertCircle } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { AREAS, CANALES, HORAS_SABADO, HORAS_SEMANA, estadoInfo, nombreCanal } from '../lib/catalogos';
import type { Area, Canal, EstadoCliente } from '../lib/types';
import { celularValido, cx, formatoCelular, hoyISO, normalizarCelular, normalizarPlaca, placaValida, plano } from '../lib/utils';
import { AreaTexto, Boton, Campo, Grupo, Encabezado, Entrada, Etiqueta, Panel, Selector, useAvisos } from '../components/ui';
import { parseISO, getDay } from 'date-fns';
import { SelectorAreas } from '../components/SelectorAreas';

const ICONOS: Record<Canal, JSX.Element> = {
  presencial: <Store />,
  llamada: <Phone />,
  whatsapp: <MessageCircle />,
  publicidad: <Megaphone />,
  convenio: <Building2 />,
  referido: <UserCheck />,
};

const RESULTADOS = ['Contestó', 'No contestó', 'Volver a llamar', 'Interesado', 'No interesado'];

const inicial = {
  nombre: '',
  celular: '',
  sinCelular: false,
  ciudad: 'Ica',
  placa: '',
  marca: '',
  modelo: '',
  anio: '',
  interes: '',
  subcanal: '',
  empresaId: '',
  resultado: '',
  probabilidad: '' as '' | 'alta' | 'media' | 'baja',
  proximoContacto: '',
  comentario: '',
  agendar: true,
  areas: [] as string[],
  area: 'gas' as Area,
  fechaCita: hoyISO(),
  horaCita: '',
};

export default function Registrar() {
  const { canal: canalRuta } = useParams();
  const navigate = useNavigate();
  const canal: Canal = (CANALES.some((c) => c.id === canalRuta) ? canalRuta : 'presencial') as Canal;
  const { listas, crear, datos } = useDatos();
  const empresas = useActivos('empresas').filter((e) => e.activa);
  const filtros = useActivos('filtros');
  const { buscarExistente, registrar, autor } = useAcciones();
  const avisar = useAvisos();
  const [f, setF] = useState(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [ultimo, setUltimo] = useState<{ id: string; nombre: string } | null>(null);

  const set = <K extends keyof typeof inicial>(k: K, v: (typeof inicial)[K]) => setF((x) => ({ ...x, [k]: v }));

  const existente = useMemo(() => {
    const cel = normalizarCelular(f.celular);
    const pla = normalizarPlaca(f.placa);
    if (!cel && !placaValida(pla)) return null;
    const r = buscarExistente(cel, placaValida(pla) ? pla : undefined);
    return r.cliente || r.vehiculo ? r : null;
  }, [f.celular, f.placa, datos.clientes, datos.vehiculos]); // eslint-disable-line

  const filtroSugerido = useMemo(() => {
    if (!f.marca || !f.modelo) return null;
    return (
      filtros.find((x) => plano(x.marca) === plano(f.marca) && plano(f.modelo).includes(plano(x.modelo).split(' ')[0])) ?? null
    );
  }, [f.marca, f.modelo, filtros]);

  const horas = getDay(parseISO(f.fechaCita)) === 6 ? HORAS_SABADO : HORAS_SEMANA;
  const ocupacion = (hora: string) =>
    datos.citas.filter((c) => !c.eliminado && c.fecha === f.fechaCita && c.hora === hora && c.area === f.area && c.estado !== 'cancelada').length +
    datos.bloqueos.filter((b) => !b.eliminado && b.fecha === f.fechaCita && b.hora === hora && b.area === f.area).length * 2;

  const validar = () => {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'Escribe el nombre del cliente.';
    if (!f.areas.length) e.areas = 'Elige en qué área se atiende.';
    if (!f.sinCelular && !celularValido(normalizarCelular(f.celular))) e.celular = 'El celular debe tener 9 dígitos y empezar en 9.';
    if (f.placa && !placaValida(normalizarPlaca(f.placa))) e.placa = 'La placa debe tener 6 letras o números.';
    if (canal === 'publicidad' && !f.subcanal) e.subcanal = 'Elige de qué anuncio vino.';
    if (canal === 'convenio' && !f.empresaId) e.empresaId = 'Elige la empresa del convenio.';
    if (canal === 'presencial' && f.agendar) {
      if (!placaValida(normalizarPlaca(f.placa))) e.placa = 'Para agendar la cita se necesita la placa.';
      if (!f.horaCita) e.horaCita = 'Elige una hora disponible.';
      if (!f.interes) e.interes = 'Elige el servicio.';
    }
    if (canal === 'llamada' && !f.resultado) e.resultado = 'Indica cómo terminó la llamada.';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const estadoInicial = (): EstadoCliente => {
    if (canal === 'presencial' && f.agendar) return 'cita';
    if (canal === 'llamada') {
      if (f.resultado === 'Interesado') return 'seguimiento';
      if (f.resultado === 'No contestó' || f.resultado === 'Volver a llamar') return 'nuevo';
    }
    return 'contactado';
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validar()) return;
    setGuardando(true);
    try {
      const r = await registrar({
        nombre: f.nombre,
        celular: f.sinCelular ? '' : f.celular,
        ciudad: f.ciudad,
        canal,
        subcanal: canal === 'publicidad' ? f.subcanal : undefined,
        empresaId: canal === 'convenio' ? f.empresaId : undefined,
        interes: f.interes || undefined,
        probabilidad: f.probabilidad || undefined,
        estado: estadoInicial(),
        proximoContacto: f.proximoContacto || undefined,
        areas: f.areas,
        placa: f.placa,
        marca: f.marca,
        modelo: f.modelo,
        anio: f.anio,
        comentario: [canal === 'llamada' && f.resultado ? `Llamada: ${f.resultado}.` : '', f.comentario].filter(Boolean).join(' '),
        tipoInteraccion: canal === 'llamada' ? 'llamada' : canal === 'whatsapp' ? 'whatsapp' : canal === 'presencial' ? 'presencial' : 'nota',
        resultado: f.resultado || undefined,
      });
      if (canal === 'presencial' && f.agendar) {
        await crear('citas', {
          fecha: f.fechaCita,
          hora: f.horaCita,
          area: f.area,
          placa: normalizarPlaca(f.placa),
          clienteId: r.clienteId,
          nombreCliente: f.nombre.trim() || undefined,
          celularCliente: normalizarCelular(f.celular) || undefined,
          servicio: f.interes,
          estado: 'agendada',
          agendadoPor: autor,
          notas: f.comentario || undefined,
        });
      }
      avisar(r.nuevo ? `${f.nombre.trim()} quedó registrado.` : `Se agregó el contacto a la ficha de ${existente?.cliente?.nombre ?? f.nombre}.`);
      setUltimo({ id: r.clienteId, nombre: f.nombre.trim() });
      setF({ ...inicial, ciudad: f.ciudad, area: f.area, fechaCita: f.fechaCita, areas: f.areas });
      setErrores({});
    } catch (err: any) {
      avisar('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const servicios = listas.servicios;

  return (
    <>
      <Encabezado
        titulo="Registrar cliente"
        descripcion="Elige por dónde llegó el cliente. Todo lo que registres aparece al instante en la base de clientes."
      />

      <div role="tablist" aria-label="Canal" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {CANALES.map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={canal === c.id}
            onClick={() => {
              navigate(`/registrar/${c.id}`);
              setErrores({});
            }}
            className={cx(
              'flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors [&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0',
              canal === c.id
                ? 'border-carbon bg-carbon text-white [&>svg]:text-rojo'
                : 'border-linea bg-white text-tinta hover:border-linea-fuerte [&>svg]:text-gris',
            )}
          >
            {ICONOS[c.id]}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{c.nombre}</span>
              <span className={cx('block truncate text-xs', canal === c.id ? 'text-carbon-texto' : 'text-gris')}>{c.descripcion}</span>
            </span>
          </button>
        ))}
      </div>

      {ultimo && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ok/25 bg-ok-suave px-4 py-3 text-sm text-ok">
          <span>
            Registro guardado: <strong>{ultimo.nombre}</strong>.
          </span>
          <Link to={`/clientes/${ultimo.id}`} className="font-semibold underline underline-offset-2">
            Abrir ficha
          </Link>
        </div>
      )}

      <form onSubmit={enviar} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Panel titulo="Datos del cliente">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre y apellido" requerido error={errores.nombre} className="sm:col-span-2">
                <Entrada value={f.nombre} onChange={(e) => set('nombre', e.target.value)} invalido={!!errores.nombre} autoFocus />
              </Campo>
              <Campo etiqueta="Celular" requerido={!f.sinCelular} error={errores.celular} ayuda="9 dígitos, sin +51">
                <Entrada
                  inputMode="numeric"
                  value={f.celular}
                  disabled={f.sinCelular}
                  onChange={(e) => set('celular', e.target.value)}
                  invalido={!!errores.celular}
                />
              </Campo>
              <Campo etiqueta="Ciudad">
                <Selector value={f.ciudad} onChange={(e) => set('ciudad', e.target.value)}>
                  {listas.ciudades.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Selector>
              </Campo>
              <label className="flex items-center gap-2 text-sm text-gris sm:col-span-2">
                <input
                  type="checkbox"
                  checked={f.sinCelular}
                  onChange={(e) => set('sinCelular', e.target.checked)}
                  className="h-4 w-4 rounded border-linea-fuerte accent-rojo"
                />
                El cliente no quiso dar su número
              </label>
              <Grupo etiqueta="Área del taller" requerido error={errores.areas} className="sm:col-span-2" ayuda={errores.areas ? undefined : 'Puedes marcar más de una.'}>
                <SelectorAreas valor={f.areas} onCambio={(v) => set('areas', v)} invalido={!!errores.areas} />
              </Grupo>
            </div>
          </Panel>

          <Panel titulo="Vehículo">
            <div className="grid gap-4 sm:grid-cols-4">
              <Campo etiqueta="Placa" error={errores.placa} requerido={canal === 'presencial' && f.agendar}>
                <Entrada
                  value={f.placa}
                  onChange={(e) => set('placa', e.target.value.toUpperCase())}
                  invalido={!!errores.placa}
                  maxLength={8}
                />
              </Campo>
              <Campo etiqueta="Marca">
                <Entrada value={f.marca} onChange={(e) => set('marca', e.target.value)} />
              </Campo>
              <Campo etiqueta="Modelo">
                <Entrada value={f.modelo} onChange={(e) => set('modelo', e.target.value)} />
              </Campo>
              <Campo etiqueta="Año">
                <Entrada inputMode="numeric" maxLength={4} value={f.anio} onChange={(e) => set('anio', e.target.value)} />
              </Campo>
            </div>
            {canal === 'convenio' && filtroSugerido && (
              <p className="mt-4 rounded-md bg-fondo px-3 py-2.5 text-sm text-tinta">
                Filtros para {filtroSugerido.marca} {filtroSugerido.modelo}: aire <strong>{filtroSugerido.filtroAire || '—'}</strong>, aceite{' '}
                <strong>{filtroSugerido.filtroAceite || '—'}</strong>
              </p>
            )}
          </Panel>

          <Panel titulo={`Detalle de ${nombreCanal(canal).toLowerCase()}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              {canal === 'publicidad' && (
                <Campo etiqueta="Anuncio de origen" requerido error={errores.subcanal}>
                  <Selector value={f.subcanal} onChange={(e) => set('subcanal', e.target.value)} invalido={!!errores.subcanal}>
                    <option value="">Elegir</option>
                    {listas.subcanales.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Selector>
                </Campo>
              )}
              {canal === 'convenio' && (
                <Campo etiqueta="Empresa" requerido error={errores.empresaId}>
                  <Selector value={f.empresaId} onChange={(e) => set('empresaId', e.target.value)} invalido={!!errores.empresaId}>
                    <option value="">Elegir</option>
                    {empresas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              )}
              {canal === 'llamada' && (
                <Campo etiqueta="Resultado de la llamada" requerido error={errores.resultado}>
                  <Selector value={f.resultado} onChange={(e) => set('resultado', e.target.value)} invalido={!!errores.resultado}>
                    <option value="">Elegir</option>
                    {RESULTADOS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Selector>
                </Campo>
              )}
              <Campo etiqueta={canal === 'presencial' ? 'Servicio' : 'Servicio de interés'} error={errores.interes} requerido={canal === 'presencial' && f.agendar}>
                <Selector value={f.interes} onChange={(e) => set('interes', e.target.value)} invalido={!!errores.interes}>
                  <option value="">Elegir</option>
                  {servicios.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Selector>
              </Campo>
              {canal === 'llamada' && (
                <Campo etiqueta="Probabilidad de venta">
                  <Selector value={f.probabilidad} onChange={(e) => set('probabilidad', e.target.value as any)}>
                    <option value="">Sin definir</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </Selector>
                </Campo>
              )}
              {canal !== 'presencial' && (
                <Campo etiqueta="Próximo contacto" ayuda="Aparecerá en «Para contactar hoy» ese día">
                  <Entrada type="date" value={f.proximoContacto} onChange={(e) => set('proximoContacto', e.target.value)} />
                </Campo>
              )}
              <Campo etiqueta="Comentario" className="sm:col-span-2" ayuda="Qué pidió, qué se le respondió, qué falta.">
                <AreaTexto value={f.comentario} onChange={(e) => set('comentario', e.target.value)} />
              </Campo>
            </div>
          </Panel>

          {canal === 'presencial' && (
            <Panel
              titulo="Cita en el taller"
              acciones={
                <label className="flex items-center gap-2 text-sm text-gris">
                  <input
                    type="checkbox"
                    checked={f.agendar}
                    onChange={(e) => set('agendar', e.target.checked)}
                    className="h-4 w-4 accent-rojo"
                  />
                  Agendar ahora
                </label>
              }
            >
              {f.agendar ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Campo etiqueta="Área">
                      <Selector value={f.area} onChange={(e) => set('area', e.target.value as Area)}>
                        {AREAS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                    <Campo etiqueta="Fecha">
                      <Entrada type="date" value={f.fechaCita} min={hoyISO()} onChange={(e) => setF((x) => ({ ...x, fechaCita: e.target.value, horaCita: '' }))} />
                    </Campo>
                  </div>
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-tinta">
                      Hora<span className="ml-0.5 text-rojo">*</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                      {horas.map((h) => {
                        const usados = ocupacion(h);
                        const lleno = usados >= 2;
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={lleno}
                            onClick={() => set('horaCita', h)}
                            className={cx(
                              'rounded-md border px-2 py-2 text-center text-sm font-semibold num transition-colors',
                              f.horaCita === h
                                ? 'border-rojo bg-rojo text-white'
                                : lleno
                                  ? 'cursor-not-allowed border-linea bg-fondo text-gris-claro line-through'
                                  : 'border-linea-fuerte bg-white text-tinta hover:border-tinta',
                            )}
                          >
                            {h}
                            <span className={cx('block text-[11px] font-medium', f.horaCita === h ? 'text-white/80' : 'text-gris')}>
                              {lleno ? 'Lleno' : `${2 - usados} libre${2 - usados === 1 ? '' : 's'}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {errores.horaCita && <p className="mt-1.5 text-xs text-rojo">{errores.horaCita}</p>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gris">Solo se registra al cliente. Puedes agendarlo luego desde la agenda.</p>
              )}
            </Panel>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          {existente ? (
            <div className="rounded-lg border border-aviso/30 bg-aviso-suave p-4">
              <div className="flex gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-aviso" />
                <div className="text-sm">
                  <p className="font-semibold text-tinta">Este cliente ya está registrado</p>
                  {existente.cliente ? (
                    <>
                      <p className="mt-1 text-tinta">
                        {existente.cliente.nombre} · {formatoCelular(existente.cliente.celular)}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-gris">
                        Llegó por {nombreCanal(existente.cliente.canal).toLowerCase()}
                        <Etiqueta tono={estadoInfo(existente.cliente.estado).tono}>{estadoInfo(existente.cliente.estado).nombre}</Etiqueta>
                      </p>
                      <p className="mt-2 text-gris">Al guardar, este contacto se suma a su ficha. No se crea un duplicado.</p>
                      <Link to={`/clientes/${existente.cliente.id}`} className="mt-2 inline-block font-semibold text-tinta underline underline-offset-2">
                        Ver ficha
                      </Link>
                    </>
                  ) : (
                    <p className="mt-1 text-gris">La placa {existente.vehiculo?.placa} ya existe, sin cliente asignado. Se le asignará este cliente.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-linea bg-white p-4 text-sm text-gris">
              El sistema revisa el celular y la placa mientras escribes. Si el cliente ya existe, te avisa aquí antes de guardar.
            </div>
          )}
          <Boton type="submit" className="w-full" disabled={guardando}>
            {guardando ? 'Guardando…' : canal === 'presencial' && f.agendar ? 'Registrar y agendar' : 'Registrar cliente'}
          </Boton>
        </aside>
      </form>
    </>
  );
}

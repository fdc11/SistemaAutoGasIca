import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, getDay, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Bell, Check, ChevronLeft, ChevronRight, Lock, MessageCircle, Plus, X } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { AREAS, CUPOS_POR_HORA, ESTADOS_CITA, HORAS_SABADO, HORAS_SEMANA, nombreArea } from '../lib/catalogos';
import type { Area, Bloqueo, Cita, Cliente, EstadoCita, Vehiculo } from '../lib/types';
import { ahoraISO, cx, enlaceWhatsApp, formatoCelular, hoyISO, normalizarPlaca, placaValida } from '../lib/utils';
import { clientePorPlaca } from '../lib/analisis';
import { AreaTexto, Boton, BotonIcono, Campo, Encabezado, Entrada, Etiqueta, Modal, Panel, Pestanas, Selector, useAvisos } from '../components/ui';

type Vista = 'semana' | 'dia';
type Hueco = { fecha: string; hora: string; area: Area };

const TONO_CITA: Record<EstadoCita, string> = {
  agendada: 'border-info/30 bg-info-suave',
  asistio: 'border-ok/30 bg-ok-suave',
  no_asistio: 'border-rojo/30 bg-rojo-suave',
  cancelada: 'border-linea bg-fondo opacity-60',
};

const f = (d: Date) => format(d, 'yyyy-MM-dd');

/** Siguiente día con atención (el domingo no se atiende). */
function siguienteDiaHabil(desde = new Date()) {
  let d = addDays(desde, 1);
  if (getDay(d) === 0) d = addDays(d, 1);
  return f(d);
}

/** Nombre corto para mostrar: «Cristian Rangel», nunca «Sin nombre». */
const nombreVisible = (c?: Cliente) => (c?.nombre && !/^sin nombre$/i.test(c.nombre.trim()) ? c.nombre : undefined);

function mensajeRecordatorio(cita: Cita, cliente?: Cliente) {
  const nombre = nombreVisible(cliente)?.split(' ')[0];
  const dia = cita.fecha === siguienteDiaHabil() && differenceInCalendarDays(parseISO(cita.fecha), new Date()) === 1
    ? `mañana ${format(parseISO(cita.fecha), "EEEE d 'de' MMMM", { locale: es })}`
    : `el ${format(parseISO(cita.fecha), "EEEE d 'de' MMMM", { locale: es })}`;
  return (
    `Hola${nombre ? ' ' + nombre : ''}, te saludamos de AutoGas Ica. ` +
    `Te recordamos tu cita de ${cita.servicio.toLowerCase()} ${dia} a las ${cita.hora}` +
    `${cita.placa ? ` para tu vehículo de placa ${cita.placa}` : ''}. ` +
    'Si no puedes venir, respóndenos por aquí y la reprogramamos. ¡Te esperamos!'
  );
}

/** Busca el cliente de una cita: primero por su id, luego por la placa. */
function useClienteDeCita() {
  const { datos } = useDatos();
  const porId = useMemo(() => new Map(datos.clientes.filter((c) => !c.eliminado).map((c) => [c.id, c])), [datos.clientes]);
  const porPlaca = useMemo(() => {
    const m = new Map<string, { cliente?: Cliente; vehiculo: Vehiculo }>();
    for (const v of datos.vehiculos) if (!v.eliminado) m.set(v.placa, { vehiculo: v, cliente: v.clienteId ? porId.get(v.clienteId) : undefined });
    return m;
  }, [datos.vehiculos, porId]);
  return useCallback(
    (c: Cita) => ({
      cliente: (c.clienteId && porId.get(c.clienteId)) || porPlaca.get(c.placa)?.cliente,
      vehiculo: porPlaca.get(c.placa)?.vehiculo,
    }),
    [porId, porPlaca],
  );
}

/** Marca la cita como asistida y registra el ingreso al taller (una sola vez). */
function useIngreso() {
  const { editar, crear, datos } = useDatos();
  return async (cita: Cita, vehiculo?: Vehiculo, tecnico?: string) => {
    await editar('citas', cita.id, { estado: 'asistio' });
    if (datos.ingresos.some((i) => i.citaId === cita.id && !i.eliminado)) return;
    await crear('ingresos', {
      placa: cita.placa,
      marcaModelo: [vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(' ') || undefined,
      servicio: cita.servicio,
      area: cita.area,
      tecnico: tecnico || undefined,
      horaIngreso: ahoraISO(),
      citaId: cita.id,
    });
  };
}

export default function Agenda() {
  const citas = useActivos('citas');
  const bloqueos = useActivos('bloqueos');
  const [ancla, setAncla] = useState(hoyISO());
  const [vista, setVista] = useState<Vista>(() => (window.innerWidth < 900 ? 'dia' : 'semana'));
  const [area, setArea] = useState<Area>('gas');
  const [hueco, setHueco] = useState<Hueco | null>(null);
  const [abierta, setAbierta] = useState<Cita | null>(null);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(null);
  const [recordar, setRecordar] = useState(false);
  const { editar } = useDatos();
  const avisar = useAvisos();
  const deCita = useClienteDeCita();
  const ingreso = useIngreso();
  const manana = siguienteDiaHabil();
  const porRecordar = citas.filter((c) => c.fecha === manana && c.estado === 'agendada');
  const pendientesRecordar = porRecordar.filter((c) => !c.recordadoEn).length;
  const [movil, setMovil] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const f = () => setMovil(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const areasDia = movil ? AREAS.filter((a) => a.id === area) : AREAS;

  const lunes = startOfWeek(parseISO(ancla), { weekStartsOn: 1 });
  const dias = Array.from({ length: 6 }, (_, i) => f(addDays(lunes, i)));

  const indice = useMemo(() => {
    const m = new Map<string, Cita[]>();
    for (const c of citas) {
      if (c.estado === 'cancelada') continue;
      const k = `${c.fecha}|${c.hora}|${c.area}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [citas]);
  const indiceB = useMemo(() => new Map(bloqueos.map((b) => [`${b.fecha}|${b.hora}|${b.area}`, b])), [bloqueos]);

  const mover = (dias: number) => setAncla(f(addDays(parseISO(ancla), dias)));
  const paso = vista === 'semana' ? 7 : 1;

  const titulo =
    vista === 'semana'
      ? `${format(lunes, "d 'de' MMMM", { locale: es })} al ${format(addDays(lunes, 5), "d 'de' MMMM", { locale: es })}`
      : format(parseISO(ancla), "EEEE d 'de' MMMM", { locale: es });

  const delDia = (fecha: string, ar?: Area) => citas.filter((c) => c.fecha === fecha && c.estado !== 'cancelada' && (!ar || c.area === ar)).length;
  const deSemana = (ar: Area) => citas.filter((c) => dias.includes(c.fecha) && c.area === ar && c.estado !== 'cancelada').length;

  const Celda = ({ fecha, hora, ar }: { fecha: string; hora: string; ar: Area }) => {
    const k = `${fecha}|${hora}|${ar}`;
    const lista = indice.get(k) ?? [];
    const bl = indiceB.get(k);
    const pasado = fecha < hoyISO();
    if (bl) {
      return (
        <button
          type="button"
          onClick={() => setBloqueo(bl)}
          className="flex h-full min-h-[92px] w-full flex-col items-start gap-1 rounded-md border border-dashed border-linea-fuerte bg-[repeating-linear-gradient(135deg,#F2F3F5_0,#F2F3F5_6px,#fff_6px,#fff_12px)] p-2 text-left"
        >
          <span className="flex items-center gap-1 text-xs font-semibold text-gris">
            <Lock className="h-3 w-3" /> Bloqueado
          </span>
          <span className="line-clamp-2 text-xs text-gris">{bl.motivo}</span>
        </button>
      );
    }
    return (
      <div className="flex min-h-[92px] flex-col gap-1">
        {lista.map((c) => {
          const { cliente, vehiculo } = deCita(c);
          const nombre = nombreVisible(cliente);
          const pendiente = c.estado === 'agendada';
          const llegoONo = pendiente && fecha <= hoyISO();
          const avisable = pendiente && fecha >= hoyISO() && cliente?.celular;
          return (
            <div key={c.id} className={cx('group/cita relative rounded-md border transition-colors hover:border-tinta/40', TONO_CITA[c.estado])}>
              <button type="button" onClick={() => setAbierta(c)} className="block w-full px-2 pb-1.5 pt-1.5 text-left">
                <span className="block truncate text-[13px] font-semibold leading-tight text-tinta">{nombre ?? <span className="font-display text-[15px] tracking-wide num">{c.placa || 'Sin placa'}</span>}</span>
                <span className="mt-0.5 block truncate text-xs text-tinta/80">
                  {nombre && c.placa && <span className="font-display font-semibold tracking-wide num">{c.placa} · </span>}
                  {c.servicio}
                </span>
              </button>
              {(llegoONo || avisable) && (
                <div className="flex items-center gap-1 border-t border-black/5 px-1.5 py-1">
                  {llegoONo && (
                    <>
                      <AccionCita
                        titulo="Llegó: registrar ingreso"
                        tono="ok"
                        onClick={async () => {
                          await ingreso(c, vehiculo);
                          avisar(`${nombre ?? c.placa} llegó al taller.`);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" /> Llegó
                      </AccionCita>
                      <AccionCita
                        titulo="No vino"
                        tono="rojo"
                        onClick={async () => {
                          await editar('citas', c.id, { estado: 'no_asistio' });
                          avisar(`${nombre ?? c.placa}: marcado como no asistió.`);
                        }}
                      >
                        <X className="h-3.5 w-3.5" /> No vino
                      </AccionCita>
                    </>
                  )}
                  {avisable && !llegoONo && (
                    <a
                      href={enlaceWhatsApp(cliente!.celular, mensajeRecordatorio(c, cliente))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => void editar('citas', c.id, { recordadoEn: ahoraISO() })}
                      title={c.recordadoEn ? 'Recordatorio ya enviado. Volver a enviar' : 'Enviar recordatorio por WhatsApp'}
                      className={cx(
                        'flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold',
                        c.recordadoEn ? 'text-ok hover:bg-white/70' : 'text-tinta hover:bg-white/70',
                      )}
                    >
                      {c.recordadoEn ? <Check className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                      {c.recordadoEn ? 'Recordado' : 'Recordar'}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {lista.length < CUPOS_POR_HORA && !pasado && (
          <button
            type="button"
            onClick={() => setHueco({ fecha, hora, area: ar })}
            className="group flex min-h-[28px] flex-1 items-center justify-center rounded-md border border-dashed border-transparent text-linea-fuerte hover:border-rojo hover:bg-rojo-suave/40 hover:text-rojo focus-visible:border-rojo"
            aria-label={`Agendar ${fecha} ${hora} ${nombreArea(ar)}`}
          >
            <Plus className="h-4 w-4" />
            <span className="ml-1 hidden text-xs font-semibold group-hover:inline">
              {CUPOS_POR_HORA - lista.length} libre{CUPOS_POR_HORA - lista.length === 1 ? '' : 's'}
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <Encabezado
        titulo="Agenda"
        descripcion="Dos cupos por hora en cada área. Toca un cupo libre para agendar o bloquear."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
          <Boton variante="secundario" onClick={() => setRecordar(true)}>
            <Bell className="h-4 w-4" />
            Recordar citas de {format(parseISO(manana), 'EEEE', { locale: es })}
            {pendientesRecordar > 0 && (
              <span className="ml-0.5 rounded-full bg-rojo px-1.5 text-xs font-bold leading-5 text-white num">{pendientesRecordar}</span>
            )}
          </Boton>
          <div className="flex rounded-md border border-linea-fuerte bg-white p-0.5">
            {(['dia', 'semana'] as Vista[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cx('rounded px-3.5 py-1.5 text-sm font-semibold', vista === v ? 'bg-carbon text-white' : 'text-gris hover:text-tinta')}
              >
                {v === 'dia' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>
          </div>
        }
      />

      <Panel sinRelleno>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-4 py-3">
          <div className="flex items-center gap-1">
            <BotonIcono titulo="Anterior" onClick={() => mover(-paso)}>
              <ChevronLeft className="h-4 w-4" />
            </BotonIcono>
            <BotonIcono titulo="Siguiente" onClick={() => mover(paso)}>
              <ChevronRight className="h-4 w-4" />
            </BotonIcono>
            <h2 className="ml-2 text-[15px] font-semibold first-letter:uppercase">{titulo}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Entrada type="date" value={ancla} onChange={(e) => e.target.value && setAncla(e.target.value)} className="h-9 !w-40" aria-label="Ir a fecha" />
            <Boton tam="sm" variante="secundario" onClick={() => setAncla(hoyISO())}>
              Hoy
            </Boton>
          </div>
        </div>

        {vista === 'semana' ? (
          <>
            <Pestanas
              className="px-4"
              valor={area}
              onCambio={setArea}
              opciones={AREAS.map((a) => ({ id: a.id, nombre: a.nombre, cuenta: deSemana(a.id) }))}
            />
            <div className="overflow-x-auto">
              <div className="grid min-w-[960px] grid-cols-[64px_repeat(6,minmax(0,1fr))]">
                <div className="border-b border-linea" />
                {dias.map((d) => (
                  <div key={d} className={cx('border-b border-l border-linea px-2 py-2.5 text-center', d === hoyISO() && 'bg-rojo-suave/50')}>
                    <p className="text-xs font-medium capitalize text-gris">{format(parseISO(d), 'EEEE', { locale: es })}</p>
                    <p className={cx('font-display text-xl font-bold leading-tight num', d === hoyISO() ? 'text-rojo' : 'text-tinta')}>
                      {format(parseISO(d), 'd')}
                    </p>
                    <p className="text-[11px] text-gris">{delDia(d, area)} citas</p>
                  </div>
                ))}
                {HORAS_SEMANA.map((h) => (
                  <FilaHora key={h} hora={h}>
                    {dias.map((d) => (
                      <div key={d} className={cx('border-b border-l border-linea p-1.5', d === hoyISO() && 'bg-rojo-suave/20')}>
                        {getDay(parseISO(d)) === 6 && !HORAS_SABADO.includes(h) ? (
                          <div className="flex h-full min-h-[92px] items-center justify-center text-[11px] text-gris-claro">Cerrado</div>
                        ) : (
                          <Celda fecha={d} hora={h} ar={area} />
                        )}
                      </div>
                    ))}
                  </FilaHora>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            {movil && (
              <Pestanas className="px-4" valor={area} onCambio={setArea} opciones={AREAS.map((a) => ({ id: a.id, nombre: a.nombre, cuenta: delDia(ancla, a.id) }))} />
            )}
            <div className={cx('grid', movil ? 'grid-cols-[56px_minmax(0,1fr)]' : 'min-w-[560px] grid-cols-[64px_repeat(2,minmax(0,1fr))]')}>
              {!movil && <div className="border-b border-linea" />}
              {!movil && AREAS.map((a) => (
                <div key={a.id} className="border-b border-l border-linea px-3 py-2.5">
                  <p className="text-sm font-semibold">{a.nombre}</p>
                  <p className="text-xs text-gris">{delDia(ancla, a.id)} citas</p>
                </div>
              ))}
              {(getDay(parseISO(ancla)) === 6 ? HORAS_SABADO : getDay(parseISO(ancla)) === 0 ? [] : HORAS_SEMANA).map((h) => (
                <FilaHora key={h} hora={h}>
                  {areasDia.map((a) => (
                    <div key={a.id} className="border-b border-l border-linea p-1.5">
                      <Celda fecha={ancla} hora={h} ar={a.id} />
                    </div>
                  ))}
                </FilaHora>
              ))}
            </div>
            {getDay(parseISO(ancla)) === 0 && <p className="px-4 py-10 text-center text-sm text-gris">El taller no atiende los domingos.</p>}
          </div>
        )}

        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-gris">
          {ESTADOS_CITA.map((e) => (
            <span key={e.id} className="flex items-center gap-1.5">
              <span className={cx('h-3 w-3 rounded-sm border', TONO_CITA[e.id])} /> {e.nombre}
            </span>
          ))}
        </div>
      </Panel>

      {hueco && <NuevaCita hueco={hueco} onCerrar={() => setHueco(null)} />}
      {abierta && <DetalleCita cita={abierta} onCerrar={() => setAbierta(null)} />}
      {recordar && <Recordatorios citas={porRecordar} fecha={manana} onCerrar={() => setRecordar(false)} />}
      {bloqueo && <DetalleBloqueo bloqueo={bloqueo} onCerrar={() => setBloqueo(null)} />}
    </>
  );
}

function AccionCita({ titulo, tono, onClick, children }: { titulo: string; tono: 'ok' | 'rojo'; onClick: () => void; children: React.ReactNode }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      title={titulo}
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        try {
          await onClick();
        } finally {
          setOcupado(false);
        }
      }}
      className={cx(
        'flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold hover:bg-white/70 disabled:opacity-50',
        tono === 'ok' ? 'text-ok' : 'text-rojo-osc',
      )}
    >
      {children}
    </button>
  );
}

function Recordatorios({ citas, fecha, onCerrar }: { citas: Cita[]; fecha: string; onCerrar: () => void }) {
  const { editar } = useDatos();
  const deCita = useClienteDeCita();
  const filas = [...citas].sort((a, b) => a.hora.localeCompare(b.hora) || a.area.localeCompare(b.area));
  const enviados = filas.filter((c) => c.recordadoEn).length;
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Recordatorios por WhatsApp"
      descripcion={`Citas del ${format(parseISO(fecha), "EEEE d 'de' MMMM", { locale: es })} · ${enviados} de ${filas.length} enviados`}
      ancho="lg"
      pie={
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-gris">No hay citas agendadas para ese día.</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-gris">
            Pulsa «Enviar» en cada cliente: se abre WhatsApp con el mensaje ya escrito y solo tienes que darle enviar. El sistema marca quién ya fue avisado.
          </p>
          <ul className="divide-y divide-linea rounded-md border border-linea">
            {filas.map((c) => {
              const { cliente } = deCita(c);
              const nombre = nombreVisible(cliente);
              return (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-12 text-sm font-semibold num">{c.hora}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{nombre ?? c.placa}</p>
                    <p className="truncate text-[13px] text-gris">
                      {nombre && <span className="num">{c.placa} · </span>}
                      {c.servicio} · {nombreArea(c.area)}
                    </p>
                  </div>
                  {!cliente?.celular ? (
                    <span className="text-xs text-rojo">Sin celular</span>
                  ) : (
                    <a
                      href={enlaceWhatsApp(cliente.celular, mensajeRecordatorio(c, cliente))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => void editar('citas', c.id, { recordadoEn: ahoraISO() })}
                      className={cx(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold',
                        c.recordadoEn ? 'border-ok/30 bg-ok-suave text-ok' : 'border-linea-fuerte bg-white text-tinta hover:border-tinta',
                      )}
                    >
                      {c.recordadoEn ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                      {c.recordadoEn ? 'Enviado' : 'Enviar'}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

function FilaHora({ hora, children }: { hora: string; children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-linea px-2 py-2 text-right text-xs font-semibold text-gris num">{hora}</div>
      {children}
    </>
  );
}

function NuevaCita({ hueco, onCerrar }: { hueco: Hueco; onCerrar: () => void }) {
  const { crear, editar, listas, datos } = useDatos();
  const { asegurarVehiculo, autor } = useAcciones();
  const avisar = useAvisos();
  const [modo, setModo] = useState<'cita' | 'bloqueo'>('cita');
  const [placa, setPlaca] = useState('');
  const [servicio, setServicio] = useState('');
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [agendadoPor, setAgendadoPor] = useState(autor);
  const [error, setError] = useState('');

  const p = normalizarPlaca(placa);
  const { cliente, vehiculo } = placaValida(p) ? clientePorPlaca(p, datos.vehiculos, datos.clientes) : { cliente: undefined, vehiculo: undefined };

  const guardar = async () => {
    if (modo === 'bloqueo') {
      if (!motivo.trim()) return setError('Escribe el motivo del bloqueo.');
      await crear('bloqueos', { ...hueco, motivo: motivo.trim() });
      avisar('Cupo bloqueado.');
      return onCerrar();
    }
    if (!placaValida(p)) return setError('Escribe una placa válida de 6 caracteres.');
    if (!servicio) return setError('Elige el servicio.');
    const vehiculoId = await asegurarVehiculo(p);
    await crear('citas', {
      ...hueco,
      placa: p,
      clienteId: cliente?.id,
      servicio,
      notas: notas || undefined,
      estado: 'agendada',
      agendadoPor,
    });
    if (cliente && !['atendido', 'perdido'].includes(cliente.estado)) await editar('clientes', cliente.id, { estado: 'cita' });
    avisar(`Cita agendada para ${p} a las ${hueco.hora}.`);
    onCerrar();
    void vehiculoId;
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={modo === 'cita' ? 'Agendar cita' : 'Bloquear cupo'}
      descripcion={`${format(parseISO(hueco.fecha), "EEEE d 'de' MMMM", { locale: es })} · ${hueco.hora} · ${nombreArea(hueco.area)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>{modo === 'cita' ? 'Agendar cita' : 'Bloquear cupo'}</Boton>
        </>
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-md bg-fondo p-1">
        {(['cita', 'bloqueo'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setModo(m);
              setError('');
            }}
            className={cx('rounded px-3 py-1.5 text-sm font-semibold', modo === m ? 'bg-white shadow-panel' : 'text-gris')}
          >
            {m === 'cita' ? 'Cita' : 'Bloqueo'}
          </button>
        ))}
      </div>
      {modo === 'cita' ? (
        <div className="space-y-4">
          <Campo etiqueta="Placa" requerido>
            <Entrada value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC123" />
          </Campo>
          {placaValida(p) && (
            <div className="rounded-md bg-fondo px-3 py-2.5 text-sm">
              {cliente ? (
                <>
                  <span className="font-semibold">{cliente.nombre}</span> · <span className="num">{formatoCelular(cliente.celular)}</span>
                  {vehiculo?.marca && <span className="text-gris"> · {vehiculo.marca} {vehiculo.modelo}</span>}
                </>
              ) : vehiculo ? (
                <span className="text-gris">Placa registrada sin cliente asignado.</span>
              ) : (
                <span className="text-gris">
                  Placa nueva. Para guardar también sus datos de contacto usa{' '}
                  <Link to="/registrar/presencial" className="font-semibold text-tinta underline">
                    Registrar cliente
                  </Link>
                  .
                </span>
              )}
            </div>
          )}
          <Campo etiqueta="Servicio" requerido>
            <Selector value={servicio} onChange={(e) => setServicio(e.target.value)}>
              <option value="">Elegir</option>
              {listas.servicios.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Agendado por">
            <Selector value={agendadoPor} onChange={(e) => setAgendadoPor(e.target.value)}>
              {[...new Set([agendadoPor, ...listas.asesores])].filter(Boolean).map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Notas">
            <AreaTexto value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: el carro tarda en pasar a gas" className="min-h-[64px]" />
          </Campo>
        </div>
      ) : (
        <Campo etiqueta="Motivo" requerido ayuda="Se ocupan los dos cupos de esta hora.">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: técnico en capacitación" />
        </Campo>
      )}
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function DetalleCita({ cita, onCerrar }: { cita: Cita; onCerrar: () => void }) {
  const { editar, eliminar, datos, listas } = useDatos();
  const avisar = useAvisos();
  const { cliente, vehiculo } = useClienteDeCita()(cita);
  const registrarIngreso = useIngreso();
  const [reprog, setReprog] = useState(false);
  const [fecha, setFecha] = useState(cita.fecha);
  const [hora, setHora] = useState(cita.hora);
  const [tecnico, setTecnico] = useState('');
  const yaIngreso = datos.ingresos.some((i) => i.citaId === cita.id && !i.eliminado);
  const e = ESTADOS_CITA.find((x) => x.id === cita.estado)!;

  const estado = async (s: EstadoCita) => {
    await editar('citas', cita.id, { estado: s });
    avisar(`Cita marcada como ${ESTADOS_CITA.find((x) => x.id === s)!.nombre.toLowerCase()}.`);
    onCerrar();
  };
  const ingresar = async () => {
    await registrarIngreso(cita, vehiculo, tecnico);
    avisar(`${cita.placa} ingresó al taller.`);
    onCerrar();
  };
  const reprogramar = async () => {
    const ocupados = datos.citas.filter(
      (c) => !c.eliminado && c.id !== cita.id && c.fecha === fecha && c.hora === hora && c.area === cita.area && c.estado !== 'cancelada',
    ).length;
    if (ocupados >= CUPOS_POR_HORA) {
      avisar('Ese horario ya tiene los dos cupos ocupados.', 'error');
      return;
    }
    await editar('citas', cita.id, { fecha, hora, estado: 'agendada' });
    avisar('Cita reprogramada.');
    onCerrar();
  };
  const horas = getDay(parseISO(fecha)) === 6 ? HORAS_SABADO : HORAS_SEMANA;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={nombreVisible(cliente) ?? `Cita ${cita.placa}`}
      descripcion={`${cita.placa ? cita.placa + ' · ' : ''}${format(parseISO(cita.fecha), "EEEE d 'de' MMMM", { locale: es })} · ${cita.hora} · ${nombreArea(cita.area)}`}
      pie={
        <>
          <Boton
            variante="peligro"
            className="mr-auto"
            onClick={async () => {
              await eliminar('citas', cita.id);
              avisar('Cita eliminada.');
              onCerrar();
            }}
          >
            Eliminar
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-[12.5px] text-gris">Servicio</dt>
          <dd className="text-sm font-medium">{cita.servicio}</dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-gris">Estado</dt>
          <dd>
            <Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-gris">Cliente</dt>
          <dd className="text-sm font-medium">
            {cliente ? (
              <Link to={`/clientes/${cliente.id}`} className="underline underline-offset-2">
                {cliente.nombre}
              </Link>
            ) : (
              '—'
            )}
            {cliente?.celular && <span className="text-gris num"> · {formatoCelular(cliente.celular)}</span>}
            {cliente?.celular && cita.estado === 'agendada' && cita.fecha >= hoyISO() && (
              <a
                href={enlaceWhatsApp(cliente.celular, mensajeRecordatorio(cita, cliente))}
                target="_blank"
                rel="noreferrer"
                onClick={() => void editar('citas', cita.id, { recordadoEn: ahoraISO() })}
                className="mt-1.5 flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ok hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {cita.recordadoEn ? 'Recordatorio enviado · enviar otra vez' : 'Enviar recordatorio por WhatsApp'}
              </a>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-gris">Agendado por</dt>
          <dd className="text-sm font-medium">{cita.agendadoPor}</dd>
        </div>
        {cita.notas && (
          <div className="sm:col-span-2">
            <dt className="text-[12.5px] text-gris">Notas</dt>
            <dd className="text-sm">{cita.notas}</dd>
          </div>
        )}
      </dl>

      {cita.estado === 'agendada' && !reprog && (
        <div className="mt-6 space-y-3 border-t border-linea pt-5">
          <div className="flex flex-wrap items-end gap-2">
            <Campo etiqueta="Técnico a cargo" className="min-w-[180px] flex-1">
              <Selector value={tecnico} onChange={(ev) => setTecnico(ev.target.value)}>
                <option value="">Sin asignar</option>
                {listas.tecnicos.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Selector>
            </Campo>
            <Boton onClick={ingresar} disabled={yaIngreso}>
              Registrar ingreso al taller
            </Boton>
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton tam="sm" variante="secundario" onClick={() => estado('no_asistio')}>
              No asistió
            </Boton>
            <Boton tam="sm" variante="secundario" onClick={() => setReprog(true)}>
              Reprogramar
            </Boton>
            <Boton tam="sm" variante="secundario" onClick={() => estado('cancelada')}>
              Cancelar cita
            </Boton>
          </div>
        </div>
      )}
      {cita.estado !== 'agendada' && !reprog && (
        <div className="mt-6 flex gap-2 border-t border-linea pt-5">
          <Boton tam="sm" variante="secundario" onClick={() => setReprog(true)}>
            Reprogramar
          </Boton>
          <Boton tam="sm" variante="fantasma" onClick={() => estado('agendada')}>
            Volver a agendada
          </Boton>
        </div>
      )}
      {reprog && (
        <div className="mt-6 grid gap-3 border-t border-linea pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo etiqueta="Nueva fecha">
            <Entrada type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
          </Campo>
          <Campo etiqueta="Hora">
            <Selector value={hora} onChange={(ev) => setHora(ev.target.value)}>
              {horas.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </Selector>
          </Campo>
          <Boton onClick={reprogramar}>Guardar</Boton>
        </div>
      )}
    </Modal>
  );
}

function DetalleBloqueo({ bloqueo, onCerrar }: { bloqueo: Bloqueo; onCerrar: () => void }) {
  const { borrarDefinitivo } = useDatos();
  const avisar = useAvisos();
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cupo bloqueado"
      ancho="sm"
      descripcion={`${format(parseISO(bloqueo.fecha), "EEEE d 'de' MMMM", { locale: es })} · ${bloqueo.hora} · ${nombreArea(bloqueo.area)}`}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
          <Boton
            onClick={async () => {
              await borrarDefinitivo('bloqueos', [bloqueo.id]);
              avisar('Cupo liberado.');
              onCerrar();
            }}
          >
            Liberar cupo
          </Boton>
        </>
      }
    >
      <p className="text-sm">{bloqueo.motivo}</p>
      <p className="mt-2 text-xs text-gris">Bloqueado por {bloqueo.creadoPor}</p>
    </Modal>
  );
}

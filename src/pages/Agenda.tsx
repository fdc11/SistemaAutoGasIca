import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, getDay, parseISO, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Bell, Check, ChevronLeft, ChevronRight, Lock, MessageCircle, Pencil, Phone, Plus, Search, UserCheck, X } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { AREAS, CANALES, CUPOS_POR_HORA, ESTADOS_CITA, HORAS_SABADO, HORAS_SEMANA, nombreArea } from '../lib/catalogos';
import type { Area, Bloqueo, Canal, Cita, Cliente, EstadoCita, Nuevo, Vehiculo } from '../lib/types';
import { ahoraISO, celularValido, cx, enlaceWhatsApp, formatoCelular, hoyISO, normalizarCelular, normalizarPlaca, placaValida, plano } from '../lib/utils';
import { AreaTexto, Boton, BotonIcono, Campo, Grupo, Encabezado, Entrada, Etiqueta, Modal, Panel, Pestanas, Selector, useAvisos } from '../components/ui';
import { BotonesExcel } from '../components/BotonesExcel';
import { CampoDni } from '../components/CampoDni';

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

/** Nombres de relleno que dejó la importación de los Excel («Sin nombre», «Cliente Y2B688»). */
const esNombreRelleno = (n?: string) => !n?.trim() || /^sin nombre$/i.test(n.trim()) || /^cliente\s+[a-z0-9]{6}$/i.test(n.trim());

/** Nombre real para mostrar: «Cristian Rangel», nunca «Sin nombre» ni «Cliente ABC123». */
const nombreVisible = (c?: Cliente) => (c && !esNombreRelleno(c.nombre) ? c.nombre : undefined);

const fechaTexto = (iso: string) => format(parseISO(iso), "EEEE d 'de' MMMM", { locale: es });

/** « de cambio de aceite» o nada si el servicio aún no se definió. */
const deServicio = (s?: string) => (s && !/^por definir$/i.test(s.trim()) ? ` de ${s.toLowerCase()}` : '');

function mensajeConfirmacion(cita: Pick<Cita, 'fecha' | 'hora' | 'servicio' | 'placa'>, nombre?: string) {
  const primer = nombre && !esNombreRelleno(nombre) ? ' ' + nombre.trim().split(' ')[0] : '';
  return (
    `Hola${primer}, te saludamos de AutoGas Ica. ` +
    `Tu cita${deServicio(cita.servicio)} quedó agendada para el ${fechaTexto(cita.fecha)} a las ${cita.hora}` +
    `${cita.placa ? ` (vehículo de placa ${cita.placa})` : ''}. ` +
    'Un día antes te escribimos para recordártela. ¡Gracias por confiar en nosotros!'
  );
}

/** Área del cliente según dónde se agendó: conversiones van a «Conversiones», el resto al área de la cita. */
function areaCliente(area: Area, servicio: string, areas: string[]) {
  const buscar = (re: RegExp) => areas.find((a) => re.test(plano(a)));
  if (/conversion/i.test(plano(servicio))) return buscar(/convers/);
  return area === 'gas' ? buscar(/^gas/) : buscar(/mecan/);
}

/** Canales con los que un cliente puede pedir cita (convenio se registra desde Registrar cliente). */
const CANALES_CITA = CANALES.filter((c) => c.id !== 'convenio');

function SelectorCanal({ valor, onCambio }: { valor: Canal; onCambio: (c: Canal) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CANALES_CITA.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onCambio(c.id)}
          className={cx(
            'rounded-full border px-3 py-1 text-[13px] font-semibold',
            valor === c.id ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
          )}
        >
          {c.nombre}
        </button>
      ))}
    </div>
  );
}

function mensajeRecordatorio(cita: Cita, cliente?: Cliente) {
  const nombre = nombreVisible(cliente)?.split(' ')[0];
  const dia = cita.fecha === siguienteDiaHabil() && differenceInCalendarDays(parseISO(cita.fecha), new Date()) === 1
    ? `mañana ${format(parseISO(cita.fecha), "EEEE d 'de' MMMM", { locale: es })}`
    : `el ${format(parseISO(cita.fecha), "EEEE d 'de' MMMM", { locale: es })}`;
  return (
    `Hola${nombre ? ' ' + nombre : ''}, te saludamos de AutoGas Ica. ` +
    `Te recordamos tu cita${deServicio(cita.servicio)} ${dia} a las ${cita.hora}` +
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
    (c: Cita) => {
      const real = (c.clienteId && porId.get(c.clienteId)) || porPlaca.get(c.placa)?.cliente;
      // Si la ficha ya no existe (p. ej., se vació la base), se usa la copia guardada en la cita.
      const copia =
        !real && (c.nombreCliente || c.celularCliente)
          ? ({ id: '', nombre: c.nombreCliente ?? '', celular: c.celularCliente ?? '', estado: 'cita', canal: 'presencial', fechaContacto: c.fecha, creadoEn: '', creadoPor: '' } as Cliente)
          : undefined;
      return { cliente: real || copia, vehiculo: porPlaca.get(c.placa)?.vehiculo };
    },
    [porId, porPlaca],
  );
}

type Coincidencia = { cliente: Cliente; placas: string[] };

/** Busca clientes de la base por nombre, celular o placa (ignora tildes, espacios y guiones). */
function useBuscarClientes() {
  const clientes = useActivos('clientes');
  const vehiculos = useActivos('vehiculos');
  const placasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of vehiculos) if (v.clienteId) m.set(v.clienteId, [...(m.get(v.clienteId) ?? []), v.placa]);
    return m;
  }, [vehiculos]);
  const buscar = useCallback(
    (q: string, max = 6): Coincidencia[] => {
      const t = plano(q);
      const dig = q.replace(/\D/g, '');
      const pla = normalizarPlaca(q);
      if (t.length < 2) return [];
      const out: Coincidencia[] = [];
      for (const c of clientes) {
        const placas = placasDe.get(c.id) ?? [];
        const ok =
          (!esNombreRelleno(c.nombre) && plano(c.nombre).includes(t)) ||
          (dig.length >= 3 && c.celular.includes(dig)) ||
          (pla.length >= 3 && placas.some((p) => p.includes(pla)));
        if (ok) out.push({ cliente: c, placas });
        if (out.length >= max) break;
      }
      return out;
    },
    [clientes, placasDe],
  );
  return { buscar, placasDe };
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
          const sinCelular = pendiente && fecha >= hoyISO() && !cliente?.celular && !llegoONo;
          return (
            <div key={c.id} className={cx('group/cita relative rounded-md border transition-colors hover:border-tinta/40', TONO_CITA[c.estado])}>
              <button type="button" onClick={() => setAbierta(c)} className="block w-full px-2 pb-1.5 pt-1.5 text-left">
                <span className="block truncate text-[13px] font-semibold leading-tight text-tinta">{nombre ?? <span className="font-display text-[15px] tracking-wide num">{c.placa || (cliente?.celular ? formatoCelular(cliente.celular) : 'Sin datos')}</span>}</span>
                <span className="mt-0.5 block truncate text-xs text-tinta/80">
                  {nombre && c.placa && <span className="font-display font-semibold tracking-wide num">{c.placa} · </span>}
                  {c.servicio}
                </span>
              </button>
              {(llegoONo || avisable || sinCelular) && (
                <div className="flex items-center gap-1 border-t border-black/5 px-1.5 py-1">
                  {sinCelular && (
                    <button
                      type="button"
                      onClick={() => setAbierta(c)}
                      title="Sin celular: no se le puede recordar. Toca para agregarlo."
                      className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold text-aviso hover:bg-white/70"
                    >
                      <Phone className="h-3.5 w-3.5" /> Agregar celular
                    </button>
                  )}
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
          <BotonesExcel seccion="Agenda" importar={['agenda']} exportar={['citas']} />
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
          <div className="flex flex-wrap items-center gap-2">
            <BuscarCita
              citas={citas}
              onElegir={(c) => {
                setAncla(c.fecha);
                setArea(c.area);
                setAbierta(c);
              }}
            />
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

/** Buscador rápido: «¿cuándo es la cita de ABC123?» por placa, nombre o celular. */
function BuscarCita({ citas, onElegir }: { citas: Cita[]; onElegir: (c: Cita) => void }) {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const deCita = useClienteDeCita();
  const hoy = hoyISO();
  const resultados = useMemo(() => {
    const t = plano(q);
    if (t.length < 2) return [];
    const dig = q.replace(/\D/g, '');
    const pla = normalizarPlaca(q);
    const lista = citas.filter((c) => {
      const { cliente } = deCita(c);
      return (
        (pla.length >= 3 && c.placa.includes(pla)) ||
        (!!nombreVisible(cliente) && plano(cliente!.nombre).includes(t)) ||
        (dig.length >= 3 && !!cliente?.celular?.includes(dig))
      );
    });
    // Primero las próximas (la más cercana arriba), luego las pasadas (la más reciente arriba).
    const prox = lista.filter((c) => c.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const pas = lista.filter((c) => c.fecha < hoy).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
    return [...prox, ...pas].slice(0, 8);
  }, [q, citas, deCita, hoy]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris-claro" />
      <Entrada
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => e.key === 'Escape' && setQ('')}
        placeholder="Buscar cita: placa, nombre o celular"
        className="h-9 !w-64 pl-9"
        aria-label="Buscar cita"
      />
      {abierto && plano(q).length >= 2 && (
        <div className="absolute right-0 z-30 mt-1 w-80 overflow-hidden rounded-md border border-linea bg-white shadow-modal">
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gris">No hay citas que coincidan.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-linea overflow-y-auto">
              {resultados.map((c) => {
                const { cliente } = deCita(c);
                const nombre = nombreVisible(cliente);
                const e = ESTADOS_CITA.find((x) => x.id === c.estado)!;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onElegir(c);
                        setQ('');
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-fondo"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {nombre ?? c.placa}
                          {nombre && c.placa && <span className="ml-1 font-display tracking-wide text-gris num">{c.placa}</span>}
                        </p>
                        <p className="truncate text-xs text-gris first-letter:uppercase">
                          {fechaTexto(c.fecha)} · {c.hora} · {c.servicio}
                        </p>
                      </div>
                      <Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
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

type Agendada = { cita: Cita; nombre: string; celular: string };

function NuevaCita({ hueco, onCerrar }: { hueco: Hueco; onCerrar: () => void }) {
  const { crear, editar, listas, datos } = useDatos();
  const { buscarExistente, registrar, autor } = useAcciones();
  const { buscar, placasDe } = useBuscarClientes();
  const avisar = useAvisos();
  const [modo, setModo] = useState<'cita' | 'bloqueo'>('cita');
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [celular, setCelular] = useState('');
  const [placa, setPlaca] = useState('');
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [servicioElegido, setServicio] = useState('');
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [agendadoPor, setAgendadoPor] = useState(autor);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<Agendada | null>(null);

  const cel = normalizarCelular(celular);
  const celEscrito = celular.replace(/\D/g, '');
  const p = normalizarPlaca(placa);
  const coincidencias = elegido ? [] : buscar(busqueda);
  const placasCliente = elegido ? placasDe.get(elegido.id) ?? [] : [];

  // Si escriben a mano un celular o placa que ya existe, se ofrece usar ese cliente (evita duplicados).
  const yaExiste = useMemo(() => {
    if (elegido) return undefined;
    const { cliente } = buscarExistente(celularValido(cel) ? cel : undefined, placaValida(p) ? p : undefined, dni.length === 8 ? dni : undefined);
    return cliente;
  }, [elegido, cel, p, dni]); // eslint-disable-line react-hooks/exhaustive-deps

  // Otra cita pendiente del mismo vehículo o cliente (para no agendarlo dos veces).
  const otraCita = useMemo(() => {
    const idCliente = elegido?.id ?? yaExiste?.id;
    return datos.citas
      .filter((c) => !c.eliminado && c.estado === 'agendada' && c.fecha >= hoyISO())
      .filter((c) => (placaValida(p) && c.placa === p) || (!!idCliente && c.clienteId === idCliente))
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))[0];
  }, [datos.citas, elegido, yaExiste, p]);

  const elegir = (c: Cliente) => {
    const placas = placasDe.get(c.id) ?? [];
    setElegido(c);
    setNombre(esNombreRelleno(c.nombre) ? '' : c.nombre);
    setDni(c.dni ?? '');
    setCelular(c.celular ?? '');
    setPlaca(placas.length === 1 ? placas[0] : '');
    setBusqueda('');
    setError('');
  };
  const soltar = () => {
    setElegido(null);
    setNombre('');
    setDni('');
    setCelular('');
    setPlaca('');
  };

  const guardar = async () => {
    setError('');
    if (modo === 'bloqueo') {
      if (!motivo.trim()) return setError('Escribe el motivo del bloqueo.');
      await crear('bloqueos', { ...hueco, motivo: motivo.trim() });
      avisar('Cupo bloqueado.');
      return onCerrar();
    }
    // Ningún campo es obligatorio; solo se revisa el formato de lo que sí se escribió.
    if (celEscrito && !celularValido(cel)) return setError('El celular debe tener 9 dígitos y empezar en 9.');
    if (placa && !placaValida(p)) return setError('La placa debe tener 6 caracteres (letras y números).');
    if (dni && dni.length !== 8) return setError('El DNI debe tener 8 dígitos.');
    if (!elegido && !nombre.trim() && !cel && !p && !dni) return setError('Escribe al menos el nombre, el celular o la placa para saber de quién es la cita.');
    const servicio = servicioElegido || 'Por definir';

    setGuardando(true);
    try {
      const detalle = `Cita agendada: ${servicio}, ${fechaTexto(hueco.fecha)} a las ${hueco.hora} (${nombreArea(hueco.area)}).`;
      let clienteId: string;
      let nombreFinal = nombre.trim();

      if (elegido) {
        clienteId = elegido.id;
        const patch: Partial<Cliente> = { estado: 'cita', fechaCita: hueco.fecha, ultimoContacto: hoyISO() };
        const ar = areaCliente(hueco.area, servicio, listas.areasCliente);
        if (ar && !(elegido.areas ?? []).includes(ar)) patch.areas = [...(elegido.areas ?? []), ar];
        if (nombreFinal && nombreFinal !== elegido.nombre) patch.nombre = nombreFinal;
        if (cel && cel !== elegido.celular) patch.celular = cel;
        if (dni && dni !== elegido.dni) patch.dni = dni;
        await editar('clientes', clienteId, patch);
        if (!nombreFinal) nombreFinal = elegido.nombre;
        if (p) {
          const v = datos.vehiculos.find((x) => x.placa === p && !x.eliminado);
          if (!v) await crear('vehiculos', { placa: p, clienteId });
          else if (!v.clienteId) await editar('vehiculos', v.id, { clienteId });
        }
        await crear('interacciones', {
          clienteId,
          fecha: ahoraISO(),
          tipo: canal === 'llamada' || canal === 'whatsapp' || canal === 'presencial' ? canal : 'nota',
          comentario: detalle,
        });
      } else {
        // Cliente nuevo: queda guardado en la base de clientes con su vehículo y su historial.
        const r = await registrar({
          nombre: nombreFinal,
          dni: dni || undefined,
          celular: cel,
          canal,
          placa: p || undefined,
          interes: servicioElegido || undefined,
          estado: 'cita',
          tipoInteraccion: canal === 'llamada' || canal === 'whatsapp' || canal === 'presencial' ? canal : 'nota',
          comentario: detalle,
          areas: [areaCliente(hueco.area, servicio, listas.areasCliente)].filter(Boolean) as string[],
        });
        clienteId = r.clienteId;
        const existente = datos.clientes.find((c) => c.id === clienteId);
        const patch: Partial<Cliente> = { fechaCita: hueco.fecha, ultimoContacto: hoyISO() };
        // Si ya existía con un nombre de relleno, se corrige con el nombre que dieron ahora.
        if (existente && esNombreRelleno(existente.nombre) && nombreFinal) patch.nombre = nombreFinal;
        await editar('clientes', clienteId, patch);
      }

      const nueva: Nuevo<Cita> = {
        ...hueco,
        placa: p,
        clienteId,
        nombreCliente: nombreFinal && !esNombreRelleno(nombreFinal) ? nombreFinal : undefined,
        celularCliente: cel || elegido?.celular || undefined,
        servicio,
        notas: notas.trim() || undefined,
        estado: 'agendada',
        agendadoPor,
      };
      const id = await crear('citas', nueva);
      avisar(`Cita agendada para ${nombreFinal || p || (cel ? formatoCelular(cel) : '') || 'cliente sin nombre'} a las ${hueco.hora}.`);
      setHecho({ cita: { ...(nueva as Cita), id }, nombre: nombreFinal, celular: cel || elegido?.celular || '' });
    } catch (e) {
      setError('No se pudo guardar. Revisa la conexión e inténtalo otra vez.');
      console.error(e);
    } finally {
      setGuardando(false);
    }
  };

  const desc = `${fechaTexto(hueco.fecha)} · ${hueco.hora} · ${nombreArea(hueco.area)}`;

  // Paso final: cita guardada, ofrecer confirmación por WhatsApp.
  if (hecho) {
    return (
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="Cita agendada"
        descripcion={desc}
        ancho="sm"
        pie={<Boton onClick={onCerrar}>Listo</Boton>}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok">
            <Check className="h-4 w-4" />
          </span>
          <div className="text-sm">
            <p className="font-semibold">{hecho.nombre || hecho.cita.placa}</p>
            <p className="text-gris">
              {hecho.cita.servicio}
              {hecho.cita.placa && <span className="num"> · {hecho.cita.placa}</span>}
              {hecho.celular && <span className="num"> · {formatoCelular(hecho.celular)}</span>}
            </p>
            <p className="mt-1 text-xs text-gris">Sus datos ya quedaron en la base de clientes.</p>
          </div>
        </div>
        {hecho.celular ? (
          <a
            href={enlaceWhatsApp(hecho.celular, mensajeConfirmacion(hecho.cita, hecho.nombre))}
            target="_blank"
            rel="noreferrer"
            onClick={() => void editar('citas', hecho.cita.id, { confirmadoEn: ahoraISO() })}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1E7B4F] text-sm font-semibold text-white hover:bg-[#186641]"
          >
            <MessageCircle className="h-4 w-4" /> Enviar confirmación por WhatsApp
          </a>
        ) : (
          <p className="mt-5 rounded-md bg-aviso-suave px-3 py-2 text-[13px] text-aviso">
            No tiene celular: no se le podrá enviar confirmación ni recordatorio.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={modo === 'cita' ? 'Agendar cita' : 'Bloquear cupo'}
      descripcion={desc}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : modo === 'cita' ? 'Agendar cita' : 'Bloquear cupo'}
          </Boton>
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
          {/* 1. Cliente: buscar uno existente o escribir uno nuevo */}
          {elegido ? (
            <div className="flex items-center gap-3 rounded-md border border-ok/30 bg-ok-suave px-3 py-2.5">
              <UserCheck className="h-4 w-4 shrink-0 text-ok" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold">{nombreVisible(elegido) ?? 'Cliente sin nombre'}</p>
                <p className="truncate text-xs text-gris">
                  Cliente registrado
                  {elegido.celular && <span className="num"> · {formatoCelular(elegido.celular)}</span>}
                  {placasCliente.length > 0 && <span className="num"> · {placasCliente.join(', ')}</span>}
                </p>
              </div>
              <button type="button" onClick={soltar} className="text-xs font-semibold text-gris hover:text-tinta">
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Campo etiqueta="Buscar cliente existente" ayuda="Si es cliente nuevo, deja esto vacío y llena sus datos abajo.">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gris-claro" />
                  <Entrada value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, celular o placa" className="pl-9" />
                </div>
              </Campo>
              {busqueda.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-[68px] z-10 overflow-hidden rounded-md border border-linea bg-white shadow-modal">
                  {coincidencias.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-gris">No está en la base. Llena sus datos abajo y se registrará solo.</p>
                  ) : (
                    <ul className="max-h-60 divide-y divide-linea overflow-y-auto">
                      {coincidencias.map(({ cliente: c, placas }) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => elegir(c)} className="block w-full px-3 py-2 text-left hover:bg-fondo">
                            <p className="truncate text-sm font-semibold">{nombreVisible(c) ?? 'Sin nombre'}</p>
                            <p className="truncate text-xs text-gris num">
                              {[c.celular && formatoCelular(c.celular), placas.join(', ')].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoDni valor={dni} onCambio={setDni} nombreActual={nombre} onNombre={setNombre} key={elegido?.id ?? 'nuevo'} />
            <Campo etiqueta="Nombre del cliente">
              <Entrada
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Celular" ayuda={!celEscrito ? 'Sin celular no se le puede recordar la cita.' : undefined}>
              <Entrada
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                inputMode="tel"
                invalido={!!celEscrito && !celularValido(cel)}
              />
            </Campo>
            <Campo etiqueta="Placa">
              <Entrada
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                invalido={!!placa && !placaValida(p)}
              />
              {placasCliente.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {placasCliente.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => setPlaca(x)}
                      className={cx(
                        'rounded border px-2 py-0.5 font-display text-xs font-semibold tracking-wide num',
                        p === x ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte text-gris hover:text-tinta',
                      )}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              )}
            </Campo>
          </div>

          {yaExiste && (
            <div className="flex items-center gap-3 rounded-md bg-info-suave px-3 py-2.5 text-sm">
              <UserCheck className="h-4 w-4 shrink-0 text-info" />
              <p className="min-w-0 flex-1">
                Ya está en la base: <span className="font-semibold">{nombreVisible(yaExiste) ?? 'cliente sin nombre'}</span>
                {yaExiste.celular && <span className="num text-gris"> · {formatoCelular(yaExiste.celular)}</span>}
              </p>
              <button type="button" onClick={() => elegir(yaExiste)} className="text-[13px] font-semibold text-info hover:underline">
                Usar este
              </button>
            </div>
          )}

          {otraCita && (
            <div className="flex items-start gap-2 rounded-md bg-aviso-suave px-3 py-2.5 text-[13px] text-aviso">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Ya tiene otra cita pendiente: <span className="font-semibold first-letter:uppercase">{fechaTexto(otraCita.fecha)}</span> a las{' '}
                {otraCita.hora} ({otraCita.servicio}). Si es la misma, mejor reprográmala en vez de crear otra.
              </p>
            </div>
          )}

          {!elegido && (
            <Grupo etiqueta="¿Por dónde pidió la cita?">
              <SelectorCanal valor={canal} onCambio={setCanal} />
            </Grupo>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Servicio">
              <Selector value={servicioElegido} onChange={(e) => setServicio(e.target.value)}>
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
          </div>
          <Campo etiqueta="Notas">
            <AreaTexto value={notas} onChange={(e) => setNotas(e.target.value)} className="min-h-[64px]" />
          </Campo>
        </div>
      ) : (
        <Campo etiqueta="Motivo" requerido ayuda="Se ocupan los dos cupos de esta hora.">
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
      )}
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

/** Completa los datos de contacto de una cita que se agendó solo con la placa (o sin celular). */
function CompletarCliente({ cita, cliente: recibido }: { cita: Cita; cliente?: Cliente }) {
  // Una copia guardada en la cita (sin id) no es una ficha real: se crea el cliente de nuevo.
  const cliente = recibido?.id ? recibido : undefined;
  const { editar } = useDatos();
  const { registrar, buscarExistente } = useAcciones();
  const avisar = useAvisos();
  const [nombre, setNombre] = useState(nombreVisible(recibido) ?? '');
  const [celular, setCelular] = useState('');
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cel = normalizarCelular(celular);

  const guardar = async () => {
    setError('');
    if (!celularValido(cel)) return setError('El celular debe tener 9 dígitos y empezar en 9.');
    if (!cliente && !nombre.trim()) return setError('Escribe el nombre.');
    setGuardando(true);
    try {
      if (cliente) {
        const patch: Partial<Cliente> = { celular: cel };
        if (nombre.trim() && esNombreRelleno(cliente.nombre)) patch.nombre = nombre.trim();
        await editar('clientes', cliente.id, patch);
      } else {
        const previo = buscarExistente(cel, cita.placa || undefined).cliente;
        const r = await registrar({
          nombre: nombre.trim(),
          celular: cel,
          canal,
          placa: cita.placa || undefined,
          interes: cita.servicio,
          estado: 'cita',
          comentario: `Datos completados desde la cita del ${fechaTexto(cita.fecha)}.`,
        });
        if (previo && esNombreRelleno(previo.nombre)) await editar('clientes', r.clienteId, { nombre: nombre.trim() });
        await editar('citas', cita.id, { clienteId: r.clienteId });
      }
      await editar('citas', cita.id, { celularCliente: cel, ...(nombre.trim() ? { nombreCliente: nombre.trim() } : {}) });
      avisar('Datos del cliente guardados.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-5 rounded-md border border-aviso/30 bg-aviso-suave/60 p-3">
      <p className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-aviso">
        <Phone className="h-3.5 w-3.5" /> {cliente ? 'Falta el celular para poder recordarle' : 'Esta cita no tiene cliente: completa sus datos'}
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {(!cliente || esNombreRelleno(cliente.nombre)) && (
          <Campo etiqueta="Nombre">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9 bg-white" />
          </Campo>
        )}
        <Campo etiqueta="Celular">
          <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" className="h-9 bg-white" />
        </Campo>
        <Boton tam="sm" onClick={guardar} disabled={guardando}>
          Guardar
        </Boton>
      </div>
      {!cliente && (
        <div className="mt-2.5">
          <SelectorCanal valor={canal} onCambio={setCanal} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-rojo-osc">{error}</p>}
    </div>
  );
}

/** Edita todos los datos de una cita ya guardada (y los del cliente vinculado). */
function EditarCita({ cita, cliente, onListo, onCancelar }: { cita: Cita; cliente?: Cliente; onListo: () => void; onCancelar: () => void }) {
  const { crear, editar, datos, listas } = useDatos();
  const { registrar } = useAcciones();
  const avisar = useAvisos();
  const real = cliente?.id ? cliente : undefined; // ficha real (no la copia guardada en la cita)
  const [nombre, setNombre] = useState(nombreVisible(cliente) ?? '');
  const [dni, setDni] = useState(real?.dni ?? '');
  const [celular, setCelular] = useState(cliente?.celular ?? '');
  const [placa, setPlaca] = useState(cita.placa ?? '');
  const [servicio, setServicio] = useState(/^por definir$/i.test(cita.servicio ?? '') ? '' : cita.servicio ?? '');
  const [area, setArea] = useState<Area>(cita.area);
  const [fecha, setFecha] = useState(cita.fecha);
  const [hora, setHora] = useState(cita.hora);
  const [agendadoPor, setAgendadoPor] = useState(cita.agendadoPor ?? '');
  const [notas, setNotas] = useState(cita.notas ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cel = normalizarCelular(celular);
  const celEscrito = celular.replace(/\D/g, '');
  const p = normalizarPlaca(placa);
  const dia = getDay(parseISO(fecha));
  const horas = dia === 6 ? HORAS_SABADO : dia === 0 ? [] : HORAS_SEMANA;
  const opcionesHora = horas.includes(hora) || !hora ? horas : [hora, ...horas];
  const servicios = servicio && !listas.servicios.includes(servicio) ? [servicio, ...listas.servicios] : listas.servicios;

  const guardar = async () => {
    setError('');
    if (celEscrito && !celularValido(cel)) return setError('El celular debe tener 9 dígitos y empezar en 9.');
    if (placa && !placaValida(p)) return setError('La placa debe tener 6 caracteres (letras y números).');
    if (dni && dni.length !== 8) return setError('El DNI debe tener 8 dígitos.');
    if (!fecha || !hora) return setError('Elige la fecha y la hora.');
    if (dia === 0) return setError('El taller no atiende los domingos.');
    const cambioHueco = fecha !== cita.fecha || hora !== cita.hora || area !== cita.area;
    if (cambioHueco) {
      const ocupados = datos.citas.filter(
        (c) => !c.eliminado && c.id !== cita.id && c.fecha === fecha && c.hora === hora && c.area === area && c.estado !== 'cancelada',
      ).length;
      const bloqueado = datos.bloqueos.some((b) => !b.eliminado && b.fecha === fecha && b.hora === hora && b.area === area);
      if (bloqueado) return setError('Ese horario está bloqueado.');
      if (ocupados >= CUPOS_POR_HORA) return setError('Ese horario ya tiene los dos cupos ocupados.');
    }

    setGuardando(true);
    try {
      const servicioFinal = servicio || 'Por definir';
      let clienteId = real?.id;
      if (real) {
        const patch: Partial<Cliente> = {};
        if (nombre.trim() !== (nombreVisible(real) ?? '')) patch.nombre = nombre.trim();
        if (cel !== (real.celular ?? '')) patch.celular = cel;
        if (dni !== (real.dni ?? '')) patch.dni = dni;
        if (Object.keys(patch).length) await editar('clientes', real.id, patch);
      } else if (nombre.trim() || cel || dni || p) {
        // La cita no tenía ficha: se crea (o se vincula a la que ya exista con ese DNI, celular o placa).
        const r = await registrar({
          nombre: nombre.trim(),
          dni: dni || undefined,
          celular: cel,
          canal: 'presencial',
          placa: p || undefined,
          interes: servicio || undefined,
          estado: 'cita',
          comentario: `Datos completados desde la cita del ${fechaTexto(fecha)}.`,
        });
        clienteId = r.clienteId;
      }
      if (p && p !== cita.placa) {
        const v = datos.vehiculos.find((x) => x.placa === p && !x.eliminado);
        if (!v) await crear('vehiculos', { placa: p, clienteId });
        else if (!v.clienteId && clienteId) await editar('vehiculos', v.id, { clienteId });
      }
      await editar('citas', cita.id, {
        fecha,
        hora,
        area,
        placa: p,
        servicio: servicioFinal,
        agendadoPor: agendadoPor || cita.agendadoPor,
        notas: notas.trim(),
        clienteId,
        nombreCliente: nombre.trim(),
        celularCliente: cel,
      });
      avisar('Cita actualizada.');
      onListo();
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar. Revisa la conexión e inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      onCerrar={onCancelar}
      titulo="Editar cita"
      descripcion="Cambia lo que necesites. Ningún campo es obligatorio."
      pie={
        <>
          <Boton variante="secundario" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoDni valor={dni} onCambio={setDni} nombreActual={nombre} onNombre={setNombre} />
          <Campo etiqueta="Nombre del cliente">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Celular">
            <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} inputMode="tel" invalido={!!celEscrito && !celularValido(cel)} />
          </Campo>
          <Campo etiqueta="Placa">
            <Entrada value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} invalido={!!placa && !placaValida(p)} />
          </Campo>
          <Campo etiqueta="Servicio">
            <Selector value={servicio} onChange={(e) => setServicio(e.target.value)}>
              <option value="">Por definir</option>
              {servicios.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Área">
            <Selector value={area} onChange={(e) => setArea(e.target.value as Area)}>
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hora">
            <Selector value={hora} onChange={(e) => setHora(e.target.value)}>
              {opcionesHora.map((h) => (
                <option key={h}>{h}</option>
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
        </div>
        <Campo etiqueta="Notas">
          <AreaTexto value={notas} onChange={(e) => setNotas(e.target.value)} className="min-h-[64px]" />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function DetalleCita({ cita: inicial, onCerrar }: { cita: Cita; onCerrar: () => void }) {
  const { editar, eliminar, datos, listas } = useDatos();
  // Siempre la versión más reciente (por si se completan datos con la ventana abierta).
  const cita = datos.citas.find((c) => c.id === inicial.id) ?? inicial;
  const avisar = useAvisos();
  const { cliente, vehiculo } = useClienteDeCita()(cita);
  const registrarIngreso = useIngreso();
  const [reprog, setReprog] = useState(false);
  const [fecha, setFecha] = useState(cita.fecha);
  const [hora, setHora] = useState(cita.hora);
  const [tecnico, setTecnico] = useState('');
  const [editando, setEditando] = useState(false);
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

  if (editando) return <EditarCita cita={cita} cliente={cliente} onListo={() => setEditando(false)} onCancelar={() => setEditando(false)} />;

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={nombreVisible(cliente) ?? `Cita ${cita.placa || "sin nombre"}`}
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
          <Boton variante="secundario" onClick={() => setEditando(true)}>
            <Pencil className="h-4 w-4" /> Editar
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
            {cliente?.id ? (
              <Link to={`/clientes/${cliente.id}`} className="underline underline-offset-2">
                {nombreVisible(cliente) ?? 'Sin nombre'}
              </Link>
            ) : cliente ? (
              <span>{nombreVisible(cliente) ?? 'Sin nombre'}</span>
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

      {cita.estado === 'agendada' && !cliente?.celular && <CompletarCliente key={cliente?.id ?? 'nuevo'} cita={cita} cliente={cliente} />}

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

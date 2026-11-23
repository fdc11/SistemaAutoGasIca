import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subMonths, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowUpRight, CalendarDays, Droplet, MessageCircle, RotateCcw, Users } from 'lucide-react';
import { useActivos, useDatos } from '../data/store';
import { useAuth } from '../data/auth';
import { CANALES, MESES, estadoInfo, nombreArea } from '../lib/catalogos';
import { SEGMENTOS, clientePorPlaca, fichasAceite, segmentar, tasaRetorno, type FichaAceite, type Segmento } from '../lib/analisis';
import { cx, enlaceWhatsApp, fechaCorta, formatoCelular, hoyISO, soles } from '../lib/utils';
import { Boton, Encabezado, Etiqueta, Modal, Panel, Pestanas, Tabla, Td, Th } from '../components/ui';
import { Grafico } from '../components/Grafico';
import type { Cliente } from '../lib/types';

const mesISO = (d: Date) => format(d, 'yyyy-MM');
/** Pasados estos días sin contacto, un seguimiento sale de «hoy» y pasa a «Por recuperar». */
const DIAS_RECUPERAR = 90;

export default function Inicio() {
  const { usuario } = useAuth();
  const { datos, asesor } = useDatos();
  const clientes = useActivos('clientes');
  const citas = useActivos('citas');
  const servicios = useActivos('serviciosAceite');
  const interacciones = useActivos('interacciones');
  const productos = useActivos('productos');
  const movimientos = useActivos('movimientos');
  const hoy = hoyISO();
  const ahora = new Date();
  const mesActual = mesISO(ahora);
  const mesAnterior = mesISO(subMonths(ahora, 1));
  const [lista, setLista] = useState<'seguimiento' | 'aceite' | 'control' | 'recuperar'>('seguimiento');
  const [segVer, setSegVer] = useState<Segmento | null>(null);

  const fichas = useMemo(() => fichasAceite(servicios), [servicios]);

  /* Indicadores */
  const nuevosMes = clientes.filter((c) => c.fechaContacto?.startsWith(mesActual)).length;
  const nuevosAnt = clientes.filter((c) => c.fechaContacto?.startsWith(mesAnterior)).length;
  const citasHoy = citas.filter((c) => c.fecha === hoy && c.estado !== 'cancelada');
  const ingMes = servicios.filter((s) => s.fecha.startsWith(mesActual)).reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const ingAnt = servicios.filter((s) => s.fecha.startsWith(mesAnterior)).reduce((a, s) => a + (Number(s.monto) || 0), 0);
  // Comparación justa: el mes anterior hasta el mismo día
  const diaHoy = ahora.getDate();
  const ingAntParcial = servicios
    .filter((s) => s.fecha.startsWith(mesAnterior) && Number(s.fecha.slice(8, 10)) <= diaHoy)
    .reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const retorno = tasaRetorno(fichas);

  /* Para contactar hoy */
  const ultimaInteraccion = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of interacciones) if (!m.has(i.clienteId) || m.get(i.clienteId)! < i.fecha) m.set(i.clienteId, i.fecha);
    return m;
  }, [interacciones]);

  // Se separan los seguimientos recientes de los antiguos (más de 90 días sin contacto).
  // Una lista de cientos de prospectos viejos nadie la trabaja; los recientes son los que hay que llamar hoy.
  const [seguimientos, porRecuperar] = useMemo(() => {
    const todos = clientes
      .filter((c) => !['atendido', 'perdido'].includes(c.estado))
      .map((c) => {
        const ult = [ultimaInteraccion.get(c.id), c.ultimoContacto, c.fechaContacto].filter(Boolean).sort().pop();
        const diasSin = ult ? differenceInCalendarDays(new Date(), parseISO(ult)) : 999;
        const vence = c.proximoContacto ? c.proximoContacto <= hoy : ['contactado', 'seguimiento', 'cotizacion'].includes(c.estado) && diasSin > 3;
        const antiguo = diasSin > DIAS_RECUPERAR && (!c.proximoContacto || differenceInCalendarDays(new Date(), parseISO(c.proximoContacto)) > DIAS_RECUPERAR);
        return { c, diasSin, vence, antiguo };
      })
      .filter((x) => x.vence);
    const orden = (a: (typeof todos)[number], b: (typeof todos)[number]) =>
      (a.c.proximoContacto ?? '9').localeCompare(b.c.proximoContacto ?? '9') || a.diasSin - b.diasSin;
    return [todos.filter((x) => !x.antiguo).sort(orden), todos.filter((x) => x.antiguo).sort((a, b) => a.diasSin - b.diasSin)];
  }, [clientes, ultimaInteraccion, hoy]);
  const aceiteHoy = useMemo(
    () => fichas.filter((f) => f.estado === 'semana' || (f.estado === 'vencido' && f.diasParaProximo >= -14)).sort((a, b) => a.diasParaProximo - b.diasParaProximo),
    [fichas],
  );
  const controles = useMemo(() => {
    const conv = citas.filter((c) => /conversi/i.test(c.servicio) && c.estado === 'asistio' && differenceInCalendarDays(new Date(), parseISO(c.fecha)) <= 90);
    return conv.filter((c) => !citas.some((x) => x.placa === c.placa && /1[.,]?000|control/i.test(x.servicio) && x.fecha >= c.fecha));
  }, [citas]);

  /* Ingresos por mes (últimos 6) */
  const meses = Array.from({ length: 6 }, (_, i) => subMonths(ahora, 5 - i));
  const serie = meses.map((d) => {
    const k = mesISO(d);
    const delMes = servicios.filter((s) => s.fecha.startsWith(k));
    return {
      mes: MESES[d.getMonth()].slice(0, 3),
      ingresos: delMes.reduce((a, s) => a + (Number(s.monto) || 0), 0),
      celular: delMes.length ? Math.round((delMes.filter((s) => s.celular).length / delMes.length) * 100) : null,
    };
  });

  /* Canales del mes */
  const canales = CANALES.map((c) => {
    const del = clientes.filter((x) => x.canal === c.id && x.fechaContacto?.startsWith(mesActual));
    const atendidos = del.filter((x) => x.estado === 'atendido').length;
    const conCita = del.filter((x) => ['cita', 'atendido'].includes(x.estado)).length;
    return { ...c, total: del.length, conCita, atendidos };
  });
  const maxCanal = Math.max(1, ...canales.map((c) => c.total));

  /* Segmentos */
  const segmentos = useMemo(() => {
    const m = new Map<Segmento, FichaAceite[]>();
    for (const f of fichas) {
      const s = segmentar(f);
      m.set(s, [...(m.get(s) ?? []), f]);
    }
    return m;
  }, [fichas]);

  /* Stock bajo */
  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of movimientos) m.set(x.productoId, (m.get(x.productoId) ?? 0) + (x.tipo === 'entrada' ? 1 : -1) * Number(x.cantidad || 0));
    return m;
  }, [movimientos]);
  const bajos = productos.filter((p) => p.stockMinimo > 0 && (stock.get(p.id) ?? 0) < p.stockMinimo);

  const nombreDe = (id?: string) => datos.clientes.find((c) => c.id === id)?.nombre;
  const nombreCita = (c: (typeof citas)[number]) =>
    (c.clienteId && nombreDe(c.clienteId)) || clientePorPlaca(c.placa, datos.vehiculos, datos.clientes).cliente?.nombre;
  const variacion = (a: number, b: number) => {
    if (!b) return null;
    const v = Math.round(((a - b) / b) * 100);
    return v;
  };
  const vNuevos = variacion(nuevosMes, nuevosAnt);
  const vIng = variacion(ingMes, ingAntParcial);

  const fecha = format(ahora, "EEEE d 'de' MMMM", { locale: es });

  return (
    <>
      <Encabezado titulo="Inicio" descripcion={`Hola${asesor ? ', ' + asesor : ''}. Esto es lo que pasa en el taller hoy, ${fecha}.`} />

      <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          oscuro
          icono={<Droplet />}
          etiqueta="Ingresos de aceite este mes"
          valor={soles(ingMes)}
          chip={vIng == null ? undefined : `${vIng >= 0 ? '+' : ''}${vIng}%`}
          chipMal={vIng != null && vIng < 0}
          nota={vIng == null ? `Mes anterior: ${soles(ingAnt)}` : 'frente al mismo día del mes anterior'}
        />
        <Indicador
          icono={<Users />}
          etiqueta="Clientes nuevos este mes"
          valor={nuevosMes.toLocaleString('es-PE')}
          chip={vNuevos == null ? undefined : `${vNuevos >= 0 ? '+' : ''}${vNuevos}%`}
          chipMal={vNuevos != null && vNuevos < 0}
          nota={vNuevos == null ? 'Sin datos del mes anterior' : `frente a ${MESES[subMonths(ahora, 1).getMonth()].toLowerCase()} completo`}
        />
        <Indicador
          icono={<CalendarDays />}
          etiqueta="Citas de hoy"
          valor={String(citasHoy.length)}
          nota={`${citasHoy.filter((c) => c.area === 'gas').length} en gas · ${citasHoy.filter((c) => c.area === 'mecanica').length} en mecánica`}
        />
        <Indicador
          icono={<RotateCcw />}
          etiqueta="Clientes de aceite que regresan"
          valor={`${Math.round(retorno * 100)}%`}
          nota={`${fichas.filter((f) => f.visitas >= 2).length} de ${fichas.length} vehículos volvieron`}
        />
      </section>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel titulo="Para contactar hoy" sinRelleno>
          <Pestanas
            className="px-4"
            valor={lista}
            onCambio={setLista}
            opciones={[
              { id: 'seguimiento', nombre: 'Seguimientos', cuenta: seguimientos.length },
              { id: 'aceite', nombre: 'Cambio de aceite', cuenta: aceiteHoy.length },
              { id: 'control', nombre: 'Control 1,000 km', cuenta: controles.length },
              { id: 'recuperar', nombre: 'Por recuperar', cuenta: porRecuperar.length },
            ]}
          />
          <div className="max-h-[392px] overflow-y-auto">
            {lista === 'seguimiento' &&
              (seguimientos.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gris">No hay seguimientos pendientes. Buen trabajo.</p>
              ) : (
                <ListaSeguimiento filas={seguimientos} />
              ))}
            {lista === 'recuperar' &&
              (porRecuperar.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gris">No hay clientes antiguos por recuperar.</p>
              ) : (
                <>
                  <p className="mx-5 mb-1 mt-1 rounded-xl bg-suave px-4 py-2.5 text-[13px] text-gris">
                    Llevan más de {DIAS_RECUPERAR} días sin contacto. Llámalos cuando haya tiempo libre, o márcalos como perdidos desde su ficha.
                  </p>
                  <ListaSeguimiento filas={porRecuperar} />
                </>
              ))}
            {lista === 'aceite' &&
              (aceiteHoy.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gris">A nadie le toca cambio de aceite esta semana.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {aceiteHoy.slice(0, 40).map((f) => (
                    <li key={f.placa} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-[76px] font-display text-base font-semibold tracking-wide num">{f.placa}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{nombreDe(f.clienteId) ?? 'Sin ficha'}</p>
                        <p className="text-[13px] text-gris">
                          Último {fechaCorta(f.ultimo.fecha)} ·{' '}
                          <span className={f.diasParaProximo < 0 ? 'font-semibold text-rojo' : ''}>
                            {f.diasParaProximo < 0 ? `${-f.diasParaProximo} días de atraso` : f.diasParaProximo === 0 ? 'le toca hoy' : `le toca en ${f.diasParaProximo} días`}
                          </span>
                        </p>
                      </div>
                      {f.celular ? <BotonWa celular={f.celular} /> : <span className="text-xs text-rojo">Sin celular</span>}
                    </li>
                  ))}
                </ul>
              ))}
            {lista === 'control' &&
              (controles.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gris">No hay controles de 1,000 km pendientes.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {controles.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-[76px] font-display text-base font-semibold tracking-wide num">{c.placa}</span>
                      <p className="flex-1 text-sm">
                        {c.servicio} el {fechaCorta(c.fecha)} <span className="text-gris">· sin control agendado</span>
                      </p>
                      <Link to="/agenda">
                        <Boton tam="sm" variante="secundario">
                          Agendar
                        </Boton>
                      </Link>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </Panel>

        <Panel titulo="Agenda de hoy" acciones={<Link to="/agenda" aria-label="Abrir agenda" title="Abrir agenda" className="flex h-9 w-9 items-center justify-center rounded-full border border-linea-fuerte text-tinta hover:bg-suave"><ArrowUpRight className="h-4 w-4" /></Link>} sinRelleno>
          {citasHoy.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gris">No hay citas para hoy.</p>
          ) : (
            <ul className="max-h-[440px] divide-y divide-linea overflow-y-auto">
              {[...citasHoy]
                .sort((a, b) => a.hora.localeCompare(b.hora))
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-12 text-sm font-semibold num">{c.hora}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{nombreCita(c) ?? <span className="num">{c.placa}</span>}</p>
                      <p className="truncate text-[13px] text-gris">
                        {nombreCita(c) && <span className="num">{c.placa} · </span>}
                        {c.servicio} · {nombreArea(c.area)}
                      </p>
                    </div>
                    {c.estado === 'asistio' && <Etiqueta tono="ok">Asistió</Etiqueta>}
                    {c.estado === 'no_asistio' && <Etiqueta tono="rojo">No asistió</Etiqueta>}
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Panel titulo="Ingresos de aceite por mes">
          <Grafico
            etiqueta="Ingresos de aceite de los últimos seis meses"
            opcion={{
              grid: { left: 8, right: 8, top: 28, bottom: 0, containLabel: true },
              tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (p: any) => {
                  const d = serie[p[0].dataIndex];
                  return `${d.mes}<br/><b>${soles(d.ingresos)}</b>${d.celular != null ? `<br/>${d.celular}% con celular` : ''}`;
                },
              },
              xAxis: { type: 'category', data: serie.map((s) => s.mes), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#5F636B' } },
              yAxis: { type: 'value', show: false },
              series: [
                {
                  type: 'bar',
                  barWidth: '42%',
                  data: serie.map((s, i) => ({ value: s.ingresos, itemStyle: { color: i === serie.length - 1 ? '#17181B' : '#E2E2DE', borderRadius: [10, 10, 10, 10] } })),
                  label: { show: true, position: 'top', color: '#1B1D21', fontWeight: 600, formatter: (p: any) => (p.value ? `S/ ${Math.round(p.value / 1000)}k` : '') },
                },
              ],
            }}
          />
          <div className="mt-3 flex flex-wrap justify-between gap-2 rounded-2xl bg-suave px-4 py-3 text-[13px]">
            <span className="text-gris">Servicios con celular registrado</span>
            <span className="flex gap-3 num">
              {serie.map((s) => (
                <span key={s.mes} className={cx(s.celular != null && s.celular < 80 ? 'font-semibold text-rojo' : 'text-tinta')}>
                  {s.celular == null ? '—' : `${s.celular}%`}
                </span>
              ))}
            </span>
          </div>
        </Panel>

        <Panel titulo={`Clientes por canal en ${MESES[ahora.getMonth()].toLowerCase()}`} sinRelleno>
          <Tabla compacta>
            <thead>
              <tr>
                <Th>Canal</Th>
                <Th className="w-[30%]">Registrados</Th>
                <Th className="text-right">Con cita</Th>
                <Th className="text-right">Atendidos</Th>
                <Th className="text-right">Conversión</Th>
              </tr>
            </thead>
            <tbody>
              {canales.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.nombre}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-fondo">
                        <div className="h-2 rounded-full bg-tinta/70" style={{ width: `${(c.total / maxCanal) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right font-semibold num">{c.total}</span>
                    </div>
                  </Td>
                  <Td className="text-right num">{c.conCita}</Td>
                  <Td className="text-right num">{c.atendidos}</Td>
                  <Td className="text-right font-semibold num">{c.total ? `${Math.round((c.atendidos / c.total) * 100)}%` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel titulo="Segmentos de clientes de aceite" sinRelleno>
          <div className="grid grid-cols-2 gap-2.5 px-6 pb-3 sm:grid-cols-5">
            {SEGMENTOS.map((s) => {
              const fs = segmentos.get(s.id) ?? [];
              const monto = Math.round(fs.reduce((a, f) => a + f.totalPagado, 0));
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSegVer(s.id)}
                  className={cx(
                    'flex flex-col items-start justify-start rounded-2xl px-4 py-4 text-left transition-colors',
                    s.id === 'leal' ? 'bg-carbon text-white hover:bg-carbon-2' : s.id === 'perdido' ? 'bg-rojo-suave hover:bg-[#F9DADC]' : s.id === 'riesgo' ? 'bg-aviso-suave hover:bg-[#F7E6C8]' : 'bg-suave hover:bg-[#ECECE8]',
                  )}
                >
                  <p className="min-h-[40px] text-sm font-semibold sm:min-h-[40px]">{s.nombre}</p>
                  <p className="mt-1 text-3xl font-semibold leading-none tracking-tight num">{fs.length}</p>
                  <p className="mt-1.5 text-[13px] opacity-80 num">{soles(monto)}</p>
                  <p className="mt-2 text-xs opacity-75">{s.regla}</p>
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel titulo="Stock por reponer" acciones={<Link to="/inventario" aria-label="Abrir inventario" title="Abrir inventario" className="flex h-9 w-9 items-center justify-center rounded-full border border-linea-fuerte text-tinta hover:bg-suave"><ArrowUpRight className="h-4 w-4" /></Link>} sinRelleno>
          {bajos.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gris">Todo el stock está sobre su mínimo.</p>
          ) : (
            <ul className="max-h-[220px] divide-y divide-linea overflow-y-auto">
              {bajos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    {p.nombre} <span className="text-gris">{p.variante}</span>
                  </span>
                  <span className="font-semibold text-rojo num">
                    {stock.get(p.id) ?? 0} / {p.stockMinimo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {segVer && (
        <Modal abierto onCerrar={() => setSegVer(null)} titulo={SEGMENTOS.find((s) => s.id === segVer)!.nombre} descripcion={SEGMENTOS.find((s) => s.id === segVer)!.regla} ancho="lg">
          <Tabla>
            <thead>
              <tr>
                <Th>Placa</Th>
                <Th>Cliente</Th>
                <Th className="text-right">Visitas</Th>
                <Th>Último</Th>
                <Th className="text-right">Total</Th>
                <Th className="w-10"><span className="sr-only">WhatsApp</span></Th>
              </tr>
            </thead>
            <tbody>
              {(segmentos.get(segVer) ?? [])
                .sort((a, b) => b.totalPagado - a.totalPagado)
                .slice(0, 200)
                .map((f) => (
                  <tr key={f.placa}>
                    <Td className="font-semibold num">{f.placa}</Td>
                    <Td>
                      {nombreDe(f.clienteId) ?? <span className="text-gris">Sin ficha</span>}
                      {f.celular && <p className="text-[13px] text-gris num">{formatoCelular(f.celular)}</p>}
                    </Td>
                    <Td className="text-right num">{f.visitas}</Td>
                    <Td className="num">{fechaCorta(f.ultimo.fecha)}</Td>
                    <Td className="text-right num">{soles(f.totalPagado)}</Td>
                    <Td>{f.celular && <BotonWa celular={f.celular} />}</Td>
                  </tr>
                ))}
            </tbody>
          </Tabla>
        </Modal>
      )}
    </>
  );
}

function Indicador({
  etiqueta,
  valor,
  nota,
  icono,
  chip,
  chipMal,
  oscuro,
}: {
  etiqueta: string;
  valor: string;
  nota: string;
  icono: React.ReactNode;
  chip?: string;
  chipMal?: boolean;
  oscuro?: boolean;
}) {
  return (
    <div className={cx('flex min-h-[172px] flex-col gap-3 rounded-3xl p-5 sm:px-6', oscuro ? 'bg-carbon text-white' : 'bg-white text-tinta')}>
      <div className="flex items-start justify-between gap-3">
        <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5', oscuro ? 'bg-carbon-3' : 'bg-suave')}>{icono}</span>
        {chip && (
          <span
            className={cx(
              'rounded-full px-2.5 py-0.5 text-xs font-bold num',
              chipMal ? (oscuro ? 'bg-rojo text-white' : 'bg-rojo-suave text-rojo-osc') : oscuro ? 'bg-[#1E7B4F] text-white' : 'bg-ok-suave text-ok',
            )}
          >
            {chip}
          </span>
        )}
      </div>
      <p className={cx('mt-auto text-sm', oscuro ? 'text-[#C9CBC6]' : 'text-gris')}>{etiqueta}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className="text-[30px] font-semibold leading-none tracking-tight num">{valor}</p>
        <p className={cx('max-w-[60%] text-right text-xs leading-snug', oscuro ? 'text-[#C9CBC6]' : 'text-gris')}>{nota}</p>
      </div>
    </div>
  );
}

function ListaSeguimiento({ filas }: { filas: { c: Cliente; diasSin: number }[] }) {
  return (
    <ul className="divide-y divide-linea">
      {filas.slice(0, 60).map(({ c, diasSin }) => (
        <li key={c.id} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <Link to={`/clientes/${c.id}`} className="font-semibold hover:underline">
              {c.nombre && !/^sin nombre$/i.test(c.nombre) ? c.nombre : c.celular ? formatoCelular(c.celular) : 'Sin nombre'}
            </Link>
            <p className="truncate text-[13px] text-gris">
              {c.interes || 'Sin servicio de interés'} ·{' '}
              {c.proximoContacto && diasSin <= DIAS_RECUPERAR ? `quedó para el ${fechaCorta(c.proximoContacto)}` : diasSin >= 999 ? 'sin contactos registrados' : `${diasSin} días sin contacto`}
            </p>
          </div>
          <Etiqueta tono={estadoInfo(c.estado).tono}>{estadoInfo(c.estado).nombre}</Etiqueta>
          {c.celular && <BotonWa celular={c.celular} />}
        </li>
      ))}
      {filas.length > 60 && <li className="px-5 py-3 text-[13px] text-gris">Y {filas.length - 60} más. Búscalos en Base de clientes.</li>}
    </ul>
  );
}

function BotonWa({ celular }: { celular: string }) {
  return (
    <a
      href={enlaceWhatsApp(celular)}
      target="_blank"
      rel="noreferrer"
      title={`Escribir a ${formatoCelular(celular)}`}
      aria-label={`Escribir por WhatsApp a ${formatoCelular(celular)}`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok-suave text-ok hover:bg-[#D3EADD]"
    >
      <MessageCircle className="h-4 w-4" />
    </a>
  );
}

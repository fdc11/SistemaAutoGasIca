// Cálculos del negocio: próximo cambio de aceite, regresos y segmentos de clientes.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Cliente, ServicioAceite, Vehiculo } from './types';
import { DIAS_ENTRE_CAMBIOS } from './catalogos';
import { agruparPor, hoyISO, mediana, sumarDias } from './utils';

export type EstadoAceite = 'vencido' | 'semana' | 'proximo' | 'al_dia';

export interface FichaAceite {
  placa: string;
  servicios: ServicioAceite[]; // ordenados del más antiguo al más reciente
  ultimo: ServicioAceite;
  visitas: number;
  totalPagado: number;
  intervaloDias: number; // propio del vehículo o el general
  intervaloPropio: boolean;
  fechaProxima: string;
  diasParaProximo: number; // negativo = vencido
  estado: EstadoAceite;
  celular?: string;
  clienteId?: string;
  vehiculoId?: string;
}

/** Agrupa los servicios por placa y calcula cuándo le toca el siguiente cambio a cada vehículo. */
export function fichasAceite(servicios: ServicioAceite[]): FichaAceite[] {
  const hoy = hoyISO();
  const grupos = agruparPor(
    servicios.filter((s) => s.placa && s.fecha),
    (s) => s.placa,
  );
  const out: FichaAceite[] = [];
  for (const [placa, lista] of grupos) {
    const ord = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimo = ord[ord.length - 1];
    const difs: number[] = [];
    for (let i = 1; i < ord.length; i++) {
      const d = differenceInCalendarDays(parseISO(ord[i].fecha), parseISO(ord[i - 1].fecha));
      if (d > 7) difs.push(d);
    }
    const propio = difs.length > 0;
    const intervaloDias = propio ? Math.round(mediana(difs)) : DIAS_ENTRE_CAMBIOS;
    const fechaProxima = sumarDias(ultimo.fecha, intervaloDias);
    const diasParaProximo = differenceInCalendarDays(parseISO(fechaProxima), parseISO(hoy));
    const estado: EstadoAceite =
      diasParaProximo < 0 ? 'vencido' : diasParaProximo <= 7 ? 'semana' : diasParaProximo <= 21 ? 'proximo' : 'al_dia';
    const celular = [...ord].reverse().find((s) => s.celular)?.celular;
    out.push({
      placa,
      servicios: ord,
      ultimo,
      visitas: ord.length,
      totalPagado: ord.reduce((a, s) => a + (Number(s.monto) || 0), 0),
      intervaloDias,
      intervaloPropio: propio,
      fechaProxima,
      diasParaProximo,
      estado,
      celular,
      clienteId: [...ord].reverse().find((s) => s.clienteId)?.clienteId,
      vehiculoId: [...ord].reverse().find((s) => s.vehiculoId)?.vehiculoId,
    });
  }
  return out;
}

export type Segmento = 'leal' | 'recurrente' | 'nuevo' | 'riesgo' | 'perdido';

export const SEGMENTOS: { id: Segmento; nombre: string; regla: string }[] = [
  { id: 'leal', nombre: 'Leales', regla: '3 visitas o más' },
  { id: 'recurrente', nombre: 'Recurrentes activos', regla: '2 visitas, la última hace 60 días o menos' },
  { id: 'nuevo', nombre: 'Nuevos', regla: 'Primera visita hace menos de 45 días' },
  { id: 'riesgo', nombre: 'En riesgo', regla: 'Entre 45 y 120 días sin volver' },
  { id: 'perdido', nombre: 'Perdidos', regla: 'Más de 120 días sin volver' },
];

/** Segmentación por recencia y frecuencia (misma regla que la prueba con los datos reales). */
export function segmentar(f: FichaAceite, hoy = hoyISO()): Segmento {
  const rec = differenceInCalendarDays(parseISO(hoy), parseISO(f.ultimo.fecha));
  const desdePrimera = differenceInCalendarDays(parseISO(hoy), parseISO(f.servicios[0].fecha));
  if (f.visitas >= 3) return 'leal';
  if (f.visitas === 2 && rec <= 60) return 'recurrente';
  if (f.visitas === 1 && desdePrimera <= 45) return 'nuevo';
  if (rec > 120) return 'perdido';
  return 'riesgo';
}

/** Tasa de retorno: vehículos con 2 o más servicios sobre el total de vehículos atendidos. */
export const tasaRetorno = (fichas: FichaAceite[]) =>
  fichas.length ? fichas.filter((f) => f.visitas >= 2).length / fichas.length : 0;

export function clientePorPlaca(placa: string, vehiculos: Vehiculo[], clientes: Cliente[]) {
  const v = vehiculos.find((x) => x.placa === placa && !x.eliminado);
  const c = v?.clienteId ? clientes.find((x) => x.id === v.clienteId && !x.eliminado) : undefined;
  return { vehiculo: v, cliente: c };
}

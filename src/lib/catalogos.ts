import type { Area, Canal, CategoriaProducto, EstadoCita, EstadoCliente, Listas } from './types';

export const CANALES: { id: Canal; nombre: string; descripcion: string }[] = [
  { id: 'presencial', nombre: 'Presencial', descripcion: 'Llegó al taller' },
  { id: 'llamada', nombre: 'Llamada', descripcion: 'Por teléfono' },
  { id: 'whatsapp', nombre: 'WhatsApp', descripcion: 'Escribió al taller' },
  { id: 'publicidad', nombre: 'Publicidad', descripcion: 'Vino por un anuncio' },
  { id: 'convenio', nombre: 'Convenio', descripcion: 'Empresa con convenio' },
  { id: 'referido', nombre: 'Referido', descripcion: 'Lo recomendaron' },
];

export const nombreCanal = (c?: string) => CANALES.find((x) => x.id === c)?.nombre ?? '—';

export const ESTADOS: { id: EstadoCliente; nombre: string; tono: Tono }[] = [
  { id: 'nuevo', nombre: 'Nuevo', tono: 'gris' },
  { id: 'contactado', nombre: 'Contactado', tono: 'info' },
  { id: 'seguimiento', nombre: 'En seguimiento', tono: 'aviso' },
  { id: 'cotizacion', nombre: 'Cotización enviada', tono: 'aviso' },
  { id: 'cita', nombre: 'Cita programada', tono: 'info' },
  { id: 'atendido', nombre: 'Atendido', tono: 'ok' },
  { id: 'perdido', nombre: 'Perdido', tono: 'rojo' },
];

export type Tono = 'gris' | 'info' | 'aviso' | 'ok' | 'rojo';

export const estadoInfo = (e?: string) => ESTADOS.find((x) => x.id === e) ?? ESTADOS[0];

export const ESTADOS_CITA: { id: EstadoCita; nombre: string; tono: Tono }[] = [
  { id: 'agendada', nombre: 'Agendada', tono: 'info' },
  { id: 'asistio', nombre: 'Asistió', tono: 'ok' },
  { id: 'no_asistio', nombre: 'No asistió', tono: 'rojo' },
  { id: 'cancelada', nombre: 'Cancelada', tono: 'gris' },
];

export const ESTADOS_NUMERO: { id: import('./types').EstadoNumero; nombre: string; tono: Tono }[] = [
  { id: 'nuevo', nombre: 'Nuevo', tono: 'gris' },
  { id: 'contactado', nombre: 'Contactado', tono: 'info' },
  { id: 'sin_respuesta', nombre: 'Sin respuesta', tono: 'aviso' },
  { id: 'cotizacion', nombre: 'Cotización enviada', tono: 'aviso' },
  { id: 'cita', nombre: 'Cita agendada', tono: 'info' },
  { id: 'concretado', nombre: 'Concretado', tono: 'ok' },
  { id: 'perdido', nombre: 'Perdido', tono: 'rojo' },
];
export const estadoNumero = (e?: string) => ESTADOS_NUMERO.find((x) => x.id === e) ?? ESTADOS_NUMERO[0];

export const AREAS: { id: Area; nombre: string }[] = [
  { id: 'mecanica', nombre: 'Mecánica general' },
  { id: 'gas', nombre: 'Área de gas' },
];
export const nombreArea = (a?: string) => AREAS.find((x) => x.id === a)?.nombre ?? '—';

// Horario del taller: 2 cupos por hora y por área. Sábado hasta el mediodía.
export const HORAS_SEMANA = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
export const HORAS_SABADO = ['08:00', '09:00', '10:00', '11:00', '12:00'];
export const CUPOS_POR_HORA = 2;

export const CATEGORIAS: { id: CategoriaProducto; nombre: string }[] = [
  { id: 'aceite', nombre: 'Aceites' },
  { id: 'tanque_gnv', nombre: 'Tanques GNV' },
  { id: 'tanque_glp', nombre: 'Tanques GLP' },
  { id: 'electronica', nombre: 'Electrónicas' },
  { id: 'gasificador', nombre: 'Gasificadores' },
  { id: 'inyector', nombre: 'Inyectores' },
  { id: 'reductor', nombre: 'Reductores' },
  { id: 'refrigerante', nombre: 'Refrigerante' },
  { id: 'otro', nombre: 'Otros' },
];
export const nombreCategoria = (c?: string) => CATEGORIAS.find((x) => x.id === c)?.nombre ?? '—';

// Intervalo de cambio por marca de aceite (km). Fuente: regla del Excel de seguimiento.
export const INTERVALOS_ACEITE: { patron: RegExp; km: number; marca: string }[] = [
  { patron: /liqui\s*moly|molygen/i, km: 8000, marca: 'Liqui Moly' },
  { patron: /castrol/i, km: 6000, marca: 'Castrol' },
  { patron: /shell/i, km: 6000, marca: 'Shell' },
  { patron: /vistony/i, km: 6000, marca: 'Vistony' },
  { patron: /mobil/i, km: 6000, marca: 'Mobil' },
];

export const intervaloPorDetalle = (detalle?: string): number | undefined =>
  INTERVALOS_ACEITE.find((x) => x.patron.test(detalle ?? ''))?.km;

// Mediana real de días entre cambios de aceite (marzo–agosto 2026, 302 regresos).
export const DIAS_ENTRE_CAMBIOS = 64;

export const LISTAS_INICIALES: Omit<Listas, 'id' | 'creadoEn' | 'creadoPor'> = {
  servicios: [
    'Conversión GNV',
    'Conversión GLP',
    'Mantenimiento de gas',
    'Regulación de gas',
    'Control 1,000 km',
    'Certificación anual',
    'Revisión quinquenal',
    'Diagnóstico',
    'Garantía',
    'Cambio de aceite',
    'Mantenimiento menor',
    'Mantenimiento mayor',
    'Afinamiento',
    'Cambio de bujías',
    'Cambio de electrónica',
    'Cambio de inyectores',
    'Montaje de tanque',
    'Carga de refrigerante',
    'Otro',
  ],
  subcanales: ['Facebook Ads', 'Instagram', 'TikTok Ads', 'Google', 'Volante o letrero', 'Otro'],
  motivosPerdida: [
    'No contesta',
    'Precio',
    'Es de otra ciudad',
    'Lo hizo en otro taller',
    'Solo consultaba',
    'Vendió el vehículo',
    'Otro',
  ],
  tecnicos: [],
  asesores: ['Ximena', 'Renzo', 'Diego', 'Hilary', 'Daniel', 'Caro', 'Jeffer'],
  ciudades: ['Ica', 'Pisco', 'Chincha', 'Nazca', 'Marcona', 'Palpa', 'Lima'],
  areasCliente: ['Conversiones', 'Mecánica', 'Gas'],
  tiposContacto: ['Facebook Ads', 'TikTok Ads', 'Instagram', 'WhatsApp', 'Orgánico', 'Llamada', 'Presencial', 'Referido', 'Cliente recurrente'],
};

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

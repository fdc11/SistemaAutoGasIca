// Modelo de datos del sistema AutoGas Ica.
// Cada colección vive en Firestore con el mismo nombre que la clave de `Colecciones`.

export type Canal = 'presencial' | 'llamada' | 'whatsapp' | 'publicidad' | 'convenio' | 'referido';

export type EstadoCliente =
  | 'nuevo'
  | 'contactado'
  | 'seguimiento'
  | 'cotizacion'
  | 'cita'
  | 'atendido'
  | 'perdido';

export type Area = 'mecanica' | 'gas';

export interface Base {
  id: string;
  creadoEn: string; // ISO
  creadoPor: string;
  actualizadoEn?: string;
  actualizadoPor?: string;
  eliminado?: boolean;
  eliminadoEn?: string;
  importacionId?: string;
}

export interface Cliente extends Base {
  nombre: string;
  celular: string; // 9 dígitos, vacío si no lo dio
  ciudad?: string;
  canal: Canal;
  subcanal?: string; // Facebook Ads, Instagram, TikTok Ads...
  empresaId?: string; // convenio
  estado: EstadoCliente;
  interes?: string; // servicio de interés (lista controlada)
  interesDetalle?: string; // texto original, p. ej. «PROMO CASTROL»
  interesNivel?: 'alto' | 'medio' | 'bajo';
  fechaCita?: string; // fecha de cita acordada (YYYY-MM-DD o texto del Excel)
  ultimoContacto?: string; // YYYY-MM-DD
  codigoAnterior?: string; // ID del Excel de origen
  probabilidad?: 'alta' | 'media' | 'baja';
  motivoPerdida?: string;
  proximoContacto?: string; // YYYY-MM-DD
  fechaContacto: string; // YYYY-MM-DD primer contacto
  notas?: string;
}

export interface Vehiculo extends Base {
  placa: string;
  marca?: string;
  modelo?: string;
  anio?: string;
  clienteId?: string;
  empresaId?: string;
}

export type TipoInteraccion = 'llamada' | 'whatsapp' | 'presencial' | 'nota' | 'estado' | 'sistema';

export interface Interaccion extends Base {
  clienteId: string;
  fecha: string; // ISO
  tipo: TipoInteraccion;
  resultado?: string;
  comentario: string;
  estadoAnterior?: EstadoCliente;
  estadoNuevo?: EstadoCliente;
}

export type EstadoCita = 'agendada' | 'asistio' | 'no_asistio' | 'cancelada';

export interface Cita extends Base {
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:mm
  area: Area;
  placa: string;
  clienteId?: string;
  servicio: string;
  notas?: string;
  estado: EstadoCita;
  agendadoPor: string;
  /** Fecha y hora en que se envió el recordatorio por WhatsApp. */
  recordadoEn?: string;
}

export interface Bloqueo extends Base {
  fecha: string;
  hora: string;
  area: Area;
  motivo: string;
}

export interface Ingreso extends Base {
  placa: string;
  marcaModelo?: string;
  servicio: string;
  area: Area;
  tecnico?: string;
  horaIngreso: string; // ISO
  horaSalida?: string; // ISO
  citaId?: string;
}

export interface ServicioAceite extends Base {
  fecha: string; // YYYY-MM-DD
  placa: string;
  vehiculoId?: string;
  clienteId?: string;
  productoId?: string;
  detalle: string;
  kmActual?: number;
  intervaloKm?: number;
  kmProximo?: number;
  monto: number;
  celular?: string;
  respuesta?: string;
  sede?: string;
}

export interface Empresa extends Base {
  nombre: string;
  ruc?: string;
  contacto?: string;
  telefono?: string;
  condiciones?: string;
  activa: boolean;
}

export interface Filtro extends Base {
  marca: string;
  modelo: string;
  filtroAire?: string;
  filtroAceite?: string;
}

export type CategoriaProducto =
  | 'aceite'
  | 'tanque_gnv'
  | 'tanque_glp'
  | 'electronica'
  | 'gasificador'
  | 'inyector'
  | 'reductor'
  | 'refrigerante'
  | 'otro';

export interface Producto extends Base {
  categoria: CategoriaProducto;
  nombre: string;
  variante?: string;
  intervaloKm?: number;
  precio?: number;
  stockMinimo: number;
}

export interface Movimiento extends Base {
  productoId: string;
  tipo: 'entrada' | 'salida';
  cantidad: number;
  referencia?: string; // placa o DNI
  tipoVenta?: string;
  fecha: string; // YYYY-MM-DD
  nota?: string;
}

export interface Importacion extends Base {
  archivo: string;
  plantilla: string;
  leidas: number;
  creadas: number;
  fusionadas: number;
  omitidas: number;
  ids: Record<string, string[]>;
  revertida?: boolean;
}

export interface Listas extends Base {
  servicios: string[];
  subcanales: string[];
  motivosPerdida: string[];
  tecnicos: string[];
  asesores: string[];
  ciudades: string[];
}

export interface Colecciones {
  clientes: Cliente;
  vehiculos: Vehiculo;
  interacciones: Interaccion;
  citas: Cita;
  bloqueos: Bloqueo;
  ingresos: Ingreso;
  serviciosAceite: ServicioAceite;
  empresas: Empresa;
  filtros: Filtro;
  productos: Producto;
  movimientos: Movimiento;
  importaciones: Importacion;
  ajustes: Listas;
}

export type NombreColeccion = keyof Colecciones;

export const COLECCIONES: NombreColeccion[] = [
  'clientes',
  'vehiculos',
  'interacciones',
  'citas',
  'bloqueos',
  'ingresos',
  'serviciosAceite',
  'empresas',
  'filtros',
  'productos',
  'movimientos',
  'importaciones',
  'ajustes',
];

export type Nuevo<T extends Base> = Omit<T, keyof Base> & Partial<Pick<Base, 'importacionId'>> & { id?: string };

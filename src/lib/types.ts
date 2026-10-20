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
  dni?: string; // 8 dígitos, opcional
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
  /** Áreas del taller donde se le atendió: Conversiones, Mecánica, Gas… (para segmentar). */
  areas?: string[];
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
  /** Copia del nombre y celular del cliente: la agenda sigue funcionando aunque se borre su ficha. */
  nombreCliente?: string;
  celularCliente?: string;
  /** Fecha y hora en que se envió el recordatorio por WhatsApp. */
  recordadoEn?: string;
  /** Fecha y hora en que se envió la confirmación de la cita recién agendada. */
  confirmadoEn?: string;
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

export type EstadoNumero = 'nuevo' | 'contactado' | 'cotizacion' | 'cita' | 'concretado' | 'sin_respuesta' | 'perdido';

/** Número nuevo que escribió o llamó al taller (registro de tráfico de ingresos, como «FORMATO CONTROL NUMEROS»). */
export interface NumeroNuevo extends Base {
  fecha: string; // fecha de contacto YYYY-MM-DD
  celular: string;
  nombre?: string;
  tipoContacto: string; // Facebook Ads, WhatsApp, Orgánico… (lista editable)
  interes?: string; // lista de servicios
  interesDetalle?: string;
  area?: string; // Conversiones, Mecánica, Gas
  placa?: string;
  marca?: string;
  modelo?: string;
  fechaCita?: string;
  ultimoContacto?: string;
  comentarios?: string;
  estado: EstadoNumero;
  clienteId?: string; // cuando se pasó a la Base de clientes
}

export type EstadoCobro = 'pendiente' | 'cobrado';

/** Atención a un vehículo de empresa con convenio (una fila del Excel «CONVENIOS CAMBIO DE ACEITE»). */
export interface AtencionConvenio extends Base {
  fecha: string; // YYYY-MM-DD
  empresaId: string;
  clienteId?: string;
  vehiculoId?: string;
  placa: string;
  nombre: string; // como se registró ese día (por si luego cambia la ficha)
  celular: string;
  servicio: string; // lista controlada
  detalle?: string; // «LIQUI MOLY 5W30», «REGULACION DE GAS»…
  marca?: string;
  modelo?: string;
  filtroAire?: string;
  filtroAceite?: string;
  kmActual?: number;
  monto?: number;
  cobro: EstadoCobro;
  cobradoEn?: string;
  notas?: string;
  servicioAceiteId?: string; // si fue cambio de aceite, también queda en Cambio de aceite
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
  areasCliente: string[];
  tiposContacto: string[];
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
  atenciones: AtencionConvenio;
  numeros: NumeroNuevo;
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
  'atenciones',
  'numeros',
  'productos',
  'movimientos',
  'importaciones',
  'ajustes',
];

export type Nuevo<T extends Base> = Omit<T, keyof Base> & Partial<Pick<Base, 'importacionId'>> & { id?: string };

// Plantillas de importación: una por cada tipo de Excel que usa el taller.
import type { Area, Canal, EstadoCliente } from '../lib/types';
import { intervaloPorDetalle } from '../lib/catalogos';
import { extraerPlaca, normalizarCelular, normalizarPlaca, placaValida, plano, similitud, titulo } from '../lib/utils';
import {
  claveEncabezado,
  horaAgenda,
  inferirEstado,
  leerCanal,
  leerFecha,
  leerMarca,
  leerServicio,
  letraColumna,
  numeroDe,
  separarModeloAnio,
  texto,
  type Celda,
  type Hoja,
} from './lectura';

/* ---------- Propuesta: lo que una fila del Excel va a crear ---------- */

export interface Propuesta {
  fila: number; // número de fila en Excel (1 = primera)
  cliente?: {
    nombre: string;
    celular: string;
    ciudad?: string;
    canal: Canal;
    subcanal?: string;
    estado: EstadoCliente;
    motivoPerdida?: string;
    interes?: string;
    interesDetalle?: string;
    interesNivel?: 'alto' | 'medio' | 'bajo';
    fechaCita?: string;
    ultimoContacto?: string;
    codigoAnterior?: string;
    probabilidad?: 'alta' | 'media' | 'baja';
    fechaContacto: string;
    proximoContacto?: string;
  };
  vehiculo?: { placa: string; marca?: string; modelo?: string; anio?: string };
  empresa?: string;
  interaccion?: { fecha: string; tipo: 'llamada' | 'whatsapp' | 'presencial' | 'nota'; comentario: string; resultado?: string };
  servicio?: { fecha: string; detalle: string; kmActual?: number; intervaloKm?: number; kmProximo?: number; monto: number; celular?: string; respuesta?: string; sede?: string };
  filtro?: { marca: string; modelo: string; filtroAire?: string; filtroAceite?: string };
  movimiento?: { producto: string; cantidad: number; referencia?: string; tipoVenta?: string; fecha: string; nota?: string };
  cita?: { fecha: string; hora: string; area: Area; servicio: string; agendadoPor: string; notas?: string; estado: 'agendada' | 'asistio' };
  bloqueo?: { fecha: string; hora: string; area: Area; motivo: string };
  avisos: string[];
  error?: string;
  resumen: string; // texto corto para la vista previa
}

export interface Campo {
  id: string;
  nombre: string;
  alias: string[];
  requerido?: boolean;
}

export interface Columna {
  indice: number;
  nombre: string;
}

export interface PlantillaTabla {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: 'tabla';
  campos: Campo[];
  construir: (v: (campo: string) => Celda, fila: number) => Propuesta | null;
}

export interface PlantillaAgenda {
  id: 'agenda';
  nombre: string;
  descripcion: string;
  tipo: 'agenda';
}

export type Plantilla = PlantillaTabla | PlantillaAgenda;

const hoy = () => new Date().toISOString().slice(0, 10);

function vehiculoDe(placaCelda: Celda, marca: Celda, modeloAnio: Celda, avisos: string[]) {
  const crudo = texto(placaCelda);
  if (!crudo || crudo === '0') return undefined;
  const placa = placaValida(normalizarPlaca(crudo)) ? normalizarPlaca(crudo) : extraerPlaca(crudo);
  if (!placa) {
    avisos.push(`Placa «${crudo}» no válida, se omite`);
    return undefined;
  }
  const ma = separarModeloAnio(modeloAnio);
  return { placa, marca: leerMarca(marca), modelo: ma.modelo, anio: ma.anio };
}

function celularDe(v: Celda, avisos: string[]) {
  const crudo = texto(v);
  const c = normalizarCelular(crudo);
  if (crudo && !c && !/^(s\/?n|no tiene|no hay|no tiene wsp+|-)$/i.test(crudo)) avisos.push(`Celular «${crudo}» no válido`);
  return c;
}

/** «Cotización enviada», «En seguimiento»… (como los exporta el sistema) → estado. */
function estadoPorNombre(v: Celda): EstadoCliente | undefined {
  const t = plano(v);
  if (!t) return undefined;
  const m: [RegExp, EstadoCliente][] = [
    [/^nuevo/, 'nuevo'],
    [/^contactad/, 'contactado'],
    [/seguimiento/, 'seguimiento'],
    [/cotizacion/, 'cotizacion'],
    [/cita/, 'cita'],
    [/^atendid|instalad/, 'atendido'],
    [/^perdid/, 'perdido'],
  ];
  return m.find(([r]) => r.test(t))?.[1];
}

/* ---------- Prospectos (TABLA DE PROSPECTOS 2025 / 2026) ---------- */

const prospectos: PlantillaTabla = {
  id: 'prospectos',
  nombre: 'Prospectos (WhatsApp y publicidad)',
  descripcion: 'Hojas «TABLA DE PROSPECTOS»: fecha, teléfono, tipo de contacto, interés y comentarios.',
  tipo: 'tabla',
  campos: [
    { id: 'fecha', nombre: 'Fecha de contacto', alias: ['fechadecontacto', 'fecha'] },
    { id: 'telefono', nombre: 'Teléfono', alias: ['telefono', 'celular', 'numero'], requerido: true },
    { id: 'nombre', nombre: 'Nombre', alias: ['nombrecompleto', 'nombrecompletocontacto', 'nombre', 'contacto'] },
    { id: 'tipo', nombre: 'Tipo de contacto', alias: ['tipodecontacto', 'canal', 'fuente'] },
    { id: 'interes', nombre: 'Interés', alias: ['interes', 'servicio'] },
    { id: 'placa', nombre: 'Placa', alias: ['placa'] },
    { id: 'marca', nombre: 'Marca', alias: ['marca'] },
    { id: 'modelo', nombre: 'Modelo y año', alias: ['modeloyano', 'modelo'] },
    { id: 'cita', nombre: 'Fecha de cita', alias: ['fechadecita'] },
    { id: 'ultimo', nombre: 'Último contacto', alias: ['ultimocontacto', 'ultimocontecto'] },
    { id: 'comentarios', nombre: 'Comentarios', alias: ['comentarios', 'comentario', 'observaciones'] },
    { id: 'estado', nombre: 'Estado', alias: ['estado'] },
    { id: 'motivo', nombre: 'Motivo de pérdida', alias: ['motivodeperdida'] },
    { id: 'ciudad', nombre: 'Ciudad', alias: ['ciudad'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const celular = celularDe(v('telefono'), avisos);
    const nombre = titulo(texto(v('nombre')));
    const vehiculo = vehiculoDe(v('placa'), v('marca'), v('modelo'), avisos);
    if (!celular && !vehiculo && !nombre) return null;
    let f = leerFecha(v('fecha'));
    const u = leerFecha(v('ultimo'));
    if (!f.valida) {
      if (texto(v('fecha'))) avisos.push(`Fecha «${texto(v('fecha'))}» no válida, se usó la del último contacto`);
      f = u.valida ? u : { iso: hoy(), valida: true };
    }
    const c = leerCanal(v('tipo')) ?? { canal: 'whatsapp' as Canal };
    if (!leerCanal(v('tipo')) && texto(v('tipo'))) avisos.push(`Tipo «${texto(v('tipo'))}» no reconocido, se tomó WhatsApp`);
    const comentario = texto(v('comentarios'));
    const estExplicito = estadoPorNombre(v('estado'));
    const est = estExplicito ? { estado: estExplicito, motivo: texto(v('motivo')) || undefined } : inferirEstado(comentario, 'contactado');
    const citaTxt = texto(v('cita'));
    const fc = leerFecha(v('cita'));
    const coment = comentario;
    return {
      fila,
      cliente: {
        nombre: nombre || '',
        celular,
        canal: c.canal,
        subcanal: c.subcanal,
        estado: est.estado,
        motivoPerdida: est.motivo,
        interes: leerServicio(v('interes')),
        interesDetalle: texto(v('interes')) || undefined,
        ciudad: titulo(texto(v('ciudad'))) || undefined,
        fechaCita: fc.valida ? fc.iso : citaTxt || undefined,
        ultimoContacto: u.valida ? u.iso : undefined,
        fechaContacto: f.iso,
      },
      vehiculo,
      interaccion: coment
        ? { fecha: (u.valida ? u.iso : f.iso) + 'T12:00:00.000Z', tipo: c.canal === 'presencial' ? 'presencial' : 'whatsapp', comentario: coment }
        : undefined,
      avisos,
      error: !celular && !vehiculo ? 'Sin celular ni placa' : undefined,
      resumen: [nombre || 'Sin nombre', celular, vehiculo?.placa].filter(Boolean).join(' · '),
    };
  },
};

/* ---------- BaseClientes ---------- */

const baseClientes: PlantillaTabla = {
  id: 'baseClientes',
  nombre: 'Base de clientes',
  descripcion: 'Hoja «BaseClientes»: celular, nombre, fuente de campaña, servicio consultado y estado.',
  tipo: 'tabla',
  campos: [
    { id: 'telefono', nombre: 'Celular', alias: ['numerodecelular', 'celular', 'telefono'], requerido: true },
    { id: 'codigo', nombre: 'ID de cliente', alias: ['idcliente', 'id'] },
    { id: 'nombre', nombre: 'Nombre', alias: ['nombresyapellidos', 'nombre'] },
    { id: 'ciudad', nombre: 'Ciudad', alias: ['ciudad'] },
    { id: 'fuente', nombre: 'Fuente de campaña', alias: ['fuentedecampana', 'fuente'] },
    { id: 'servicio', nombre: 'Servicio consultado', alias: ['tipodeservicioconsultado', 'servicio'] },
    { id: 'estado', nombre: 'Estado', alias: ['estadodelcliente', 'estado'] },
    { id: 'placa', nombre: 'Placa', alias: ['placa'] },
    { id: 'marca', nombre: 'Marca', alias: ['marcadelvehiculo', 'marca'] },
    { id: 'modelo', nombre: 'Modelo y año', alias: ['modeloano', 'modelo'] },
    { id: 'notas', nombre: 'Notas', alias: ['notas', 'comentarios'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const celular = celularDe(v('telefono'), avisos);
    const nombre = titulo(texto(v('nombre')));
    const vehiculo = vehiculoDe(v('placa'), v('marca'), v('modelo'), avisos);
    if (!celular && !nombre && !vehiculo) return null;
    const notas = texto(v('notas'));
    const e = plano(v('estado'));
    let estado: EstadoCliente = 'contactado';
    let motivo: string | undefined;
    if (e.startsWith('nuevo')) estado = 'nuevo';
    else if (e.startsWith('en seguimiento')) estado = 'seguimiento';
    else if (e.startsWith('perdido')) {
      estado = 'perdido';
      motivo = 'Otro';
    } else if (e.startsWith('cerrado')) {
      const inf = inferirEstado(notas, 'atendido');
      estado = inf.estado === 'seguimiento' ? 'perdido' : inf.estado;
      motivo = inf.estado === 'seguimiento' ? 'No contesta' : inf.motivo;
      avisos.push(`«Cerrado» se interpretó como ${estado === 'atendido' ? 'Atendido' : 'Perdido'} según las notas`);
    }
    const c = leerCanal(v('fuente')) ?? { canal: 'presencial' as Canal };
    return {
      fila,
      cliente: {
        nombre,
        celular,
        ciudad: titulo(texto(v('ciudad')).split('/')[0]) || undefined,
        canal: c.canal,
        subcanal: c.subcanal,
        estado,
        motivoPerdida: motivo,
        interes: leerServicio(v('servicio')),
        interesDetalle: texto(v('servicio')) || undefined,
        codigoAnterior: texto(v('codigo')) || undefined,
        fechaContacto: hoy(),
      },
      vehiculo,
      interaccion: notas ? { fecha: new Date().toISOString(), tipo: 'nota', comentario: notas } : undefined,
      avisos,
      error: !celular && !vehiculo ? 'Sin celular ni placa' : undefined,
      resumen: [nombre || 'Sin nombre', celular, vehiculo?.placa].filter(Boolean).join(' · '),
    };
  },
};

/* ---------- Seguimiento de llamadas ---------- */

const ESTADOS_LLAMADA: Record<string, EstadoCliente> = {
  nuevo: 'nuevo',
  contactado: 'contactado',
  'en seguimiento': 'seguimiento',
  'informacion enviada': 'contactado',
  'cotizacion enviada': 'cotizacion',
  'cita programada': 'cita',
  instalado: 'atendido',
  perdido: 'perdido',
};

const llamadas: PlantillaTabla = {
  id: 'llamadas',
  nombre: 'Seguimiento de llamadas',
  descripcion: 'Hoja «Seguimiento-Llamadas»: resultado de la llamada, interés, probabilidad y estado.',
  tipo: 'tabla',
  campos: [
    { id: 'telefono', nombre: 'Celular', alias: ['numerodecelular', 'celular', 'telefono'], requerido: true },
    { id: 'nombre', nombre: 'Nombre', alias: ['nombresyapellidos', 'nombre'] },
    { id: 'ciudad', nombre: 'Ciudad', alias: ['ciudad'] },
    { id: 'fecha', nombre: 'Fecha de llamada', alias: ['fechadellamada', 'fecha'] },
    { id: 'tipo', nombre: 'Tipo de contacto', alias: ['tipodecontacto'] },
    { id: 'resultado', nombre: 'Resultado', alias: ['resultadodelallamada', 'resultado'] },
    { id: 'nivel', nombre: 'Interés del cliente', alias: ['interesdelcliente'] },
    { id: 'probabilidad', nombre: 'Probabilidad de venta', alias: ['probabilidaddeventa', 'probabilidad'] },
    { id: 'estado', nombre: 'Estado actual', alias: ['estadoactual', 'estado'] },
    { id: 'motivo', nombre: 'Motivo del interés', alias: ['motivodelinteres', 'interes'] },
    { id: 'cita', nombre: 'Fecha de cita', alias: ['fechadecita'] },
    { id: 'obs', nombre: 'Observaciones', alias: ['observaciones', 'comentarios'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const celular = celularDe(v('telefono'), avisos);
    const nombre = titulo(texto(v('nombre')));
    if (!celular && !nombre) return null;
    const f = leerFecha(v('fecha'));
    const tipo = plano(v('tipo'));
    const canal: Canal = tipo.startsWith('whats') ? 'whatsapp' : tipo.startsWith('presencial') ? 'presencial' : 'llamada';
    const prob = plano(v('probabilidad'));
    const resultado = texto(v('resultado'));
    const obs = texto(v('obs'));
    const fc = leerFecha(v('cita'));
    return {
      fila,
      cliente: {
        nombre,
        celular,
        ciudad: titulo(texto(v('ciudad'))) || undefined,
        canal,
        estado: ESTADOS_LLAMADA[plano(v('estado'))] ?? 'contactado',
        interes: leerServicio(v('motivo')),
        interesDetalle: texto(v('motivo')) || undefined,
        interesNivel: plano(v('nivel')).startsWith('alt') ? 'alto' : plano(v('nivel')).startsWith('med') ? 'medio' : plano(v('nivel')).startsWith('baj') ? 'bajo' : undefined,
        fechaCita: fc.valida ? fc.iso : undefined,
        ultimoContacto: f.valida ? f.iso : undefined,
        probabilidad: prob.startsWith('alt') ? 'alta' : prob.startsWith('med') ? 'media' : prob.startsWith('baj') ? 'baja' : undefined,
        fechaContacto: f.valida ? f.iso : hoy(),
      },
      interaccion: {
        fecha: (f.valida ? f.iso : hoy()) + 'T12:00:00.000Z',
        tipo: canal === 'whatsapp' ? 'whatsapp' : canal === 'presencial' ? 'presencial' : 'llamada',
        resultado: resultado || undefined,
        comentario: (/^llamada:/i.test(obs) ? obs : [resultado && `Llamada: ${resultado}.`, obs].filter(Boolean).join(' ')) || 'Llamada importada',
      },
      avisos,
      error: !celular ? 'Sin celular válido' : undefined,
      resumen: [nombre || 'Sin nombre', celular].filter(Boolean).join(' · '),
    };
  },
};

/* ---------- Seguimiento de cambio de aceite ---------- */

const aceite: PlantillaTabla = {
  id: 'aceite',
  nombre: 'Seguimiento de cambio de aceite',
  descripcion: 'Archivo «SEGUIMIENTO DE CAMBIO ACEITE»: fecha, placa, detalle, km, monto y celular. Los intervalos se recalculan; ESTADO y KM PROX del Excel no se copian.',
  tipo: 'tabla',
  campos: [
    { id: 'fecha', nombre: 'Fecha', alias: ['fecha'], requerido: true },
    { id: 'sede', nombre: 'Sede', alias: ['sede'] },
    { id: 'placa', nombre: 'Placa', alias: ['placavindni', 'placa'], requerido: true },
    { id: 'marca', nombre: 'Marca', alias: ['marca'] },
    { id: 'modelo', nombre: 'Modelo', alias: ['modelo'] },
    { id: 'detalle', nombre: 'Detalle', alias: ['detalle', 'producto'], requerido: true },
    { id: 'kmAnterior', nombre: 'Km del servicio', alias: ['kmanterior'] },
    { id: 'kmActual', nombre: 'Km actual', alias: ['kmactual'] },
    { id: 'monto', nombre: 'Total pagado', alias: ['totalpagado', 'monto', 'total'], requerido: true },
    { id: 'celular', nombre: 'Celular', alias: ['celular', 'telefono'] },
    { id: 'respuesta', nombre: 'Respuesta del cliente', alias: ['respuestacliente', 'respuesta'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const crudo = texto(v('placa'));
    if (!crudo && !texto(v('detalle'))) return null;
    const placa = placaValida(normalizarPlaca(crudo)) ? normalizarPlaca(crudo) : extraerPlaca(crudo) || normalizarPlaca(crudo).slice(0, 6);
    const f = leerFecha(v('fecha'));
    const detalle = titulo(texto(v('detalle'))).replace(/\b(\d+)w(\d+)\b/gi, '$1W$2');
    const monto = numeroDe(v('monto')) ?? 0;
    const km = numeroDe(v('kmActual')) || numeroDe(v('kmAnterior')) || undefined;
    const celular = celularDe(v('celular'), avisos);
    const ma = separarModeloAnio(v('modelo'));
    if (!placaValida(placa)) avisos.push(`Placa «${crudo}» no estándar`);
    return {
      fila,
      vehiculo: placa ? { placa, marca: leerMarca(v('marca')), modelo: ma.modelo, anio: ma.anio } : undefined,
      servicio: {
        fecha: f.iso,
        detalle,
        kmActual: km && km > 0 ? km : undefined,
        intervaloKm: intervaloPorDetalle(detalle),
        kmProximo: km && km > 0 && intervaloPorDetalle(detalle) ? km + intervaloPorDetalle(detalle)! : undefined,
        monto,
        celular: celular || undefined,
        respuesta: titulo(texto(v('respuesta'))) || undefined,
        sede: titulo(texto(v('sede'))) || 'Ica',
      },
      cliente: celular
        ? { nombre: '', celular, canal: 'presencial', estado: 'atendido', interes: 'Cambio de aceite', fechaContacto: f.iso || hoy() }
        : undefined,
      avisos: celular ? avisos : [...avisos, 'Sin celular: no se le podrá recordar el próximo cambio'],
      error: !f.valida ? `Fecha «${texto(v('fecha'))}» no válida` : !placa ? 'Sin placa' : undefined,
      resumen: `${placa} · ${detalle} · S/ ${monto}`,
    };
  },
};

/* ---------- Convenios ---------- */

const convenios: PlantillaTabla = {
  id: 'convenios',
  nombre: 'Convenios de cambio de aceite',
  descripcion: 'Hoja de convenios: cliente, empresa, placa, modelo y filtros de aire y aceite.',
  tipo: 'tabla',
  campos: [
    { id: 'fecha', nombre: 'Fecha', alias: ['fecha'] },
    { id: 'telefono', nombre: 'Teléfono', alias: ['telefono', 'celular'] },
    { id: 'nombre', nombre: 'Nombre', alias: ['nombrecompletocontacto', 'nombrecompleto', 'nombre'] },
    { id: 'empresa', nombre: 'Empresa', alias: ['empresa'], requerido: true },
    { id: 'interes', nombre: 'Interés', alias: ['interes'] },
    { id: 'placa', nombre: 'Placa', alias: ['placa'] },
    { id: 'marca', nombre: 'Marca', alias: ['marca'] },
    { id: 'modelo', nombre: 'Modelo y año', alias: ['modeloyano', 'modelo'] },
    { id: 'aire', nombre: 'Filtro de aire', alias: ['filtrodeaire'] },
    { id: 'aceite', nombre: 'Filtro de aceite', alias: ['filtrodeaceite'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const celular = celularDe(v('telefono'), avisos);
    const nombreCrudo = texto(v('nombre'));
    const nombre = titulo(nombreCrudo.includes(',') ? nombreCrudo.split(',').reverse().join(' ') : nombreCrudo);
    const vehiculo = vehiculoDe(v('placa'), v('marca'), v('modelo'), avisos);
    if (!celular && !vehiculo && !nombre) return null;
    const empresa = titulo(texto(v('empresa')).replace(/^empresa\s+/i, '')) || undefined;
    if (!empresa) avisos.push('Sin empresa: se registra como cliente presencial');
    const f = leerFecha(v('fecha'));
    const aire = texto(v('aire'));
    const aceiteF = texto(v('aceite'));
    return {
      fila,
      empresa,
      cliente: {
        nombre,
        celular,
        canal: empresa ? 'convenio' : 'presencial',
        estado: 'atendido',
        interes: leerServicio(v('interes')),
        interesDetalle: texto(v('interes')) || undefined,
        fechaContacto: f.valida ? f.iso : hoy(),
      },
      vehiculo,
      filtro:
        vehiculo?.marca && vehiculo?.modelo && (aire || aceiteF)
          ? { marca: vehiculo.marca, modelo: vehiculo.modelo, filtroAire: aire || undefined, filtroAceite: aceiteF || undefined }
          : undefined,
      interaccion: { fecha: (f.valida ? f.iso : hoy()) + 'T12:00:00.000Z', tipo: 'presencial', comentario: `Convenio: ${texto(v('interes')) || 'servicio'}` },
      avisos,
      resumen: [nombre || 'Sin nombre', empresa, vehiculo?.placa].filter(Boolean).join(' · '),
    };
  },
};

/* ---------- Refrigerante ---------- */

const refrigerante: PlantillaTabla = {
  id: 'refrigerante',
  nombre: 'Lista de refrigerante',
  descripcion: 'Salidas de refrigerante: cantidad, placa o DNI, fecha y tipo de venta.',
  tipo: 'tabla',
  campos: [
    { id: 'cantidad', nombre: 'Cantidad', alias: ['nroderefrigerante', 'cantidad'], requerido: true },
    { id: 'referencia', nombre: 'Placa o DNI', alias: ['placadni', 'placa'] },
    { id: 'fecha', nombre: 'Fecha', alias: ['fecha'], requerido: true },
    { id: 'venta', nombre: 'Tipo de venta', alias: ['columnae', 'tipodeventa'] },
    { id: 'estado', nombre: 'Anulación', alias: ['columnaf'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const cantidad = numeroDe(v('cantidad'));
    if (!cantidad) return null;
    const f = leerFecha(v('fecha'));
    const ref = texto(v('referencia'));
    const vt = plano(v('venta'));
    const tipoVenta = /externa/.test(vt) ? 'Venta externa' : /directa|v\/?d|^vd$/.test(vt) ? 'Venta directa' : 'Instalación en taller';
    const anulado = /cancel|anul/.test(plano(v('estado'))) || /cancel|anul/.test(vt);
    return {
      fila,
      movimiento: {
        producto: 'Refrigerante',
        cantidad,
        referencia: /^\d{8}$/.test(ref) ? ref : normalizarPlaca(ref) || undefined,
        tipoVenta,
        fecha: f.iso,
      },
      avisos,
      error: anulado ? 'Marcado como cancelado en el Excel' : !f.valida ? 'Fecha no válida' : undefined,
      resumen: `${cantidad} × refrigerante · ${ref || 'sin placa'} · ${tipoVenta}`,
    };
  },
};

/* ---------- Clientes (formato libre) ---------- */

const generico: PlantillaTabla = {
  id: 'generico',
  nombre: 'Clientes (otro formato)',
  descripcion: 'Cualquier lista de clientes. Indica qué columna corresponde a cada dato.',
  tipo: 'tabla',
  campos: [
    { id: 'nombre', nombre: 'Nombre', alias: ['nombre', 'nombres', 'cliente', 'nombresyapellidos'] },
    { id: 'telefono', nombre: 'Celular', alias: ['celular', 'telefono', 'numero', 'movil'], requerido: true },
    { id: 'canal', nombre: 'Canal', alias: ['canal', 'fuente', 'tipodecontacto', 'origen'] },
    { id: 'placa', nombre: 'Placa', alias: ['placa'] },
    { id: 'marca', nombre: 'Marca', alias: ['marca'] },
    { id: 'modelo', nombre: 'Modelo', alias: ['modelo'] },
    { id: 'interes', nombre: 'Servicio de interés', alias: ['interes', 'servicio'] },
    { id: 'fecha', nombre: 'Fecha', alias: ['fecha'] },
    { id: 'comentario', nombre: 'Comentario', alias: ['comentario', 'comentarios', 'notas', 'observaciones'] },
  ],
  construir(v, fila) {
    const avisos: string[] = [];
    const celular = celularDe(v('telefono'), avisos);
    const nombre = titulo(texto(v('nombre')));
    const vehiculo = vehiculoDe(v('placa'), v('marca'), v('modelo'), avisos);
    if (!celular && !nombre && !vehiculo) return null;
    const c = leerCanal(v('canal')) ?? { canal: 'presencial' as Canal };
    const f = leerFecha(v('fecha'));
    const com = texto(v('comentario'));
    const est = inferirEstado(com, 'contactado');
    return {
      fila,
      cliente: { nombre, celular, canal: c.canal, subcanal: c.subcanal, estado: est.estado, motivoPerdida: est.motivo, interes: leerServicio(v('interes')), interesDetalle: texto(v('interes')) || undefined, fechaContacto: f.valida ? f.iso : hoy() },
      vehiculo,
      interaccion: com ? { fecha: (f.valida ? f.iso : hoy()) + 'T12:00:00.000Z', tipo: 'nota', comentario: com } : undefined,
      avisos,
      error: !celular && !vehiculo ? 'Sin celular ni placa' : undefined,
      resumen: [nombre || 'Sin nombre', celular, vehiculo?.placa].filter(Boolean).join(' · '),
    };
  },
};

export const agenda: PlantillaAgenda = {
  id: 'agenda',
  nombre: 'Agenda de citas (calendario)',
  descripcion: 'Hojas por mes del archivo «CITAS AUTOGAS»: lee cada semana, día, área y hora.',
  tipo: 'agenda',
};

export const PLANTILLAS: Plantilla[] = [prospectos, aceite, convenios, baseClientes, llamadas, refrigerante, agenda, generico];

/* ---------- Detección de encabezados y plantilla ---------- */

export function detectarEncabezado(h: Hoja): { fila: number; columnas: Columna[] } {
  let mejor = { fila: 0, puntos: -1 };
  const todos = new Set(PLANTILLAS.flatMap((p) => (p.tipo === 'tabla' ? p.campos.flatMap((c) => c.alias) : [])));
  for (let i = 0; i < Math.min(12, h.filas.length); i++) {
    const fila = h.filas[i] ?? [];
    const llenas = fila.filter((x) => texto(x)).length;
    const coinc = fila.filter((x) => todos.has(claveEncabezado(x))).length;
    const puntos = coinc * 3 + (llenas >= 3 ? 1 : 0);
    if (puntos > mejor.puntos) mejor = { fila: i, puntos };
  }
  const enc = h.filas[mejor.fila] ?? [];
  const ancho = Math.max(enc.length, ...h.filas.slice(mejor.fila, mejor.fila + 30).map((f) => (f ?? []).length));
  const columnas: Columna[] = [];
  for (let i = 0; i < ancho; i++) {
    const n = texto(enc[i] ?? null);
    const tieneDatos = h.filas.slice(mejor.fila + 1).some((f) => texto((f ?? [])[i] ?? null));
    if (n || tieneDatos) columnas.push({ indice: i, nombre: n || `Columna ${letraColumna(i)}` });
  }
  return { fila: mejor.fila, columnas };
}

export function esAgenda(h: Hoja) {
  let horas = 0;
  let areas = 0;
  for (const f of h.filas.slice(0, 40))
    for (const c of f ?? []) {
      const t = plano(c);
      if (t === 'hora') horas++;
      if (t.startsWith('area de') || t.startsWith('area mec')) areas++;
    }
  return horas >= 4 && areas >= 2;
}

export function mapeoAutomatico(p: PlantillaTabla, columnas: Columna[]): Record<string, number | null> {
  const m: Record<string, number | null> = {};
  const usadas = new Set<number>();
  for (const campo of p.campos) {
    let elegida: number | null = null;
    for (const a of campo.alias) {
      const col = columnas.find((c) => !usadas.has(c.indice) && claveEncabezado(c.nombre) === a);
      if (col) {
        elegida = col.indice;
        break;
      }
    }
    if (elegida == null)
      for (const a of campo.alias) {
        const col = columnas.find((c) => !usadas.has(c.indice) && claveEncabezado(c.nombre).includes(a) && a.length >= 4);
        if (col) {
          elegida = col.indice;
          break;
        }
      }
    if (elegida != null) usadas.add(elegida);
    m[campo.id] = elegida;
  }
  return m;
}

export function sugerirPlantilla(h: Hoja): Plantilla {
  if (esAgenda(h)) return agenda;
  const { columnas } = detectarEncabezado(h);
  let mejor: { p: Plantilla; puntos: number } = { p: generico, puntos: 0 };
  for (const p of PLANTILLAS) {
    if (p.tipo !== 'tabla' || p.id === 'generico') continue;
    const m = mapeoAutomatico(p, columnas);
    const req = p.campos.filter((c) => c.requerido).every((c) => m[c.id] != null);
    // Puntaje: campos encontrados por coincidencia exacta del encabezado
    const exactos = p.campos.filter((c) => columnas.some((col) => c.alias.includes(claveEncabezado(col.nombre)))).length;
    const puntos = (req ? 10 : 0) + exactos * 2 + Object.values(m).filter((x) => x != null).length;
    if (puntos > mejor.puntos) mejor = { p, puntos };
  }
  return mejor.puntos >= 16 ? mejor.p : generico;
}

export function construirTabla(h: Hoja, p: PlantillaTabla, mapeo: Record<string, number | null>, filaEnc: number): Propuesta[] {
  const out: Propuesta[] = [];
  for (let i = filaEnc + 1; i < h.filas.length; i++) {
    const fila = h.filas[i] ?? [];
    if (!fila.some((x) => texto(x))) continue;
    const v = (campo: string) => {
      const idx = mapeo[campo];
      return idx == null ? null : (fila[idx] ?? null);
    };
    const r = p.construir(v, i + 1);
    if (r) out.push(r);
  }
  return out;
}

/* ---------- Agenda en formato calendario ---------- */

const DIA = /(LUNES|MARTES|MI[EÉ]RCOLES|JUEVES|VIERNES|S[AÁ]BADO)\s+(\d{1,2})\s*\/\s*(\d{1,2})/i;

function asesorCanonico(t: string, mapa: Map<string, string>) {
  const limpio = titulo(t.replace(/[\d:.]+\s*(am|pm)?/gi, '').replace(/\s+y\s+.*/i, '').trim()).split(' ')[0];
  if (!limpio) return '';
  const k = plano(limpio).slice(0, 4);
  if (!mapa.has(k)) mapa.set(k, limpio.length > 6 && k === 'jeff' ? 'Jeffer' : limpio);
  return mapa.get(k)!;
}

export function construirAgenda(hojas: Hoja[], anio: number): Propuesta[] {
  const out: Propuesta[] = [];
  const asesores = new Map<string, string>();
  const hoyIso = hoy();
  for (const h of hojas) {
    const g = h.filas;
    for (let ri = 0; ri < g.length; ri++) {
      const fila = g[ri] ?? [];
      const hcols = fila.map((v, ci) => (plano(v) === 'hora' ? ci : -1)).filter((x) => x >= 0);
      if (hcols.length < 2) continue;
      let dias: { ci: number; fecha: string | null; etiqueta: string }[] = [];
      for (let up = 1; up <= 4 && !dias.length; up++) {
        (g[ri - up] ?? []).forEach((v, ci) => {
          const m = texto(v).match(DIA);
          if (m) {
            const fecha = `${anio}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
            dias.push({ ci, fecha, etiqueta: texto(v) });
          }
        });
      }
      dias = dias.sort((a, b) => a.ci - b.ci);
      for (const c of hcols) {
        const dl = dias.filter((d) => d.ci <= c);
        const dia = dl[dl.length - 1];
        if (!dia) continue;
        const previas = hcols.filter((x) => x >= dia.ci && x < c);
        const area: Area = previas.length === 0 ? 'mecanica' : 'gas';
        let hora: string | null = null;
        for (let r2 = ri + 1; r2 < Math.min(ri + 24, g.length); r2++) {
          const rr = g[r2] ?? [];
          if (plano(rr[c]) === 'hora') break;
          const hh = horaAgenda(rr[c] ?? null);
          if (hh) hora = hh;
          const pl = texto(rr[c + 1] ?? null);
          const sv = texto(rr[c + 2] ?? null);
          const ag = texto(rr[c + 3] ?? null);
          const svLimpio = sv === '0' || sv === '0.0' ? '' : sv;
          if (!pl && !svLimpio && !ag) continue;
          if (!hora || !dia.fecha) continue;
          const avisos: string[] = [];
          let horaFila = hora;
          const horaEnPlaca = pl.match(/\d{1,2}[:.]\d{2}|\d(am|pm)/i);
          let placa = extraerPlaca(pl) || extraerPlaca(svLimpio);
          if (pl && horaEnPlaca && placa) avisos.push(`La celda de placa incluía una hora («${pl}»)`);
          const textoServicio = svLimpio.replace(placa, '').trim();
          const esBloqueo = /no\s*agend/i.test(svLimpio) || (!placa && /^[a-záéíóúñ\s]+$/i.test(pl) && pl.length > 2);
          if (esBloqueo) {
            out.push({
              fila: r2 + 1,
              bloqueo: { fecha: dia.fecha, hora: horaFila, area, motivo: svLimpio || `Ocupado: ${titulo(pl)}` },
              avisos: [],
              resumen: `${h.nombre} · ${dia.etiqueta} ${horaFila} · bloqueo «${svLimpio || pl}»`,
            });
            continue;
          }
          if (!placa) avisos.push(pl ? `Placa «${pl}» no reconocida` : 'Sin placa');
          const servicio = leerServicio(textoServicio || svLimpio) || 'Sin detalle';
          const agendadoPor = asesorCanonico(ag, asesores) || 'Sin registro';
          out.push({
            fila: r2 + 1,
            vehiculo: placa ? { placa } : undefined,
            cita: {
              fecha: dia.fecha,
              hora: horaFila,
              area,
              servicio,
              agendadoPor,
              notas: [textoServicio && servicio !== titulo(textoServicio) ? textoServicio : '', /\d{1,2}[:.]\d{2}/.test(ag) ? `Hora indicada: ${ag}` : ''].filter(Boolean).join(' · ') || undefined,
              estado: dia.fecha < hoyIso ? 'asistio' : 'agendada',
            },
            avisos,
            error: !placa ? 'Sin placa válida' : undefined,
            resumen: `${h.nombre} · ${dia.etiqueta} ${horaFila} · ${area === 'gas' ? 'Gas' : 'Mecánica'} · ${placa || pl || '—'} · ${servicio}`,
          });
        }
      }
    }
  }
  unificarAsesores(out);
  return out;
}

/** Une variantes de un mismo nombre («Xiemna», «Ixmena» → «Ximena»; «Cro» → «Caro»). */
function unificarAsesores(out: Propuesta[]) {
  const cuenta = new Map<string, number>();
  for (const p of out) if (p.cita) cuenta.set(p.cita.agendadoPor, (cuenta.get(p.cita.agendadoPor) ?? 0) + 1);
  const principales = [...cuenta.entries()].filter(([n, c]) => c >= 5 && n !== 'Sin registro').map(([n]) => n);
  for (const p of out) {
    if (!p.cita) continue;
    const n = p.cita.agendadoPor;
    if (!/[a-záéíóúñ]{2,}/i.test(n)) {
      p.cita.agendadoPor = 'Sin registro';
      continue;
    }
    if (principales.includes(n)) continue;
    const parecido = principales
      .map((x) => ({ x, s: similitud(x, n) }))
      .filter((y) => y.s >= 0.6)
      .sort((a, b) => b.s - a.s)[0];
    if (parecido) p.cita.agendadoPor = parecido.x;
  }
}

export const nombrePlantilla = (id: string) => PLANTILLAS.find((p) => p.id === id)?.nombre ?? id;

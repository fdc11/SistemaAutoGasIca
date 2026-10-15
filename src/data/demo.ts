import { format, subDays, addDays, startOfWeek } from 'date-fns';
import { backend } from './backend';
import { LISTAS_INICIALES, DIAS_ENTRE_CAMBIOS, HORAS_SEMANA } from '../lib/catalogos';
import type { CategoriaProducto, Canal, EstadoCliente } from '../lib/types';
import { uid } from '../lib/utils';

const f = (d: Date) => format(d, 'yyyy-MM-dd');

/** Catálogo real del taller: equipos del Excel de stock, aceites, convenios y filtros. */
export async function sembrarCatalogo(autor: string) {
  const ahora = new Date().toISOString();
  const m = { creadoEn: ahora, creadoPor: autor };

  const P = (categoria: CategoriaProducto, nombre: string, variante: string, stock: number, extra: any = {}) => ({
    id: uid(),
    ...m,
    categoria,
    nombre,
    variante,
    stockMinimo: extra.stockMinimo ?? (stock > 0 ? 1 : 0),
    ...extra,
    _stock: stock,
  });

  const productos = [
    P('aceite', 'Liqui Moly Molygen', '5W30 · 4 L', 0, { intervaloKm: 8000, precio: 269, stockMinimo: 0 }),
    P('aceite', 'Liqui Moly Molygen', '5W40 · 4 L', 0, { intervaloKm: 8000, precio: 289, stockMinimo: 0 }),
    P('aceite', 'Castrol', '5W30 · 4 L', 0, { intervaloKm: 6000, precio: 210, stockMinimo: 0 }),
    P('aceite', 'Castrol', '10W30 · 4 L', 0, { intervaloKm: 6000, precio: 210, stockMinimo: 0 }),
    P('aceite', 'Shell', '4 L', 0, { intervaloKm: 6000, precio: 210, stockMinimo: 0 }),
    P('aceite', 'Vistony', '4 L', 0, { intervaloKm: 6000, precio: 190, stockMinimo: 0 }),
    P('aceite', 'Mobil', '4 L', 0, { intervaloKm: 6000, precio: 230, stockMinimo: 0 }),
    P('tanque_gnv', 'Tanque GNV amarillo', 'Baby tanque · con pico', 4),
    P('tanque_gnv', 'Tanque GNV amarillo', '2 GL · sin pico', 1),
    P('tanque_gnv', 'Tanque GNV amarillo', '3 GL', 0),
    P('tanque_gnv', 'Tanque GNV amarillo', '4 GL · con pico', 1),
    P('tanque_gnv', 'Tanque GNV negro', 'Baby tanque', 0),
    P('tanque_gnv', 'Tanque GNV negro', '4 GL', 0),
    P('tanque_glp', 'Tanque GLP toroidal', '7 GL', 0),
    P('tanque_glp', 'Tanque GLP toroidal', '9 GL · boca interna', 7),
    P('tanque_glp', 'Tanque GLP toroidal', '10 GL · boca externa', 2),
    P('tanque_glp', 'Tanque GLP toroidal', '11 GL · boca interna', 3),
    P('tanque_glp', 'Tanque GLP toroidal', '11 GL · boca externa', 2),
    P('tanque_glp', 'Tanque GLP toroidal', '12 GL · boca interna', 5),
    P('tanque_glp', 'Tanque GLP toroidal', '12 GL · boca externa', 2),
    P('tanque_glp', 'Tanque GLP toroidal', '13 GL · boca interna', 1),
    P('tanque_glp', 'Tanque GLP toroidal', '15 GL · boca externa', 1),
    P('tanque_glp', 'Tanque GLP cilíndrico', '7 GL', 1),
    P('tanque_glp', 'Tanque GLP cilíndrico', '10 GL', 1),
    P('tanque_glp', 'Tanque GLP lenteja', '5 GL', 0),
    P('electronica', 'Jet OBD', '4 inyectores', 25, { stockMinimo: 5 }),
    P('electronica', 'Jet OBD', '6 inyectores', 1),
    P('electronica', 'Jet OBD', '8 inyectores', 0),
    P('electronica', 'Expert', '4 inyectores', 0),
    P('electronica', 'Expert', '8 inyectores', 1),
    P('electronica', 'Max', '4 inyectores', 2),
    P('electronica', 'Direct', '4 inyectores', 2),
    P('electronica', 'Jet Eco', '4 inyectores', 1),
    P('electronica', 'Digitronic', '4 inyectores', 0),
    P('electronica', 'Jet Dual', '4 inyectores', 0),
    P('gasificador', 'Tomasetto AT09', '', 16, { stockMinimo: 4 }),
    P('gasificador', 'KME Tur 6Z', '', 31, { stockMinimo: 4 }),
    P('gasificador', 'KME Extreme', '', 1),
    P('gasificador', 'KME Twin', '', 0),
    P('gasificador', 'KME Mustang 6', '', 0),
    P('gasificador', 'KME Mustang 8S', '', 4),
    P('gasificador', 'Tomasetto carburado', '', 2),
    P('inyector', 'Riel Apache', '', 1),
    P('inyector', 'Riel Basic Plus', '', 0),
    P('inyector', 'Hawk individual', '', 17, { stockMinimo: 4 }),
    P('inyector', 'Fenix individual', '', 45, { stockMinimo: 4 }),
    P('inyector', 'Riel Hawk', '', 36, { stockMinimo: 4 }),
    P('inyector', 'Tri riel Hawk', '', 10),
    P('inyector', 'Bi riel Hawk', '', 12),
    P('reductor', 'Tomasetto AT20', '', 4),
    P('reductor', 'Tomasetto tercera', '', 1),
    P('reductor', 'Tomasetto AT12', '', 8),
    P('refrigerante', 'Refrigerante', 'Galón', 0, { stockMinimo: 3 }),
  ];

  const movimientos = productos
    .filter((p) => p._stock > 0)
    .map((p) => ({
      id: uid(),
      ...m,
      productoId: p.id,
      tipo: 'entrada',
      cantidad: p._stock,
      fecha: f(new Date()),
      nota: 'Stock inicial (Excel STOCK EQUIPOS)',
    }));

  const empresas = ['Elite Tours S.A.C.', 'Nazca Land Tours', 'Ica Tours', 'Médano'].map((nombre) => ({
    id: uid(),
    ...m,
    nombre,
    activa: true,
  }));

  const F = (marca: string, modelo: string, filtroAire: string, filtroAceite: string) => ({
    id: uid(),
    ...m,
    marca,
    modelo,
    filtroAire,
    filtroAceite,
  });
  const filtros = [
    F('Volkswagen', 'Jetta', '1K0-129-620-C', '0986AF1042'),
    F('Changan', 'X7 Plus', 'PT01', 'ML49675'),
    F('Hyundai', 'Accent', '28113-C7000', '26300-02752'),
    F('Chevrolet', 'Onix Joy', '94757663', 'ML3387'),
    F('Kia', 'Cerato 2015-2019', '28113-F2000', '26300-02752'),
    F('Kia', 'Cerato', '28113-3X000', '26300-02752'),
    F('Hyundai', 'Elantra', '28113-3X000', '26300-02752'),
  ];

  await backend.setMany('productos', productos.map(({ _stock, ...p }) => p) as any);
  await backend.setMany('movimientos', movimientos as any);
  await backend.setMany('empresas', empresas as any);
  await backend.setMany('filtros', filtros as any);
  await backend.set('ajustes', 'listas', {
    id: 'listas',
    ...m,
    ...LISTAS_INICIALES,
    tecnicos: ['Jeffer', 'Daniel', 'Alex'],
  } as any);
  return { productos, empresas };
}

/** Datos de ejemplo (ficticios) para recorrer el sistema en modo demostración. */
export async function sembrarDemo(autor: string) {
  const { productos, empresas } = await sembrarCatalogo(autor);
  const hoy = new Date();
  const asesores = ['Ximena', 'Renzo', 'Diego', 'Hilary', 'Daniel', 'Caro'];
  const nombres = [
    'Carlos Huamán', 'Luisa Robles', 'Pablo Martínez', 'Jorge Aragón', 'Roger Ávalos', 'Juan Espino',
    'Cristian Rangel', 'Rafael Mesones', 'David Panaqué', 'Fabián Torres', 'Nelson Mejía', 'Joaquín Cornejo',
    'Emilio Salas', 'Fernando Quispe', 'Armando Vega', 'Gregorio Pachas', 'Lucía Ramos', 'Wilder Cáceres',
    'Óscar Bendezú', 'Walter Uchuya', 'Renzo Lévano', 'Víctor Hernández', 'Antonio Sosa', 'Kevin Medina',
  ];
  const autos: [string, string][] = [
    ['Kia', 'Picanto'], ['Toyota', 'Yaris'], ['Hyundai', 'Grand i10'], ['Chevrolet', 'Sail'], ['Kia', 'Soluto'],
    ['Nissan', 'Versa'], ['Hyundai', 'Accent'], ['Changan', 'X7 Plus'], ['Kia', 'Rio'], ['Toyota', 'Corolla'],
    ['Daewoo', 'Tico'], ['Chevrolet', 'Spark'], ['Kia', 'Cerato'], ['JAC', 'JS2'],
  ];
  const canales: Canal[] = ['publicidad', 'publicidad', 'whatsapp', 'whatsapp', 'presencial', 'llamada', 'convenio', 'referido'];
  const estados: EstadoCliente[] = ['nuevo', 'contactado', 'seguimiento', 'cotizacion', 'cita', 'atendido', 'atendido', 'perdido'];
  const intereses = ['Conversión GNV', 'Conversión GLP', 'Cambio de aceite', 'Mantenimiento de gas', 'Mantenimiento mayor'];
  const letras = 'ABCDFVY';
  const m = (dias: number, quien: string) => ({ creadoEn: subDays(hoy, dias).toISOString(), creadoPor: quien });

  const clientes: any[] = [];
  const vehiculos: any[] = [];
  const interacciones: any[] = [];
  nombres.forEach((nombre, i) => {
    const dias = (i * 5) % 40;
    const quien = asesores[i % asesores.length];
    const canal = canales[i % canales.length];
    const estado = estados[(i * 3) % estados.length];
    const id = uid();
    const celular = '9' + String(10000000 + ((i * 7919301) % 89999999)).padStart(8, '0');
    clientes.push({
      id,
      ...m(dias, quien),
      nombre,
      celular,
      ciudad: ['Ica', 'Ica', 'Pisco', 'Chincha', 'Nazca'][i % 5],
      canal,
      subcanal: canal === 'publicidad' ? ['Facebook Ads', 'Instagram', 'TikTok Ads'][i % 3] : undefined,
      empresaId: canal === 'convenio' ? empresas[i % empresas.length].id : undefined,
      estado,
      interes: intereses[i % intereses.length],
      motivoPerdida: estado === 'perdido' ? 'Precio' : undefined,
      fechaContacto: f(subDays(hoy, dias)),
      proximoContacto: ['seguimiento', 'cotizacion', 'contactado'].includes(estado) ? f(subDays(hoy, i % 3)) : undefined,
    });
    const [marca, modelo] = autos[i % autos.length];
    const placa = letras[i % letras.length] + String.fromCharCode(65 + (i % 26)) + String((i * 37) % 10) + String(100 + ((i * 53) % 900));
    vehiculos.push({ id: uid(), ...m(dias, quien), placa, marca, modelo, anio: String(2012 + (i % 13)), clienteId: id });
    interacciones.push({
      id: uid(),
      ...m(dias, quien),
      clienteId: id,
      fecha: subDays(hoy, dias).toISOString(),
      tipo: canal === 'llamada' ? 'llamada' : canal === 'presencial' ? 'presencial' : 'whatsapp',
      comentario: ['Consulta por precio de conversión', 'Pidió cotización', 'Interesado, llamar la próxima semana', 'Agendó cita', 'Vino al taller'][i % 5],
    });
  });

  // Servicios de aceite de los últimos 7 meses: vehículos con 1 a 4 visitas, como en el taller real
  const aceites = productos.filter((p) => p.categoria === 'aceite');
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) - 1) / 2147483646;
  const extra: any[] = [];
  for (let i = 0; i < 90; i++) {
    const [marca, modelo] = autos[(i * 5) % autos.length];
    const placa = 'ABCDFVY'[i % 7] + String.fromCharCode(65 + ((i * 7) % 26)) + String(i % 10) + String(100 + ((i * 97) % 900));
    extra.push({ id: uid(), ...m(200, 'Ximena'), placa, marca, modelo, _cel: azar() < 0.8 ? '9' + String(Math.floor(azar() * 1e8)).padStart(8, '0') : undefined });
  }
  vehiculos.push(...extra.map(({ _cel, ...v }) => v));
  const servicios: any[] = [];
  const todos = [...vehiculos.slice(0, nombres.length).map((v) => ({ ...v, _cel: clientes.find((c) => c.id === v.clienteId)?.celular })), ...extra];
  todos.forEach((v, i) => {
    const visitas = 1 + Math.floor(azar() * azar() * 4.5);
    let d = 20 + Math.floor(azar() * 190);
    const prod = aceites[azar() < 0.65 ? 0 : 2];
    let km = 30000 + Math.floor(azar() * 120000);
    for (let k = 0; k < visitas && d >= 1; k++) {
      servicios.push({
        id: uid(),
        ...m(d, asesores[(i + k) % asesores.length]),
        fecha: f(subDays(hoy, d)),
        placa: v.placa,
        vehiculoId: v.id,
        clienteId: v.clienteId,
        productoId: prod.id,
        detalle: `Super promo ${prod.nombre} ${prod.variante}`,
        kmActual: km,
        intervaloKm: prod.intervaloKm,
        kmProximo: km + (prod.intervaloKm ?? 6000),
        monto: prod.precio,
        celular: v._cel,
        sede: 'Ica',
      });
      km += 5000 + Math.floor(azar() * 3000);
      d -= 45 + Math.floor(azar() * 45);
    }
  });

  // Citas de la semana actual
  const lunes = startOfWeek(hoy, { weekStartsOn: 1 });
  const citas: any[] = [];
  const servs = ['Mantenimiento de gas', 'Regulación de gas', 'Control 1,000 km', 'Diagnóstico', 'Cambio de aceite', 'Conversión GLP'];
  for (let dia = 0; dia < 6; dia++) {
    for (let h = 0; h < HORAS_SEMANA.length; h += 2) {
      const v = vehiculos[(dia * 5 + h) % vehiculos.length];
      const fecha = f(addDays(lunes, dia));
      const area = (dia + h) % 4 === 0 ? 'mecanica' : 'gas';
      citas.push({
        id: uid(),
        ...m(3, asesores[(dia + h) % asesores.length]),
        fecha,
        hora: HORAS_SEMANA[h],
        area,
        placa: v.placa,
        clienteId: v.clienteId,
        servicio: servs[(dia + h) % servs.length],
        estado: fecha < f(hoy) ? 'asistio' : 'agendada',
        agendadoPor: asesores[(dia + h) % asesores.length],
      });
    }
  }

  await backend.setMany('clientes', clientes);
  await backend.setMany('vehiculos', vehiculos);
  await backend.setMany('interacciones', interacciones);
  await backend.setMany('serviciosAceite', servicios);
  await backend.setMany('citas', citas);
}

export { DIAS_ENTRE_CAMBIOS };

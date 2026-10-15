// Exportaciones con las mismas columnas de los Excel originales del taller.
// Los encabezados coinciden con los que reconoce el importador: un archivo exportado se puede volver a importar.
import { parseISO, isValid } from 'date-fns';
import type { Colecciones, NombreColeccion } from './types';
import { ESTADOS_CITA, MESES, estadoInfo, nombreArea, nombreCanal, nombreCategoria, CATEGORIAS } from './catalogos';
import { fichasAceite } from './analisis';

type Datos = { [K in NombreColeccion]: Colecciones[K][] };
export type Fila = Record<string, string | number | Date | null>;
export interface Rango {
  desde?: string;
  hasta?: string;
}

const act = <T extends { eliminado?: boolean }>(xs: T[]) => xs.filter((x) => !x.eliminado);
const enRango = (iso: string | undefined, r: Rango) => !!iso && (!r.desde || iso.slice(0, 10) >= r.desde) && (!r.hasta || iso.slice(0, 10) <= r.hasta);
const fecha = (iso?: string): Date | null => {
  if (!iso) return null;
  const d = parseISO(iso.slice(0, 10));
  return isValid(d) ? d : null;
};
const ddmmaaaa = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const hora = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
};
const tipoContacto = (c: { canal: string; subcanal?: string }) => (c.canal === 'publicidad' && c.subcanal ? c.subcanal : nombreCanal(c.canal));

function indices(d: Datos) {
  const vehiculos = new Map<string, Colecciones['vehiculos'][]>();
  for (const v of act(d.vehiculos)) if (v.clienteId) vehiculos.set(v.clienteId, [...(vehiculos.get(v.clienteId) ?? []), v]);
  const inter = new Map<string, Colecciones['interacciones'][]>();
  for (const i of act(d.interacciones)) inter.set(i.clienteId, [...(inter.get(i.clienteId) ?? []), i]);
  for (const l of inter.values()) l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const empresas = new Map(act(d.empresas).map((e) => [e.id, e.nombre]));
  return { vehiculos, inter, empresas };
}

export interface Formato {
  id: string;
  nombre: string;
  hoja: string;
  descripcion: string;
  filtraFecha: boolean;
  construir: (d: Datos, r: Rango) => Fila[];
}

export const FORMATOS: Formato[] = [
  {
    id: 'prospectos',
    nombre: 'Tabla de prospectos',
    hoja: 'TABLA DE PROSPECTOS',
    descripcion: 'Todos los clientes con canal, interés, placa, último contacto y comentario. Igual a «TABLA DE PROSPECTOS».',
    filtraFecha: true,
    construir(d, r) {
      const { vehiculos, inter } = indices(d);
      return act(d.clientes)
        .filter((c) => enRango(c.fechaContacto, r))
        .sort((a, b) => b.fechaContacto.localeCompare(a.fechaContacto))
        .map((c) => {
          const v = vehiculos.get(c.id)?.[0];
          const hist = inter.get(c.id) ?? [];
          const ult = hist[hist.length - 1];
          return {
            'FECHA DE CONTACTO': fecha(c.fechaContacto),
            TELEFONO: c.celular || '',
            'NOMBRE COMPLETO/CONTACTO': c.nombre,
            'TIPO DE CONTACTO': tipoContacto(c),
            INTERES: c.interesDetalle || c.interes || '',
            PLACA: v?.placa ?? '',
            MARCA: v?.marca ?? '',
            'MODELO Y AÑO': [v?.modelo, v?.anio].filter(Boolean).join(' '),
            'FECHA DE CITA': c.fechaCita && /^\d{4}-/.test(c.fechaCita) ? fecha(c.fechaCita) : c.fechaCita ?? '',
            'ULTIMO CONTACTO': fecha(ult?.fecha ?? c.ultimoContacto),
            COMENTARIOS: ult?.comentario ?? '',
            ESTADO: estadoInfo(c.estado).nombre,
            'MOTIVO DE PERDIDA': c.motivoPerdida ?? '',
            CIUDAD: c.ciudad ?? '',
            'REGISTRADO POR': c.creadoPor,
          };
        });
    },
  },
  {
    id: 'baseClientes',
    nombre: 'Base de clientes',
    hoja: 'BaseClientes',
    descripcion: 'Una fila por cliente con fuente, servicio consultado, estado y vehículo. Igual a «BaseClientes».',
    filtraFecha: true,
    construir(d, r) {
      const { vehiculos, inter } = indices(d);
      return act(d.clientes)
        .filter((c) => enRango(c.fechaContacto, r))
        .sort((a, b) => a.fechaContacto.localeCompare(b.fechaContacto))
        .map((c, i) => {
          const v = vehiculos.get(c.id)?.[0];
          const hist = inter.get(c.id) ?? [];
          return {
            'Número de Celular': c.celular || '',
            'ID Cliente': c.codigoAnterior || i + 1,
            'Nombres y Apellidos': c.nombre,
            Ciudad: c.ciudad ?? '',
            'Fuente de Campaña': tipoContacto(c),
            'Tipo de Servicio Consultado': c.interesDetalle || c.interes || '',
            'Estado del Cliente': estadoInfo(c.estado).nombre,
            Placa: v?.placa ?? '',
            'Marca del Vehículo': v?.marca ?? '',
            'Modelo/Año': [v?.modelo, v?.anio].filter(Boolean).join(' '),
            Notas: hist[hist.length - 1]?.comentario ?? '',
          };
        });
    },
  },
  {
    id: 'llamadas',
    nombre: 'Seguimiento de llamadas',
    hoja: 'Seguimiento-Llamadas',
    descripcion: 'Una fila por cada llamada registrada, con resultado, interés, probabilidad y estado. Igual a «Seguimiento-Llamadas».',
    filtraFecha: true,
    construir(d, r) {
      const clientes = new Map(act(d.clientes).map((c) => [c.id, c]));
      return act(d.interacciones)
        .filter((i) => i.tipo === 'llamada' && enRango(i.fecha, r))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((i) => {
          const c = clientes.get(i.clienteId);
          return {
            'Número de Celular': c?.celular ?? '',
            'Nombres y Apellidos': c?.nombre ?? '',
            Ciudad: c?.ciudad ?? '',
            'Fecha de Llamada': fecha(i.fecha),
            'Tipo de Contacto': 'Llamada',
            'Resultado de la Llamada': i.resultado ?? '',
            'Interés del Cliente': c?.interesNivel ? c.interesNivel[0].toUpperCase() + c.interesNivel.slice(1) : '',
            'Probabilidad de Venta': c?.probabilidad ? c.probabilidad[0].toUpperCase() + c.probabilidad.slice(1) : '',
            'Estado Actual': c ? estadoInfo(c.estado).nombre : '',
            'Motivo del Interés': c?.interesDetalle || c?.interes || '',
            'Fecha de Cita': c?.fechaCita && /^\d{4}-/.test(c.fechaCita) ? fecha(c.fechaCita) : c?.fechaCita ?? '',
            Observaciones: i.comentario,
          };
        });
    },
  },
  {
    id: 'aceite',
    nombre: 'Seguimiento de cambio de aceite',
    hoja: 'Hoja1',
    descripcion: 'Todos los servicios con km, monto, celular y respuesta. ESTADO y KM PROX salen calculados correctamente. Igual a «SEGUIMIENTO DE CAMBIO ACEITE».',
    filtraFecha: true,
    construir(d, r) {
      const veh = new Map(act(d.vehiculos).map((v) => [v.placa, v]));
      const estado = new Map(
        fichasAceite(act(d.serviciosAceite)).map((f) => [
          f.ultimo.id,
          f.estado === 'vencido' ? 'YA LE TOCA' : f.estado === 'semana' || f.estado === 'proximo' ? 'PRÓXIMO' : 'AÚN NO',
        ]),
      );
      return act(d.serviciosAceite)
        .filter((s) => enRango(s.fecha, r))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((s, i) => {
          const v = veh.get(s.placa);
          return {
            'N°': i + 1,
            AÑO: Number(s.fecha.slice(0, 4)),
            MES: MESES[Number(s.fecha.slice(5, 7)) - 1] ?? '',
            FECHA: ddmmaaaa(s.fecha),
            SEDE: (s.sede ?? 'Ica').toUpperCase(),
            'PLACA (VIN/DNI)': s.placa,
            MARCA: (v?.marca ?? '').toUpperCase(),
            MODELO: (v?.modelo ?? '').toUpperCase(),
            DETALLE: s.detalle.toUpperCase(),
            'KM ANTERIOR': s.kmActual ?? null,
            'KM ACTUAL': null,
            'KM PROX': s.kmProximo ?? (s.kmActual && s.intervaloKm ? s.kmActual + s.intervaloKm : null),
            'KM POR TIPO': s.intervaloKm ?? null,
            'TOTAL PAGADO': Number(s.monto) || 0,
            ESTADO: estado.get(s.id) ?? 'YA REGRESÓ',
            CELULAR: s.celular ?? '',
            'RESPUESTA CLIENTE': s.respuesta ?? '',
          };
        });
    },
  },
  {
    id: 'convenios',
    nombre: 'Convenios de cambio de aceite',
    hoja: 'CONVENIOS',
    descripcion: 'Clientes de empresas con convenio, con su vehículo y los filtros del modelo. Igual a la pestaña de convenios.',
    filtraFecha: true,
    construir(d, r) {
      const { vehiculos, empresas } = indices(d);
      const filtros = act(d.filtros);
      return act(d.clientes)
        .filter((c) => (c.canal === 'convenio' || c.empresaId) && enRango(c.fechaContacto, r))
        .sort((a, b) => a.fechaContacto.localeCompare(b.fechaContacto))
        .flatMap((c) => {
          const vs = vehiculos.get(c.id) ?? [undefined];
          return vs.map((v) => {
            const f = v ? filtros.find((x) => x.marca.toLowerCase() === (v.marca ?? '').toLowerCase() && (v.modelo ?? '').toLowerCase().includes(x.modelo.toLowerCase().split(' ')[0])) : undefined;
            return {
              FECHA: fecha(c.fechaContacto),
              TELEFONO: c.celular || '',
              'NOMBRE COMPLETO/CONTACTO': c.nombre,
              EMPRESA: empresas.get(c.empresaId ?? '') ?? '',
              INTERES: c.interesDetalle || c.interes || '',
              PLACA: v?.placa ?? '',
              MARCA: v?.marca ?? '',
              'MODELO Y AÑO': [v?.modelo, v?.anio].filter(Boolean).join(' '),
              'FILTRO DE AIRE': f?.filtroAire ?? '',
              'FILTRO DE ACEITE': f?.filtroAceite ?? '',
            };
          });
        });
    },
  },
  {
    id: 'citas',
    nombre: 'Agenda de citas',
    hoja: 'CITAS',
    descripcion: 'Una fila por cita: día, hora, área, placa, servicio y quién agendó. Formato de lista, no de calendario.',
    filtraFecha: true,
    construir(d, r) {
      const clientes = new Map(act(d.clientes).map((c) => [c.id, c]));
      const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
      return act(d.citas)
        .filter((c) => enRango(c.fecha, r))
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
        .map((c) => {
          const cl = c.clienteId ? clientes.get(c.clienteId) : undefined;
          return {
            FECHA: fecha(c.fecha),
            DIA: dias[parseISO(c.fecha).getDay()],
            HORA: c.hora,
            AREA: nombreArea(c.area).toUpperCase(),
            PLACA: c.placa,
            SERVICIO: c.servicio,
            'AGENDADO POR': c.agendadoPor,
            ESTADO: ESTADOS_CITA.find((x) => x.id === c.estado)?.nombre ?? '',
            CLIENTE: cl?.nombre ?? '',
            CELULAR: cl?.celular ?? '',
            NOTAS: c.notas ?? '',
          };
        });
    },
  },
  {
    id: 'taller',
    nombre: 'Control de servicios (patio)',
    hoja: 'CONTROL DE SERVICIOS',
    descripcion: 'Ingresos y salidas del taller con técnico y área. Igual a «CONTROL PATIO».',
    filtraFecha: true,
    construir(d, r) {
      return act(d.ingresos)
        .filter((i) => enRango(i.horaIngreso, r))
        .sort((a, b) => a.horaIngreso.localeCompare(b.horaIngreso))
        .map((i) => ({
          FECHA: fecha(i.horaIngreso),
          'HORA DE INGRESO': hora(i.horaIngreso),
          PLACA: i.placa,
          'MARCA Y MODELO': i.marcaModelo ?? '',
          SERVICIO: i.servicio,
          'UBICACION (MECANICA/GAS)': i.area === 'gas' ? 'GAS' : 'MECANICA',
          'TEC. A CARGO': i.tecnico ?? '',
          'HORA DE SALIDA': hora(i.horaSalida),
        }));
    },
  },
  {
    id: 'refrigerante',
    nombre: 'Lista de refrigerante',
    hoja: 'Hoja1',
    descripcion: 'Salidas de refrigerante con placa o DNI y tipo de venta. Igual a «LISTA DE REFRIGERANTE».',
    filtraFecha: true,
    construir(d, r) {
      const refri = new Set(act(d.productos).filter((p) => p.categoria === 'refrigerante').map((p) => p.id));
      return act(d.movimientos)
        .filter((m) => refri.has(m.productoId) && m.tipo === 'salida' && enRango(m.fecha, r))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((m) => ({
          'NRO DE REFRIGERANTE': m.cantidad,
          'PLACA/DNI': m.referencia ?? '',
          FECHA: fecha(m.fecha),
          'TIPO DE VENTA': m.tipoVenta ?? '',
        }));
    },
  },
  {
    id: 'stock',
    nombre: 'Stock de equipos',
    hoja: 'STOCK EQUIPOS',
    descripcion: 'Stock actual de cada equipo calculado con entradas y salidas, con su mínimo.',
    filtraFecha: false,
    construir(d) {
      const stock = new Map<string, number>();
      for (const m of act(d.movimientos)) stock.set(m.productoId, (stock.get(m.productoId) ?? 0) + (m.tipo === 'entrada' ? 1 : -1) * Number(m.cantidad || 0));
      const orden = (c: string) => CATEGORIAS.findIndex((x) => x.id === c);
      return act(d.productos)
        .filter((p) => p.categoria !== 'aceite')
        .sort((a, b) => orden(a.categoria) - orden(b.categoria) || a.nombre.localeCompare(b.nombre))
        .map((p) => {
          const s = stock.get(p.id) ?? 0;
          return {
            CATEGORIA: nombreCategoria(p.categoria).toUpperCase(),
            PRODUCTO: p.nombre,
            'MEDIDA O VARIANTE': p.variante ?? '',
            STOCK: s,
            MINIMO: p.stockMinimo,
            ESTADO: s === 0 ? 'AGOTADO' : p.stockMinimo > 0 && s < p.stockMinimo ? 'REPONER' : 'DISPONIBLE',
          };
        });
    },
  },
  {
    id: 'movimientos',
    nombre: 'Movimientos de inventario',
    hoja: 'MOVIMIENTOS',
    descripcion: 'Todas las entradas y salidas de equipos, con placa o DNI y motivo.',
    filtraFecha: true,
    construir(d, r) {
      const prod = new Map(act(d.productos).map((p) => [p.id, p]));
      return act(d.movimientos)
        .filter((m) => enRango(m.fecha, r))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((m) => {
          const p = prod.get(m.productoId);
          return {
            FECHA: fecha(m.fecha),
            TIPO: m.tipo === 'entrada' ? 'ENTRADA' : 'SALIDA',
            CATEGORIA: p ? nombreCategoria(p.categoria) : '',
            PRODUCTO: p ? `${p.nombre}${p.variante ? ' · ' + p.variante : ''}` : '',
            CANTIDAD: m.cantidad,
            'PLACA/DNI': m.referencia ?? '',
            MOTIVO: m.tipoVenta ?? '',
            NOTA: m.nota ?? '',
            'REGISTRADO POR': m.creadoPor,
          };
        });
    },
  },
];

/** Descarga uno o varios formatos. Varios = un solo archivo con una hoja por formato. */
export async function descargar(formatos: Formato[], d: Datos, r: Rango, archivo: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const f of formatos) {
    const filas = f.construir(d, r);
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin datos': 'No hay registros en el rango elegido' }], {
      cellDates: true,
      dateNF: 'dd/mm/yyyy',
    });
    const cols = Object.keys(filas[0] ?? { x: '' });
    ws['!cols'] = cols.map((c) => ({
      wch: Math.min(48, Math.max(c.length + 2, ...filas.slice(0, 200).map((x) => String(x[c] instanceof Date ? '00/00/0000' : x[c] ?? '').length + 1))),
    }));
    if (filas.length) ws['!autofilter'] = { ref: ws['!ref']! };
    let nombre = (formatos.length > 1 ? f.nombre : f.hoja).slice(0, 31);
    while (usados.has(nombre)) nombre = nombre.slice(0, 29) + ' 2';
    usados.add(nombre);
    XLSX.utils.book_append_sheet(wb, ws, nombre);
  }
  XLSX.writeFile(wb, archivo, { cellDates: true });
}

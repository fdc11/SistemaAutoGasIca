// Convierte las propuestas de un Excel en registros del sistema, sin duplicar.
import type { Colecciones, NombreColeccion } from '../lib/types';
import { similitud, uid, plano } from '../lib/utils';
import type { Propuesta } from './plantillas';

type Datos = { [K in NombreColeccion]: Colecciones[K][] };

export type EstadoFila = 'nuevo' | 'existe' | 'repetido' | 'enArchivo' | 'error';

export interface Revision {
  p: Propuesta;
  estado: EstadoFila;
  detalle?: string;
  importar: boolean;
}

/** «Elite Tours S.A.C.» y «Elite Tour» se comparan igual. */
const nombreEmpresa = (n: string) =>
  plano(n)
    .replace(/\b(s\.?\s?a\.?\s?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|empresa)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/s\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const activos = <T extends { eliminado?: boolean }>(xs: T[]) => xs.filter((x) => !x.eliminado);

export function revisar(propuestas: Propuesta[], datos: Datos): Revision[] {
  const celulares = new Map(activos(datos.clientes).filter((c) => c.celular).map((c) => [c.celular, c]));
  const servicios = new Set(activos(datos.serviciosAceite).map((s) => `${s.placa}|${s.fecha}|${Number(s.monto)}`));
  const citas = new Set(activos(datos.citas).map((c) => `${c.placa}|${c.fecha}|${c.hora}|${c.area}`));
  const bloqueos = new Set(activos(datos.bloqueos).map((b) => `${b.fecha}|${b.hora}|${b.area}`));
  const refri = activos(datos.productos).find((p) => p.categoria === 'refrigerante');
  const movs = new Set(activos(datos.movimientos).filter((m) => m.productoId === refri?.id).map((m) => `${m.fecha}|${m.referencia}|${m.cantidad}`));
  const atenciones = new Set(activos(datos.atenciones).map((a) => `${a.placa}|${a.fecha}`));
  const vistosAt = new Set<string>();
  const vistos = new Map<string, number>();
  const vistosServ = new Set<string>();

  return propuestas.map((p) => {
    if (p.error) return { p, estado: 'error', detalle: p.error, importar: false };
    if (p.servicio && p.vehiculo) {
      const k = `${p.vehiculo.placa}|${p.servicio.fecha}|${p.servicio.monto}`;
      if (servicios.has(k)) return { p, estado: 'repetido', detalle: 'Este servicio ya está en el sistema', importar: false };
      if (vistosServ.has(k)) return { p, estado: 'repetido', detalle: 'Fila repetida en el mismo archivo', importar: false };
      vistosServ.add(k);
    }
    if (p.atencion && p.vehiculo) {
      const k = `${p.vehiculo.placa}|${p.atencion.fecha}`;
      if (atenciones.has(k)) return { p, estado: 'repetido', detalle: 'Esta atención de convenio ya está en el sistema', importar: false };
      if (vistosAt.has(k)) return { p, estado: 'repetido', detalle: 'Fila repetida en el mismo archivo', importar: false };
      vistosAt.add(k);
    }
    if (p.cita && p.vehiculo && citas.has(`${p.vehiculo.placa}|${p.cita.fecha}|${p.cita.hora}|${p.cita.area}`))
      return { p, estado: 'repetido', detalle: 'Esta cita ya está en la agenda', importar: false };
    if (p.bloqueo && bloqueos.has(`${p.bloqueo.fecha}|${p.bloqueo.hora}|${p.bloqueo.area}`))
      return { p, estado: 'repetido', detalle: 'Este bloqueo ya existe', importar: false };
    if (p.movimiento && movs.has(`${p.movimiento.fecha}|${p.movimiento.referencia}|${p.movimiento.cantidad}`))
      return { p, estado: 'repetido', detalle: 'Este movimiento ya existe', importar: false };
    const cel = p.cliente?.celular;
    if (cel) {
      const ex = celulares.get(cel);
      if (ex && !p.servicio) return { p, estado: 'existe', detalle: `Ya registrado: ${ex.nombre || 'sin nombre'}. Se suma a su ficha.`, importar: true };
      if (vistos.has(cel) && !p.servicio) return { p, estado: 'enArchivo', detalle: `Mismo celular que la fila ${vistos.get(cel)}. Se une a esa ficha.`, importar: true };
      vistos.set(cel, p.fila);
    }
    return { p, estado: 'nuevo', importar: true };
  });
}

export interface Resultado {
  creados: Partial<Record<NombreColeccion, any[]>>;
  parches: { col: NombreColeccion; id: string; patch: Record<string, any> }[];
  creadas: number;
  fusionadas: number;
  omitidas: number;
}

/** Arma todos los registros a crear. No escribe nada: eso lo hace la pantalla con el resultado. */
export function integrar(revisiones: Revision[], datos: Datos, importacionId: string, autor: string): Resultado {
  const ahora = new Date().toISOString();
  const meta = { creadoEn: ahora, creadoPor: autor, importacionId };
  const creados: Resultado['creados'] = {};
  const parches: Resultado['parches'] = [];
  const add = (col: NombreColeccion, doc: any) => {
    (creados[col] ??= []).push({ ...meta, ...doc });
    return doc.id as string;
  };

  const porCelular = new Map<string, { id: string; nombre: string; nuevo: boolean; estado: string }>(
    activos(datos.clientes)
      .filter((c) => c.celular)
      .map((c) => [c.celular, { id: c.id, nombre: c.nombre, nuevo: false, estado: c.estado }]),
  );
  const porPlaca = new Map<string, { id: string; clienteId?: string; nuevo: boolean }>(
    activos(datos.vehiculos).map((v) => [v.placa, { id: v.id, clienteId: v.clienteId, nuevo: false }]),
  );
  const empresas = activos(datos.empresas).map((e) => ({ id: e.id, nombre: e.nombre }));
  const filtros = new Set(activos(datos.filtros).map((f) => plano(f.marca + f.modelo)));
  // Evita repetir el mismo comentario en el historial si se importa dos veces el mismo archivo
  const comentarios = new Set(activos(datos.interacciones).map((i) => `${i.clienteId}|${plano(i.comentario)}`));
  const empresaDe = new Map(activos(datos.clientes).map((c) => [c.id, c.empresaId]));
  let refriId = activos(datos.productos).find((p) => p.categoria === 'refrigerante')?.id;

  const nombresEmpresa: Record<string, number> = {};
  const usoEmpresa: Record<string, Record<string, number>> = {};
  let creadas = 0;
  let fusionadas = 0;
  let omitidas = 0;

  for (const r of revisiones) {
    if (!r.importar) {
      omitidas++;
      continue;
    }
    const p = r.p;
    let fusiono = false;

    // Empresa de convenio (une variantes como «Nazca Land Tours» y «Nasca Land Tours»)
    let empresaId: string | undefined;
    if (p.empresa) {
      const variantes = (nombresEmpresa[p.empresa] ??= 0);
      nombresEmpresa[p.empresa] = variantes + 1;
      const a = nombreEmpresa(p.empresa);
      const parecida = empresas.find((e) => {
        const b = nombreEmpresa(e.nombre);
        return a === b || similitud(a, b) >= 0.72 || a.startsWith(b) || b.startsWith(a);
      });
      if (parecida) empresaId = parecida.id;
      else {
        empresaId = uid();
        add('empresas', { id: empresaId, nombre: p.empresa, activa: true });
        empresas.push({ id: empresaId, nombre: p.empresa });
      }
      (usoEmpresa[empresaId] ??= {})[p.empresa] = ((usoEmpresa[empresaId] ?? {})[p.empresa] ?? 0) + 1;
    }

    // Cliente
    let clienteId: string | undefined;
    if (p.cliente) {
      const cel = p.cliente.celular;
      const existente = cel ? porCelular.get(cel) : undefined;
      const delVehiculo = p.vehiculo ? porPlaca.get(p.vehiculo.placa)?.clienteId : undefined;
      if (existente) {
        clienteId = existente.id;
        fusiono = true;
        if (!existente.nombre && p.cliente.nombre) {
          if (existente.nuevo) {
            const doc = creados.clientes!.find((x) => x.id === existente.id);
            if (doc) doc.nombre = p.cliente.nombre;
          } else parches.push({ col: 'clientes', id: existente.id, patch: { nombre: p.cliente.nombre } });
          existente.nombre = p.cliente.nombre;
        }
      } else if (!cel && delVehiculo) {
        clienteId = delVehiculo;
        fusiono = true;
      } else {
        clienteId = uid();
        const nombre = p.cliente.nombre || (p.vehiculo ? `Cliente ${p.vehiculo.placa}` : 'Sin nombre');
        add('clientes', { id: clienteId, ...p.cliente, nombre, empresaId });
        if (cel) porCelular.set(cel, { id: clienteId, nombre: p.cliente.nombre, nuevo: true, estado: p.cliente.estado });
      }
    }

    // Vehículo
    let vehiculoId: string | undefined;
    if (p.vehiculo?.placa) {
      const v = porPlaca.get(p.vehiculo.placa);
      if (v) {
        vehiculoId = v.id;
        if (!v.clienteId && clienteId) {
          if (v.nuevo) {
            const doc = creados.vehiculos!.find((x) => x.id === v.id);
            if (doc) doc.clienteId = clienteId;
          } else parches.push({ col: 'vehiculos', id: v.id, patch: { clienteId } });
          v.clienteId = clienteId;
        }
        if (!clienteId) clienteId = v.clienteId;
      } else {
        vehiculoId = uid();
        add('vehiculos', { id: vehiculoId, ...p.vehiculo, clienteId, empresaId });
        porPlaca.set(p.vehiculo.placa, { id: vehiculoId, clienteId, nuevo: true });
      }
    }

    if (p.interaccion && clienteId) {
      const k = `${clienteId}|${plano(p.interaccion.comentario)}`;
      if (!comentarios.has(k)) {
        comentarios.add(k);
        add('interacciones', { id: uid(), clienteId, ...p.interaccion });
      }
    }
    // Cliente que ya existía y ahora aparece en un convenio: se le asigna la empresa
    if (empresaId && clienteId && !empresaDe.get(clienteId)) {
      const creado = creados.clientes?.find((x) => x.id === clienteId);
      if (creado) creado.empresaId = empresaId;
      else parches.push({ col: 'clientes', id: clienteId, patch: { empresaId } });
      empresaDe.set(clienteId, empresaId);
    }
    if (p.atencion && empresaId) {
      add('atenciones', {
        id: uid(),
        empresaId,
        clienteId,
        vehiculoId,
        placa: p.vehiculo?.placa ?? '',
        nombre: p.cliente?.nombre ?? '',
        celular: p.cliente?.celular ?? '',
        marca: p.vehiculo?.marca,
        modelo: [p.vehiculo?.modelo, p.vehiculo?.anio].filter(Boolean).join(' ') || undefined,
        cobro: 'pendiente',
        ...p.atencion,
      });
    }
    if (p.servicio) add('serviciosAceite', { id: uid(), placa: p.vehiculo?.placa ?? '', vehiculoId, clienteId, ...p.servicio });
    if (p.cita) add('citas', { id: uid(), placa: p.vehiculo?.placa ?? '', clienteId, ...p.cita });
    if (p.bloqueo) add('bloqueos', { id: uid(), ...p.bloqueo });
    if (p.filtro) {
      const k = plano(p.filtro.marca + p.filtro.modelo);
      if (!filtros.has(k)) {
        filtros.add(k);
        add('filtros', { id: uid(), ...p.filtro });
      }
    }
    if (p.movimiento) {
      if (!refriId) {
        refriId = uid();
        add('productos', { id: refriId, categoria: 'refrigerante', nombre: 'Refrigerante', variante: 'Galón', stockMinimo: 3 });
      }
      const { producto, ...m } = p.movimiento;
      add('movimientos', { id: uid(), productoId: refriId, tipo: 'salida', ...m });
    }

    if (fusiono) fusionadas++;
    else creadas++;
  }
  // Empresa nueva: se queda con la forma de escribir más usada («Nazca Land Tours» y no «Naland Tours»)
  for (const doc of creados.empresas ?? []) {
    const usos = Object.entries(usoEmpresa[doc.id] ?? {}).sort((a, b) => b[1] - a[1]);
    if (usos.length) doc.nombre = usos[0][0];
  }
  return { creados, parches, creadas, fusionadas, omitidas };
}

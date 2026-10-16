// Operaciones de negocio que tocan varias colecciones a la vez.
import { useDatos } from './store';
import { useAuth } from './auth';
import type { Canal, Cliente, EstadoCliente, Vehiculo } from '../lib/types';
import { ahoraISO, hoyISO, normalizarCelular, normalizarPlaca } from '../lib/utils';
import { estadoInfo } from '../lib/catalogos';

export interface DatosRegistro {
  nombre: string;
  celular: string;
  ciudad?: string;
  canal: Canal;
  subcanal?: string;
  empresaId?: string;
  interes?: string;
  probabilidad?: Cliente['probabilidad'];
  estado?: EstadoCliente;
  proximoContacto?: string;
  placa?: string;
  marca?: string;
  modelo?: string;
  anio?: string;
  comentario?: string;
  tipoInteraccion?: 'llamada' | 'whatsapp' | 'presencial' | 'nota';
  resultado?: string;
  areas?: string[];
}

export function useAcciones() {
  const { datos, crear, editar, autor } = useDatos();
  const { usuario } = useAuth();

  /** Busca un cliente o vehículo ya registrado por celular o placa. */
  const buscarExistente = (celular?: string, placa?: string) => {
    const cel = normalizarCelular(celular);
    const pla = normalizarPlaca(placa);
    const vehiculo = pla ? datos.vehiculos.find((v) => v.placa === pla && !v.eliminado) : undefined;
    let cliente = cel ? datos.clientes.find((c) => c.celular === cel && !c.eliminado) : undefined;
    if (!cliente && vehiculo?.clienteId) cliente = datos.clientes.find((c) => c.id === vehiculo.clienteId && !c.eliminado);
    return { cliente, vehiculo };
  };

  /** Crea el cliente (o reutiliza el existente), su vehículo y la primera interacción. */
  const registrar = async (d: DatosRegistro): Promise<{ clienteId: string; vehiculoId?: string; nuevo: boolean }> => {
    const celular = normalizarCelular(d.celular);
    const placa = normalizarPlaca(d.placa);
    const { cliente, vehiculo } = buscarExistente(celular, placa);
    let clienteId = cliente?.id;
    const nuevo = !cliente;

    if (!clienteId) {
      clienteId = await crear('clientes', {
        nombre: d.nombre.trim(),
        celular,
        ciudad: d.ciudad,
        canal: d.canal,
        subcanal: d.subcanal,
        empresaId: d.empresaId,
        interes: d.interes,
        probabilidad: d.probabilidad,
        estado: d.estado ?? 'nuevo',
        proximoContacto: d.proximoContacto,
        fechaContacto: hoyISO(),
        areas: d.areas?.length ? d.areas : undefined,
      });
    } else {
      const patch: Partial<Cliente> = {};
      if (d.interes) patch.interes = d.interes;
      if (d.proximoContacto) patch.proximoContacto = d.proximoContacto;
      if (d.estado && d.estado !== cliente!.estado) patch.estado = d.estado;
      if (!cliente!.celular && celular) patch.celular = celular;
      const nuevas = (d.areas ?? []).filter((a) => !(cliente!.areas ?? []).includes(a));
      if (nuevas.length) patch.areas = [...(cliente!.areas ?? []), ...nuevas];
      if (Object.keys(patch).length) await editar('clientes', clienteId, patch);
    }

    let vehiculoId = vehiculo?.id;
    if (placa && !vehiculo) {
      vehiculoId = await crear('vehiculos', {
        placa,
        marca: d.marca,
        modelo: d.modelo,
        anio: d.anio,
        clienteId,
        empresaId: d.empresaId,
      });
    } else if (vehiculo && !vehiculo.clienteId) {
      await editar('vehiculos', vehiculo.id, { clienteId });
    }

    const texto = d.comentario?.trim();
    await crear('interacciones', {
      clienteId,
      fecha: ahoraISO(),
      tipo: d.tipoInteraccion ?? 'nota',
      resultado: d.resultado,
      comentario: texto || (nuevo ? 'Cliente registrado' : 'Nuevo contacto del cliente'),
    });

    return { clienteId, vehiculoId, nuevo };
  };

  const cambiarEstado = async (cliente: Cliente, estado: EstadoCliente, comentario: string, motivo?: string) => {
    await editar('clientes', cliente.id, {
      estado,
      motivoPerdida: estado === 'perdido' ? motivo : undefined,
    });
    await crear('interacciones', {
      clienteId: cliente.id,
      fecha: ahoraISO(),
      tipo: 'estado',
      estadoAnterior: cliente.estado,
      estadoNuevo: estado,
      comentario:
        comentario.trim() ||
        `Cambió a ${estadoInfo(estado).nombre}${motivo ? ` (${motivo})` : ''}`,
    });
  };

  /** Asegura que exista un vehículo con esa placa; lo crea si hace falta. */
  const asegurarVehiculo = async (placa: string, extra: Partial<Vehiculo> = {}) => {
    const p = normalizarPlaca(placa);
    const v = datos.vehiculos.find((x) => x.placa === p && !x.eliminado);
    if (v) return v.id;
    return crear('vehiculos', { placa: p, ...extra } as any);
  };

  return { buscarExistente, registrar, cambiarEstado, asegurarVehiculo, autor };
}

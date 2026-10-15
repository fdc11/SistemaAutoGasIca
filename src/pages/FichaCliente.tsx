import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Pencil, Trash2, Phone, Plus, StickyNote, ArrowRightLeft, Store, Car } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { CANALES, ESTADOS, ESTADOS_CITA, estadoInfo, nombreArea, nombreCanal } from '../lib/catalogos';
import type { Cliente, EstadoCliente, TipoInteraccion } from '../lib/types';
import {
  ahoraISO,
  celularValido,
  enlaceWhatsApp,
  fechaCorta,
  fechaHora,
  formatoCelular,
  normalizarCelular,
  normalizarPlaca,
  placaValida,
  soles,
} from '../lib/utils';
import {
  AreaTexto,
  Boton,
  Campo,
  Confirmar,
  Dato,
  Encabezado,
  Entrada,
  Etiqueta,
  Modal,
  Panel,
  Selector,
  Vacio,
  useAvisos,
} from '../components/ui';

const ICONO_TIPO: Record<TipoInteraccion, JSX.Element> = {
  llamada: <Phone className="h-3.5 w-3.5" />,
  whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
  presencial: <Store className="h-3.5 w-3.5" />,
  nota: <StickyNote className="h-3.5 w-3.5" />,
  estado: <ArrowRightLeft className="h-3.5 w-3.5" />,
  sistema: <StickyNote className="h-3.5 w-3.5" />,
};
const NOMBRE_TIPO: Record<TipoInteraccion, string> = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  presencial: 'Visita',
  nota: 'Nota',
  estado: 'Cambio de estado',
  sistema: 'Sistema',
};

export default function FichaCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { datos, crear, editar, eliminar, listas } = useDatos();
  const { cambiarEstado } = useAcciones();
  const avisar = useAvisos();
  const empresas = useActivos('empresas');
  const cliente = datos.clientes.find((c) => c.id === id && !c.eliminado);

  const vehiculos = useMemo(() => datos.vehiculos.filter((v) => v.clienteId === id && !v.eliminado), [datos.vehiculos, id]);
  const placas = vehiculos.map((v) => v.placa);
  const historial = useMemo(
    () => datos.interacciones.filter((i) => i.clienteId === id && !i.eliminado).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [datos.interacciones, id],
  );
  const citas = useMemo(
    () =>
      datos.citas
        .filter((c) => !c.eliminado && (c.clienteId === id || placas.includes(c.placa)))
        .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)),
    [datos.citas, id, placas.join()],
  );
  const aceite = useMemo(
    () =>
      datos.serviciosAceite
        .filter((s) => !s.eliminado && (s.clienteId === id || placas.includes(s.placa)))
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [datos.serviciosAceite, id, placas.join()],
  );

  // Formularios
  const [nuevoEstado, setNuevoEstado] = useState<EstadoCliente | ''>('');
  const [motivo, setMotivo] = useState('');
  const [comentarioEstado, setComentarioEstado] = useState('');
  const [tipo, setTipo] = useState<TipoInteraccion>('llamada');
  const [nota, setNota] = useState('');
  const [proximo, setProximo] = useState('');
  const [editando, setEditando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [agregarVeh, setAgregarVeh] = useState(false);

  if (!cliente) {
    return (
      <Panel>
        <Vacio
          titulo="No encontramos este cliente"
          texto="Puede que esté en la papelera o que el enlace no sea correcto."
          accion={
            <Link to="/clientes">
              <Boton variante="secundario">Volver a la base de clientes</Boton>
            </Link>
          }
        />
      </Panel>
    );
  }

  const e = estadoInfo(cliente.estado);
  const empresa = empresas.find((x) => x.id === cliente.empresaId);
  const total = aceite.reduce((a, s) => a + (Number(s.monto) || 0), 0);

  const guardarEstado = async () => {
    if (!nuevoEstado) return;
    if (nuevoEstado === 'perdido' && !motivo) {
      avisar('Elige el motivo por el que se perdió el cliente.', 'error');
      return;
    }
    await cambiarEstado(cliente, nuevoEstado, comentarioEstado, motivo || undefined);
    avisar(`Estado actualizado a ${estadoInfo(nuevoEstado).nombre}.`);
    setNuevoEstado('');
    setMotivo('');
    setComentarioEstado('');
  };

  const guardarNota = async () => {
    if (!nota.trim()) return;
    await crear('interacciones', { clienteId: cliente.id, fecha: ahoraISO(), tipo, comentario: nota.trim() });
    if (proximo) await editar('clientes', cliente.id, { proximoContacto: proximo });
    else if (cliente.proximoContacto) await editar('clientes', cliente.id, { proximoContacto: '' });
    if (cliente.estado === 'nuevo') await editar('clientes', cliente.id, { estado: 'contactado' });
    avisar('Contacto registrado.');
    setNota('');
    setProximo('');
  };

  return (
    <>
      <Encabezado
        migas={
          <>
            <Link to="/clientes" className="hover:text-tinta">
              Base de clientes
            </Link>{' '}
            / <span className="text-tinta">{cliente.nombre}</span>
          </>
        }
        titulo={cliente.nombre || 'Sin nombre'}
        acciones={
          <>
            {cliente.celular && (
              <a href={enlaceWhatsApp(cliente.celular, `Hola ${cliente.nombre.split(' ')[0]}, te escribimos de AutoGas Ica.`)} target="_blank" rel="noreferrer">
                <Boton variante="secundario" icono={<MessageCircle className="h-4 w-4 text-ok" />}>
                  WhatsApp
                </Boton>
              </a>
            )}
            <Boton variante="secundario" icono={<Pencil className="h-4 w-4" />} onClick={() => setEditando(true)}>
              Editar
            </Boton>
            <Boton variante="peligro" icono={<Trash2 className="h-4 w-4" />} onClick={() => setBorrar(true)}>
              Eliminar
            </Boton>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <Panel titulo="Datos del cliente" acciones={<Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>}>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dato etiqueta="Celular">
                <span className="num">{formatoCelular(cliente.celular)}</span>
              </Dato>
              <Dato etiqueta="Ciudad">{cliente.ciudad}</Dato>
              <Dato etiqueta="Canal de origen">
                {nombreCanal(cliente.canal)}
                {cliente.subcanal && <span className="text-gris"> · {cliente.subcanal}</span>}
              </Dato>
              <Dato etiqueta="Empresa de convenio">{empresa?.nombre}</Dato>
              <Dato etiqueta="Servicio de interés">
                {cliente.interes}
                {cliente.interesDetalle && cliente.interesDetalle.toLowerCase() !== (cliente.interes ?? '').toLowerCase() && (
                  <span className="block text-[13px] font-normal text-gris">«{cliente.interesDetalle}»</span>
                )}
              </Dato>
              {cliente.interesNivel && <Dato etiqueta="Nivel de interés">{cliente.interesNivel[0].toUpperCase() + cliente.interesNivel.slice(1)}</Dato>}
              {cliente.fechaCita && (
                <Dato etiqueta="Fecha de cita acordada">
                  <span className="num">{/^\d{4}-\d{2}-\d{2}$/.test(cliente.fechaCita) ? fechaCorta(cliente.fechaCita) : cliente.fechaCita}</span>
                </Dato>
              )}
              {cliente.codigoAnterior && <Dato etiqueta="ID en el Excel anterior">{cliente.codigoAnterior}</Dato>}
              <Dato etiqueta="Probabilidad de venta">{cliente.probabilidad && cliente.probabilidad[0].toUpperCase() + cliente.probabilidad.slice(1)}</Dato>
              <Dato etiqueta="Próximo contacto">
                <span className="num">{fechaCorta(cliente.proximoContacto)}</span>
              </Dato>
              <Dato etiqueta="Registrado">
                <span className="num">{fechaCorta(cliente.fechaContacto)}</span>
                <span className="text-gris"> por {cliente.creadoPor}</span>
              </Dato>
              {cliente.motivoPerdida && <Dato etiqueta="Motivo de pérdida">{cliente.motivoPerdida}</Dato>}
            </dl>
          </Panel>

          <Panel
            titulo={`Vehículos (${vehiculos.length})`}
            acciones={
              <Boton tam="sm" variante="secundario" icono={<Plus className="h-3.5 w-3.5" />} onClick={() => setAgregarVeh(true)}>
                Agregar
              </Boton>
            }
            sinRelleno
          >
            {vehiculos.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gris">Sin vehículos registrados.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {vehiculos.map((v) => (
                  <li key={v.id} className="flex items-center gap-4 px-5 py-3">
                    <Car className="h-5 w-5 text-gris-claro" />
                    <span className="rounded border border-linea-fuerte px-2 py-0.5 font-display text-base font-semibold tracking-wide num">{v.placa}</span>
                    <span className="text-sm text-tinta">
                      {[v.marca, v.modelo, v.anio].filter(Boolean).join(' ') || <span className="text-gris">Sin marca ni modelo</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel titulo={`Citas (${citas.length})`} sinRelleno>
            {citas.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gris">Sin citas.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {citas.slice(0, 8).map((c) => {
                  const ec = ESTADOS_CITA.find((x) => x.id === c.estado)!;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <span className="w-36 font-medium num">
                        {fechaCorta(c.fecha)} · {c.hora}
                      </span>
                      <span className="flex-1">
                        {c.servicio} <span className="text-gris">· {nombreArea(c.area)} · {c.placa}</span>
                      </span>
                      <Etiqueta tono={ec.tono}>{ec.nombre}</Etiqueta>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel titulo={`Cambios de aceite (${aceite.length})`} acciones={aceite.length > 0 && <span className="text-sm text-gris num">Total {soles(total)}</span>} sinRelleno>
            {aceite.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gris">Sin servicios de aceite.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {aceite.slice(0, 8).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="w-24 font-medium num">{fechaCorta(s.fecha)}</span>
                    <span className="flex-1">
                      {s.detalle} <span className="text-gris">· {s.placa}</span>
                    </span>
                    <span className="num">{s.kmActual ? `${s.kmActual.toLocaleString('es-PE')} km` : ''}</span>
                    <span className="w-20 text-right font-medium num">{soles(s.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel titulo="Cambiar estado">
            <div className="space-y-3">
              <Selector value={nuevoEstado} onChange={(ev) => setNuevoEstado(ev.target.value as EstadoCliente)} aria-label="Nuevo estado">
                <option value="">Elegir nuevo estado</option>
                {ESTADOS.filter((x) => x.id !== cliente.estado).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </Selector>
              {nuevoEstado === 'perdido' && (
                <Selector value={motivo} onChange={(ev) => setMotivo(ev.target.value)} aria-label="Motivo">
                  <option value="">Motivo de pérdida</option>
                  {listas.motivosPerdida.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Selector>
              )}
              {nuevoEstado && (
                <>
                  <AreaTexto
                    value={comentarioEstado}
                    onChange={(ev) => setComentarioEstado(ev.target.value)}
                    placeholder="Por qué cambia (opcional): sigue conversando, pidió otra cotización…"
                    className="min-h-[64px]"
                  />
                  <Boton className="w-full" onClick={guardarEstado}>
                    Guardar estado
                  </Boton>
                </>
              )}
            </div>
          </Panel>

          <Panel titulo="Registrar contacto">
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-1 rounded-md bg-fondo p-1">
                {(['llamada', 'whatsapp', 'presencial', 'nota'] as TipoInteraccion[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`rounded px-2 py-1.5 text-[13px] font-semibold ${tipo === t ? 'bg-white text-tinta shadow-panel' : 'text-gris hover:text-tinta'}`}
                  >
                    {NOMBRE_TIPO[t]}
                  </button>
                ))}
              </div>
              <AreaTexto value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Qué se habló y qué quedó pendiente" />
              <Campo etiqueta="Volver a contactar el">
                <Entrada type="date" value={proximo} onChange={(ev) => setProximo(ev.target.value)} />
              </Campo>
              <Boton className="w-full" variante="secundario" onClick={guardarNota} disabled={!nota.trim()}>
                Guardar contacto
              </Boton>
            </div>
          </Panel>

          <Panel titulo="Historial" sinRelleno>
            {historial.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gris">Sin movimientos todavía.</p>
            ) : (
              <ol className="px-5 py-4">
                {historial.map((h, i) => (
                  <li key={h.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < historial.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-linea" aria-hidden />}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-linea bg-white text-gris">
                      {ICONO_TIPO[h.tipo]}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[13px] text-gris">
                        <span className="font-semibold text-tinta">{NOMBRE_TIPO[h.tipo]}</span> · {fechaHora(h.fecha)} · {h.creadoPor}
                      </p>
                      {h.tipo === 'estado' && h.estadoNuevo && (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                          {h.estadoAnterior && <Etiqueta tono={estadoInfo(h.estadoAnterior).tono}>{estadoInfo(h.estadoAnterior).nombre}</Etiqueta>}
                          <span className="text-gris">a</span>
                          <Etiqueta tono={estadoInfo(h.estadoNuevo).tono}>{estadoInfo(h.estadoNuevo).nombre}</Etiqueta>
                        </p>
                      )}
                      <p className="mt-1 whitespace-pre-line text-sm text-tinta">{h.comentario}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      {editando && <EditarCliente cliente={cliente} onCerrar={() => setEditando(false)} />}
      {agregarVeh && (
        <AgregarVehiculo
          onCerrar={() => setAgregarVeh(false)}
          onGuardar={async (v) => {
            const existe = datos.vehiculos.find((x) => x.placa === v.placa && !x.eliminado);
            if (existe) await editar('vehiculos', existe.id, { ...v, clienteId: cliente.id });
            else await crear('vehiculos', { ...v, clienteId: cliente.id, empresaId: cliente.empresaId });
            avisar(`Vehículo ${v.placa} agregado.`);
            setAgregarVeh(false);
          }}
        />
      )}
      <Confirmar
        abierto={borrar}
        titulo="Eliminar cliente"
        texto={`${cliente.nombre} pasará a la papelera. Puedes restaurarlo desde Ajustes durante 30 días.`}
        accion="Eliminar"
        peligro
        onCerrar={() => setBorrar(false)}
        onConfirmar={async () => {
          await eliminar('clientes', cliente.id);
          avisar(`${cliente.nombre} se envió a la papelera.`);
          navigate('/clientes');
        }}
      />
    </>
  );
}

function EditarCliente({ cliente, onCerrar }: { cliente: Cliente; onCerrar: () => void }) {
  const { editar, listas } = useDatos();
  const empresas = useActivos('empresas');
  const avisar = useAvisos();
  const [f, setF] = useState({ ...cliente });
  const [error, setError] = useState('');
  const guardar = async () => {
    const cel = normalizarCelular(f.celular);
    if (!f.nombre.trim()) return setError('El nombre no puede quedar vacío.');
    if (f.celular && !celularValido(cel)) return setError('El celular debe tener 9 dígitos y empezar en 9.');
    await editar('clientes', cliente.id, {
      nombre: f.nombre.trim(),
      celular: cel,
      ciudad: f.ciudad,
      canal: f.canal,
      subcanal: f.canal === 'publicidad' ? f.subcanal : '',
      empresaId: f.canal === 'convenio' ? f.empresaId : '',
      interes: f.interes,
      probabilidad: f.probabilidad,
      proximoContacto: f.proximoContacto,
    });
    avisar('Datos actualizados.');
    onCerrar();
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Editar datos del cliente"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>Guardar cambios</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre y apellido" className="sm:col-span-2">
          <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Celular">
          <Entrada value={f.celular} onChange={(e) => setF({ ...f, celular: e.target.value })} />
        </Campo>
        <Campo etiqueta="Ciudad">
          <Selector value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value })}>
            <option value="">—</option>
            {listas.ciudades.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Canal de origen">
          <Selector value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value as any })}>
            {CANALES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        {f.canal === 'publicidad' && (
          <Campo etiqueta="Anuncio">
            <Selector value={f.subcanal ?? ''} onChange={(e) => setF({ ...f, subcanal: e.target.value })}>
              <option value="">—</option>
              {listas.subcanales.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Selector>
          </Campo>
        )}
        {f.canal === 'convenio' && (
          <Campo etiqueta="Empresa">
            <Selector value={f.empresaId ?? ''} onChange={(e) => setF({ ...f, empresaId: e.target.value })}>
              <option value="">—</option>
              {empresas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        )}
        <Campo etiqueta="Servicio de interés">
          <Selector value={f.interes ?? ''} onChange={(e) => setF({ ...f, interes: e.target.value })}>
            <option value="">—</option>
            {[...new Set([...(f.interes ? [f.interes] : []), ...listas.servicios])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Probabilidad de venta">
          <Selector value={f.probabilidad ?? ''} onChange={(e) => setF({ ...f, probabilidad: (e.target.value || undefined) as any })}>
            <option value="">Sin definir</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Próximo contacto">
          <Entrada type="date" value={f.proximoContacto ?? ''} onChange={(e) => setF({ ...f, proximoContacto: e.target.value })} />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function AgregarVehiculo({
  onCerrar,
  onGuardar,
}: {
  onCerrar: () => void;
  onGuardar: (v: { placa: string; marca?: string; modelo?: string; anio?: string }) => void;
}) {
  const [v, setV] = useState({ placa: '', marca: '', modelo: '', anio: '' });
  const [error, setError] = useState('');
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Agregar vehículo"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            onClick={() => {
              const p = normalizarPlaca(v.placa);
              if (!placaValida(p)) return setError('La placa debe tener 6 letras o números.');
              onGuardar({ ...v, placa: p });
            }}
          >
            Agregar vehículo
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Placa" error={error} className="sm:col-span-2">
          <Entrada value={v.placa} onChange={(e) => setV({ ...v, placa: e.target.value.toUpperCase() })} placeholder="ABC123" />
        </Campo>
        <Campo etiqueta="Marca">
          <Entrada value={v.marca} onChange={(e) => setV({ ...v, marca: e.target.value })} />
        </Campo>
        <Campo etiqueta="Modelo">
          <Entrada value={v.modelo} onChange={(e) => setV({ ...v, modelo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Año">
          <Entrada value={v.anio} onChange={(e) => setV({ ...v, anio: e.target.value })} />
        </Campo>
      </div>
    </Modal>
  );
}

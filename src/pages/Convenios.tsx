import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import type { Empresa, Filtro } from '../lib/types';
import { fechaCorta, formatoCelular, plano, soles } from '../lib/utils';
import {
  AreaTexto,
  Boton,
  BotonIcono,
  Buscador,
  Campo,
  Confirmar,
  Encabezado,
  Entrada,
  Etiqueta,
  Modal,
  Panel,
  Pestanas,
  Tabla,
  Td,
  Th,
  Vacio,
  useAvisos,
} from '../components/ui';

export default function Convenios() {
  const empresas = useActivos('empresas');
  const clientes = useActivos('clientes');
  const vehiculos = useActivos('vehiculos');
  const servicios = useActivos('serviciosAceite');
  const filtros = useActivos('filtros');
  const { eliminar } = useDatos();
  const avisar = useAvisos();
  const [vista, setVista] = useState<'empresas' | 'filtros'>('empresas');
  const [editEmp, setEditEmp] = useState<Empresa | 'nueva' | null>(null);
  const [verEmp, setVerEmp] = useState<Empresa | null>(null);
  const [editFil, setEditFil] = useState<Filtro | 'nuevo' | null>(null);
  const [borrarFil, setBorrarFil] = useState<Filtro | null>(null);
  const [q, setQ] = useState('');

  const resumen = useMemo(() => {
    const m = new Map<string, { clientes: number; vehiculos: string[]; servicios: number; monto: number; ultimo?: string }>();
    for (const e of empresas) {
      const cl = clientes.filter((c) => c.empresaId === e.id);
      const ids = new Set(cl.map((c) => c.id));
      const veh = vehiculos.filter((v) => v.empresaId === e.id || (v.clienteId && ids.has(v.clienteId))).map((v) => v.placa);
      const sv = servicios.filter((s) => veh.includes(s.placa));
      m.set(e.id, {
        clientes: cl.length,
        vehiculos: veh,
        servicios: sv.length,
        monto: sv.reduce((a, s) => a + (Number(s.monto) || 0), 0),
        ultimo: sv.map((s) => s.fecha).sort().at(-1),
      });
    }
    return m;
  }, [empresas, clientes, vehiculos, servicios]);

  const filtrosVis = useMemo(() => {
    const t = plano(q);
    return filtros
      .filter((x) => !t || plano(`${x.marca} ${x.modelo} ${x.filtroAire} ${x.filtroAceite}`).includes(t))
      .sort((a, b) => (a.marca + a.modelo).localeCompare(b.marca + b.modelo));
  }, [filtros, q]);

  return (
    <>
      <Encabezado
        titulo="Convenios"
        descripcion="Empresas con trato preferencial y el catálogo de filtros por modelo, que se sugiere solo al registrar un vehículo de convenio."
        acciones={
          vista === 'empresas' ? (
            <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditEmp('nueva')}>
              Nueva empresa
            </Boton>
          ) : (
            <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditFil('nuevo')}>
              Nuevo filtro
            </Boton>
          )
        }
      />
      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { id: 'empresas', nombre: 'Empresas', cuenta: empresas.length },
          { id: 'filtros', nombre: 'Catálogo de filtros', cuenta: filtros.length },
        ]}
      />

      {vista === 'empresas' ? (
        <Panel sinRelleno>
          {empresas.length === 0 ? (
            <Vacio icono={<Building2 className="h-8 w-8" />} titulo="Sin empresas con convenio" accion={<Boton onClick={() => setEditEmp('nueva')}>Agregar empresa</Boton>} />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Empresa</Th>
                  <Th>Contacto</Th>
                  <Th className="text-right">Clientes</Th>
                  <Th className="text-right">Vehículos</Th>
                  <Th className="text-right">Servicios</Th>
                  <Th className="text-right">Facturado</Th>
                  <Th>Último servicio</Th>
                  <Th>Estado</Th>
                  <Th className="w-12"><span className="sr-only">Editar</span></Th>
                </tr>
              </thead>
              <tbody>
                {empresas
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
                  .map((e) => {
                    const r = resumen.get(e.id)!;
                    return (
                      <tr key={e.id} className="cursor-pointer hover:bg-[#FAFAFB]" onClick={() => setVerEmp(e)}>
                        <Td>
                          <p className="font-semibold">{e.nombre}</p>
                          {e.ruc && <p className="text-[13px] text-gris num">RUC {e.ruc}</p>}
                        </Td>
                        <Td>
                          {e.contacto || '—'}
                          {e.telefono && <p className="text-[13px] text-gris num">{formatoCelular(e.telefono)}</p>}
                        </Td>
                        <Td className="text-right num">{r.clientes}</Td>
                        <Td className="text-right num">{r.vehiculos.length}</Td>
                        <Td className="text-right num">{r.servicios}</Td>
                        <Td className="text-right num">{soles(r.monto)}</Td>
                        <Td className="num">{fechaCorta(r.ultimo)}</Td>
                        <Td>{e.activa ? <Etiqueta tono="ok">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>}</Td>
                        <Td onClick={(ev) => ev.stopPropagation()}>
                          <BotonIcono titulo="Editar empresa" onClick={() => setEditEmp(e)}>
                            <Pencil className="h-4 w-4" />
                          </BotonIcono>
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </Tabla>
          )}
        </Panel>
      ) : (
        <Panel sinRelleno>
          <div className="border-b border-linea p-4">
            <Buscador valor={q} onCambio={setQ} placeholder="Marca, modelo o código de filtro" className="max-w-md" />
          </div>
          {filtrosVis.length === 0 ? (
            <Vacio titulo="Sin filtros en el catálogo" texto="Agrega los filtros de aire y aceite de cada modelo para que se sugieran solos." />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th>Modelo</Th>
                  <Th>Filtro de aire</Th>
                  <Th>Filtro de aceite</Th>
                  <Th className="w-20"><span className="sr-only">Acciones</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrosVis.map((x) => (
                  <tr key={x.id}>
                    <Td className="font-medium">{x.marca}</Td>
                    <Td>{x.modelo}</Td>
                    <Td className="num">{x.filtroAire || '—'}</Td>
                    <Td className="num">{x.filtroAceite || '—'}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <BotonIcono titulo="Editar" onClick={() => setEditFil(x)}>
                          <Pencil className="h-4 w-4" />
                        </BotonIcono>
                        <BotonIcono titulo="Eliminar" onClick={() => setBorrarFil(x)}>
                          <Trash2 className="h-4 w-4" />
                        </BotonIcono>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Panel>
      )}

      {editEmp && <FormEmpresa empresa={editEmp === 'nueva' ? undefined : editEmp} onCerrar={() => setEditEmp(null)} />}
      {editFil && <FormFiltro filtro={editFil === 'nuevo' ? undefined : editFil} onCerrar={() => setEditFil(null)} />}
      {verEmp && (
        <Modal abierto onCerrar={() => setVerEmp(null)} titulo={verEmp.nombre} descripcion={verEmp.condiciones || 'Sin condiciones registradas'} ancho="lg">
          <h3 className="mb-2 text-sm font-semibold">Clientes del convenio</h3>
          <ul className="divide-y divide-linea rounded-md border border-linea">
            {clientes.filter((c) => c.empresaId === verEmp.id).length === 0 && <li className="px-4 py-3 text-sm text-gris">Sin clientes asignados.</li>}
            {clientes
              .filter((c) => c.empresaId === verEmp.id)
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">
                    {c.nombre}
                  </Link>
                  <span className="text-gris num">
                    {formatoCelular(c.celular)} · {vehiculos.filter((v) => v.clienteId === c.id).map((v) => v.placa).join(', ') || 'sin placa'}
                  </span>
                </li>
              ))}
          </ul>
        </Modal>
      )}
      <Confirmar
        abierto={!!borrarFil}
        titulo="Eliminar filtro"
        texto={`Se quitará ${borrarFil?.marca} ${borrarFil?.modelo} del catálogo.`}
        accion="Eliminar"
        onCerrar={() => setBorrarFil(null)}
        onConfirmar={async () => {
          if (borrarFil) await eliminar('filtros', borrarFil.id);
          avisar('Filtro eliminado.');
        }}
      />
    </>
  );
}

function FormEmpresa({ empresa, onCerrar }: { empresa?: Empresa; onCerrar: () => void }) {
  const { crear, editar } = useDatos();
  const avisar = useAvisos();
  const [f, setF] = useState({
    nombre: empresa?.nombre ?? '',
    ruc: empresa?.ruc ?? '',
    contacto: empresa?.contacto ?? '',
    telefono: empresa?.telefono ?? '',
    condiciones: empresa?.condiciones ?? '',
    activa: empresa?.activa ?? true,
  });
  const [error, setError] = useState('');
  const guardar = async () => {
    if (!f.nombre.trim()) return setError('Escribe el nombre de la empresa.');
    if (f.ruc && !/^\d{11}$/.test(f.ruc)) return setError('El RUC debe tener 11 dígitos.');
    if (empresa) await editar('empresas', empresa.id, f);
    else await crear('empresas', f);
    avisar(empresa ? 'Empresa actualizada.' : `${f.nombre} agregada.`);
    onCerrar();
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={empresa ? 'Editar empresa' : 'Nueva empresa con convenio'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>{empresa ? 'Guardar cambios' : 'Agregar empresa'}</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" requerido className="sm:col-span-2">
          <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="RUC">
          <Entrada inputMode="numeric" maxLength={11} value={f.ruc} onChange={(e) => setF({ ...f, ruc: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <Campo etiqueta="Persona de contacto">
          <Entrada value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <Entrada inputMode="numeric" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-rojo" checked={f.activa} onChange={(e) => setF({ ...f, activa: e.target.checked })} />
          Convenio activo
        </label>
        <Campo etiqueta="Condiciones del convenio" className="sm:col-span-2" ayuda="Descuento, precio fijo, crédito, forma de pago.">
          <AreaTexto value={f.condiciones} onChange={(e) => setF({ ...f, condiciones: e.target.value })} />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function FormFiltro({ filtro, onCerrar }: { filtro?: Filtro; onCerrar: () => void }) {
  const { crear, editar } = useDatos();
  const avisar = useAvisos();
  const [f, setF] = useState({
    marca: filtro?.marca ?? '',
    modelo: filtro?.modelo ?? '',
    filtroAire: filtro?.filtroAire ?? '',
    filtroAceite: filtro?.filtroAceite ?? '',
  });
  const [error, setError] = useState('');
  const guardar = async () => {
    if (!f.marca.trim() || !f.modelo.trim()) return setError('Marca y modelo son obligatorios.');
    if (filtro) await editar('filtros', filtro.id, f);
    else await crear('filtros', f);
    avisar('Catálogo actualizado.');
    onCerrar();
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={filtro ? 'Editar filtro' : 'Nuevo filtro'}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>Guardar</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Marca" requerido>
          <Entrada value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
        </Campo>
        <Campo etiqueta="Modelo" requerido>
          <Entrada value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Filtro de aire">
          <Entrada value={f.filtroAire} onChange={(e) => setF({ ...f, filtroAire: e.target.value })} />
        </Campo>
        <Campo etiqueta="Filtro de aceite">
          <Entrada value={f.filtroAceite} onChange={(e) => setF({ ...f, filtroAceite: e.target.value })} />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

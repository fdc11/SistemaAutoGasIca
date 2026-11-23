import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Building2, Check, Download, Pencil, Plus, Trash2, UserCheck, Wrench } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { BuscarCliente, type ClienteElegido } from '../components/BuscarCliente';
import type { AtencionConvenio, Cliente, Empresa, Filtro } from '../lib/types';
import { intervaloPorDetalle } from '../lib/catalogos';
import {
  ahoraISO,
  celularValido,
  cx,
  esNombreRelleno,
  fechaCorta,
  formatoCelular,
  hoyISO,
  normalizarCelular,
  normalizarPlaca,
  placaValida,
  plano,
  soles,
} from '../lib/utils';
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
  Selector,
  Tabla,
  Td,
  Th,
  Vacio,
  useAvisos,
} from '../components/ui';
import { BotonesExcel } from '../components/BotonesExcel';

type Vista = 'atenciones' | 'empresas' | 'filtros';
const mesActual = () => hoyISO().slice(0, 7);
const nombreMes = (ym: string) => format(parseISO(ym + '-01'), "MMMM 'de' yyyy", { locale: es });

/** Filtros del catálogo para una marca y modelo («Kia Cerato 2018» encuentra «Kia · Cerato»). */
function buscarFiltro(filtros: Filtro[], marca?: string, modelo?: string) {
  const ma = plano(marca);
  const mo = plano(modelo);
  if (!ma || !mo) return undefined;
  return (
    filtros.find((f) => plano(f.marca) === ma && plano(f.modelo) === mo) ??
    filtros.find((f) => plano(f.marca) === ma && (mo.includes(plano(f.modelo)) || plano(f.modelo).includes(mo.split(' ')[0])))
  );
}

export default function Convenios() {
  const empresas = useActivos('empresas');
  const filtros = useActivos('filtros');
  const atenciones = useActivos('atenciones');
  const { eliminar } = useDatos();
  const avisar = useAvisos();
  const [vista, setVista] = useState<Vista>('atenciones');
  const [editEmp, setEditEmp] = useState<Empresa | 'nueva' | null>(null);
  const [verEmp, setVerEmp] = useState<Empresa | null>(null);
  const [editFil, setEditFil] = useState<Filtro | 'nuevo' | null>(null);
  const [borrarFil, setBorrarFil] = useState<Filtro | null>(null);
  const [atencion, setAtencion] = useState<AtencionConvenio | 'nueva' | null>(null);
  const [q, setQ] = useState('');

  const filtrosVis = useMemo(() => {
    const t = plano(q);
    return filtros
      .filter((x) => !t || plano(`${x.marca} ${x.modelo} ${x.filtroAire} ${x.filtroAceite}`).includes(t))
      .sort((a, b) => (a.marca + a.modelo).localeCompare(b.marca + b.modelo));
  }, [filtros, q]);

  const accion =
    vista === 'atenciones' ? (
      <>
        <BotonesExcel seccion="Convenios" importar={['convenios']} />
        <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setAtencion('nueva')} disabled={empresas.length === 0}>
          Registrar atención
        </Boton>
      </>
    ) : vista === 'empresas' ? (
      <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditEmp('nueva')}>
        Nueva empresa
      </Boton>
    ) : (
      <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setEditFil('nuevo')}>
        Nuevo filtro
      </Boton>
    );

  return (
    <>
      <Encabezado
        titulo="Convenios"
        descripcion="Atenciones a vehículos de empresas con convenio, lo que se le cobra a cada empresa por mes y el catálogo de filtros por modelo."
        acciones={accion}
      />
      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { id: 'atenciones', nombre: 'Atenciones', cuenta: atenciones.length },
          { id: 'empresas', nombre: 'Empresas', cuenta: empresas.length },
          { id: 'filtros', nombre: 'Catálogo de filtros', cuenta: filtros.length },
        ]}
      />

      {vista === 'atenciones' && <TabAtenciones onEditar={setAtencion} onNueva={() => setAtencion('nueva')} />}
      {vista === 'empresas' && <TabEmpresas onVer={setVerEmp} onEditar={setEditEmp} />}
      {vista === 'filtros' && (
        <Panel sinRelleno>
          <div className="border-b border-linea p-4">
            <Buscador valor={q} onCambio={setQ} placeholder="Marca, modelo o código de filtro" className="max-w-md" />
          </div>
          {filtrosVis.length === 0 ? (
            <Vacio
              titulo="Sin filtros en el catálogo"
              texto="Se llena solo al registrar atenciones con filtros. También puedes agregarlos a mano para que se sugieran."
            />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th>Modelo</Th>
                  <Th>Filtro de aire</Th>
                  <Th>Filtro de aceite</Th>
                  <Th className="w-20">
                    <span className="sr-only">Acciones</span>
                  </Th>
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

      {atencion && <FormAtencion atencion={atencion === 'nueva' ? undefined : atencion} onCerrar={() => setAtencion(null)} />}
      {editEmp && <FormEmpresa empresa={editEmp === 'nueva' ? undefined : editEmp} onCerrar={() => setEditEmp(null)} />}
      {editFil && <FormFiltro filtro={editFil === 'nuevo' ? undefined : editFil} onCerrar={() => setEditFil(null)} />}
      {verEmp && (
        <DetalleEmpresa
          empresa={verEmp}
          onCerrar={() => setVerEmp(null)}
          onEditar={() => {
            setEditEmp(verEmp);
            setVerEmp(null);
          }}
        />
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

/* ---------------- Atenciones (la hoja del Excel) ---------------- */

function TabAtenciones({ onEditar, onNueva }: { onEditar: (a: AtencionConvenio) => void; onNueva: () => void }) {
  const atenciones = useActivos('atenciones');
  const empresas = useActivos('empresas');
  const [mes, setMes] = useState(mesActual());
  const [empresaId, setEmpresaId] = useState('');
  const [q, setQ] = useState('');
  const nombreEmp = useMemo(() => new Map(empresas.map((e) => [e.id, e.nombre])), [empresas]);

  // Meses con atenciones, para elegir rápido (más el actual)
  const meses = useMemo(() => [...new Set([mesActual(), ...atenciones.map((a) => a.fecha.slice(0, 7))])].sort().reverse(), [atenciones]);

  const lista = useMemo(() => {
    const t = plano(q);
    return atenciones
      .filter((a) => (!mes || a.fecha.startsWith(mes)) && (!empresaId || a.empresaId === empresaId))
      .filter((a) => !t || plano(`${a.nombre} ${a.celular} ${a.placa} ${a.servicio} ${a.detalle} ${a.marca} ${a.modelo}`).includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [atenciones, mes, empresaId, q]);

  const total = lista.reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const porCobrar = lista.filter((a) => a.cobro !== 'cobrado').reduce((s, a) => s + (Number(a.monto) || 0), 0);
  const sinMonto = lista.filter((a) => a.monto == null).length;
  const vehiculos = new Set(lista.map((a) => a.placa)).size;

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const filas = [...lista]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((a) => ({
        FECHA: parseISO(a.fecha),
        TELEFONO: a.celular,
        'NOMBRE COMPLETO/CONTACTO': a.nombre,
        EMPRESA: nombreEmp.get(a.empresaId) ?? '',
        SERVICIO: a.servicio,
        INTERES: a.detalle ?? '',
        PLACA: a.placa,
        MARCA: a.marca ?? '',
        'MODELO Y AÑO': a.modelo ?? '',
        'FILTRO DE AIRE': a.filtroAire ?? '',
        'FILTRO DE ACEITE': a.filtroAceite ?? '',
        KM: a.kmActual ?? '',
        MONTO: a.monto ?? '',
        COBRO: a.cobro === 'cobrado' ? 'Cobrado' : 'Pendiente',
      }));
    const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ 'Sin datos': 'No hay atenciones con esos filtros' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = Object.keys(filas[0] ?? { x: '' }).map((k) => ({ wch: Math.max(10, k.length + 2) }));
    if (filas.length) XLSX.utils.sheet_add_aoa(ws, [['', '', '', '', '', '', '', '', '', '', '', 'TOTAL', total]], { origin: -1 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CONVENIOS');
    const emp = empresaId ? nombreEmp.get(empresaId)!.replace(/[^\w]+/g, '_') + '_' : '';
    XLSX.writeFile(wb, `Convenios_${emp}${mes || 'todo'}.xlsx`, { cellDates: true });
  };

  return (
    <Panel sinRelleno>
      <div className="flex flex-wrap items-end gap-3 border-b border-linea p-4">
        <Campo etiqueta="Mes" className="w-44">
          <Selector value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m} className="capitalize">
                {nombreMes(m)}
              </option>
            ))}
            <option value="">Todos los meses</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Empresa" className="w-52">
          <Selector value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Todas</option>
            {[...empresas]
              .sort((a, b) => a.nombre.localeCompare(b.nombre))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
          </Selector>
        </Campo>
        <Buscador valor={q} onCambio={setQ} placeholder="Cliente, placa o servicio" className="min-w-[200px] flex-1" />
        <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={exportar} disabled={lista.length === 0}>
          Exportar para cobrar
        </Boton>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-linea bg-linea sm:grid-cols-4">
        {[
          ['Atenciones', String(lista.length)],
          ['Vehículos atendidos', String(vehiculos)],
          ['Total del periodo', soles(total)],
          ['Por cobrar', soles(porCobrar)],
        ].map(([t, v]) => (
          <div key={t} className="bg-white px-4 py-3">
            <p className="text-xs text-gris">{t}</p>
            <p className={cx('font-display text-2xl font-bold num', t === 'Por cobrar' && porCobrar > 0 && 'text-rojo')}>{v}</p>
          </div>
        ))}
      </div>
      {sinMonto > 0 && (
        <p className="border-b border-linea bg-aviso-suave px-4 py-2 text-[13px] text-aviso">
          {sinMonto} {sinMonto === 1 ? 'atención' : 'atenciones'} sin monto (las importadas del Excel no lo tenían). Ábrelas para completarlo y que cuenten en el cobro.
        </p>
      )}

      {lista.length === 0 ? (
        <Vacio
          icono={<Wrench className="h-8 w-8" />}
          titulo={atenciones.length === 0 ? 'Aún no hay atenciones de convenio' : 'No hay atenciones con esos filtros'}
          texto={
            atenciones.length === 0
              ? 'Registra aquí cada carro de empresa que atiendas, o importa la hoja de convenios con el botón «Importar».'
              : 'Prueba con otro mes o con «Todos los meses».'
          }
          accion={atenciones.length === 0 ? <Boton onClick={onNueva}>Registrar atención</Boton> : undefined}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Empresa</Th>
              <Th>Vehículo</Th>
              <Th>Servicio</Th>
              <Th>Filtros (aire · aceite)</Th>
              <Th className="text-right">Monto</Th>
              <Th>Cobro</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-[#FAFAFB]" onClick={() => onEditar(a)}>
                <Td className="whitespace-nowrap num">{fechaCorta(a.fecha)}</Td>
                <Td>
                  <p className="font-semibold">{a.nombre || <span className="text-gris">Sin nombre</span>}</p>
                  <p className="text-[13px] text-gris num">{a.celular ? formatoCelular(a.celular) : 'Sin celular'}</p>
                </Td>
                <Td className="whitespace-nowrap">{nombreEmp.get(a.empresaId) ?? '—'}</Td>
                <Td>
                  <p className="font-display font-semibold tracking-wide num">{a.placa || '—'}</p>
                  <p className="text-[13px] text-gris">{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</p>
                </Td>
                <Td>
                  <p className="font-medium">{a.servicio}</p>
                  {a.detalle && a.detalle !== a.servicio && <p className="text-[13px] text-gris">{a.detalle}</p>}
                </Td>
                <Td className="text-[13px] num">
                  {a.filtroAire || a.filtroAceite ? (
                    <>
                      <p>{a.filtroAire || '—'}</p>
                      <p className="text-gris">{a.filtroAceite || '—'}</p>
                    </>
                  ) : (
                    <span className="text-gris">—</span>
                  )}
                </Td>
                <Td className="text-right num">{a.monto != null ? soles(a.monto) : <span className="text-aviso">Falta</span>}</Td>
                <Td>{a.cobro === 'cobrado' ? <Etiqueta tono="ok">Cobrado</Etiqueta> : <Etiqueta tono="aviso">Pendiente</Etiqueta>}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </Panel>
  );
}

/* ---------------- Empresas ---------------- */

function useResumenEmpresas() {
  const empresas = useActivos('empresas');
  const clientes = useActivos('clientes');
  const vehiculos = useActivos('vehiculos');
  const atenciones = useActivos('atenciones');
  return useMemo(() => {
    const m = new Map<string, { clientes: Cliente[]; placas: Set<string>; atenciones: AtencionConvenio[]; mes: number; porCobrar: number; ultimo?: string }>();
    const mes = mesActual();
    for (const e of empresas) {
      const at = atenciones.filter((a) => a.empresaId === e.id);
      const ids = new Set([...clientes.filter((c) => c.empresaId === e.id).map((c) => c.id), ...at.map((a) => a.clienteId).filter(Boolean) as string[]]);
      const placas = new Set([
        ...vehiculos.filter((v) => v.empresaId === e.id || (v.clienteId && ids.has(v.clienteId))).map((v) => v.placa),
        ...at.map((a) => a.placa).filter(Boolean),
      ]);
      m.set(e.id, {
        clientes: clientes.filter((c) => ids.has(c.id)),
        placas,
        atenciones: at,
        mes: at.filter((a) => a.fecha.startsWith(mes)).length,
        porCobrar: at.filter((a) => a.cobro !== 'cobrado').reduce((s, a) => s + (Number(a.monto) || 0), 0),
        ultimo: at.map((a) => a.fecha).sort().at(-1),
      });
    }
    return m;
  }, [empresas, clientes, vehiculos, atenciones]);
}

function TabEmpresas({ onVer, onEditar }: { onVer: (e: Empresa) => void; onEditar: (e: Empresa | 'nueva') => void }) {
  const empresas = useActivos('empresas');
  const resumen = useResumenEmpresas();
  return (
    <Panel sinRelleno>
      {empresas.length === 0 ? (
        <Vacio icono={<Building2 className="h-8 w-8" />} titulo="Sin empresas con convenio" accion={<Boton onClick={() => onEditar('nueva')}>Agregar empresa</Boton>} />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Contacto</Th>
              <Th className="text-right">Clientes</Th>
              <Th className="text-right">Vehículos</Th>
              <Th className="text-right">Atenciones este mes</Th>
              <Th className="text-right">Por cobrar</Th>
              <Th>Última atención</Th>
              <Th>Estado</Th>
              <Th className="w-12">
                <span className="sr-only">Editar</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {[...empresas]
              .sort((a, b) => a.nombre.localeCompare(b.nombre))
              .map((e) => {
                const r = resumen.get(e.id)!;
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-[#FAFAFB]" onClick={() => onVer(e)}>
                    <Td>
                      <p className="font-semibold">{e.nombre}</p>
                      {e.ruc && <p className="text-[13px] text-gris num">RUC {e.ruc}</p>}
                    </Td>
                    <Td>
                      {e.contacto || '—'}
                      {e.telefono && <p className="text-[13px] text-gris num">{formatoCelular(e.telefono)}</p>}
                    </Td>
                    <Td className="text-right num">{r.clientes.length}</Td>
                    <Td className="text-right num">{r.placas.size}</Td>
                    <Td className="text-right num">{r.mes}</Td>
                    <Td className={cx('text-right num', r.porCobrar > 0 && 'font-semibold text-rojo')}>{soles(r.porCobrar)}</Td>
                    <Td className="num">{fechaCorta(r.ultimo)}</Td>
                    <Td>{e.activa ? <Etiqueta tono="ok">Activo</Etiqueta> : <Etiqueta>Inactivo</Etiqueta>}</Td>
                    <Td onClick={(ev) => ev.stopPropagation()}>
                      <BotonIcono titulo="Editar empresa" onClick={() => onEditar(e)}>
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
  );
}

function DetalleEmpresa({ empresa, onCerrar, onEditar }: { empresa: Empresa; onCerrar: () => void; onEditar: () => void }) {
  const r = useResumenEmpresas().get(empresa.id);
  const vehiculos = useActivos('vehiculos');
  const { editar } = useDatos();
  const avisar = useAvisos();
  if (!r) return null;

  const porMes = [...new Set(r.atenciones.map((a) => a.fecha.slice(0, 7)))]
    .sort()
    .reverse()
    .map((m) => {
      const xs = r.atenciones.filter((a) => a.fecha.startsWith(m));
      return {
        mes: m,
        n: xs.length,
        total: xs.reduce((s, a) => s + (Number(a.monto) || 0), 0),
        pendientes: xs.filter((a) => a.cobro !== 'cobrado'),
      };
    });
  const ultimaDe = (clienteId: string) =>
    r.atenciones
      .filter((a) => a.clienteId === clienteId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

  const cobrarMes = async (ids: string[], mes: string) => {
    const ahora = ahoraISO();
    for (const id of ids) await editar('atenciones', id, { cobro: 'cobrado', cobradoEn: ahora });
    avisar(`${nombreMes(mes).replace(/^./, (c) => c.toUpperCase())} marcado como cobrado.`);
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={empresa.nombre}
      descripcion={[empresa.ruc && `RUC ${empresa.ruc}`, empresa.contacto, empresa.telefono && formatoCelular(empresa.telefono)].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
      ancho="lg"
      pie={
        <>
          <Boton variante="secundario" className="mr-auto" icono={<Pencil className="h-4 w-4" />} onClick={onEditar}>
            Editar empresa
          </Boton>
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        </>
      }
    >
      <div className="mb-5 rounded-md bg-fondo px-3 py-2.5 text-sm">
        <span className="text-gris">Condiciones: </span>
        {empresa.condiciones || <span className="text-gris">no registradas. Edita la empresa para anotar el descuento o precio pactado.</span>}
      </div>

      <h3 className="mb-2 text-sm font-semibold">Cobro por mes</h3>
      {porMes.length === 0 ? (
        <p className="mb-5 rounded-md border border-linea px-4 py-3 text-sm text-gris">Sin atenciones registradas.</p>
      ) : (
        <ul className="mb-5 divide-y divide-linea rounded-md border border-linea">
          {porMes.map((m) => (
            <li key={m.mes} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-36 font-medium first-letter:uppercase">{nombreMes(m.mes)}</span>
              <span className="text-gris num">
                {m.n} {m.n === 1 ? 'atención' : 'atenciones'} · {soles(m.total)}
              </span>
              <span className="ml-auto">
                {m.pendientes.length === 0 ? (
                  <Etiqueta tono="ok">Cobrado</Etiqueta>
                ) : (
                  <Boton tam="sm" variante="secundario" icono={<Check className="h-3.5 w-3.5" />} onClick={() => cobrarMes(m.pendientes.map((a) => a.id), m.mes)}>
                    Marcar cobrado ({m.pendientes.length})
                  </Boton>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-semibold">Clientes y vehículos ({r.clientes.length})</h3>
      <ul className="divide-y divide-linea rounded-md border border-linea">
        {r.clientes.length === 0 && <li className="px-4 py-3 text-sm text-gris">Sin clientes. Se agregan solos al registrar o importar atenciones.</li>}
        {r.clientes
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
          .map((c) => {
            const u = ultimaDe(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">
                  {esNombreRelleno(c.nombre) ? 'Sin nombre' : c.nombre}
                </Link>
                <span className="text-gris num">
                  {[c.celular && formatoCelular(c.celular), vehiculos.filter((v) => v.clienteId === c.id).map((v) => v.placa).join(', ') || 'sin placa']
                    .filter(Boolean)
                    .join(' · ')}
                  {u && ` · último: ${fechaCorta(u.fecha)} (${u.servicio.toLowerCase()})`}
                </span>
              </li>
            );
          })}
      </ul>
    </Modal>
  );
}

/* ---------------- Registrar / editar atención ---------------- */

function FormAtencion({ atencion, onCerrar }: { atencion?: AtencionConvenio; onCerrar: () => void }) {
  const { crear, editar, eliminar, datos, listas } = useDatos();
  const { registrar } = useAcciones();
  const avisar = useAvisos();
  const empresas = useActivos('empresas').filter((e) => e.activa || e.id === atencion?.empresaId);
  const filtros = useActivos('filtros');
  const productosAceite = useActivos('productos').filter((p) => p.categoria === 'aceite');
  const [elegido, setElegido] = useState<Cliente | null>(() => (atencion?.clienteId ? datos.clientes.find((c) => c.id === atencion.clienteId) ?? null : null));
  const [placasCliente, setPlacasCliente] = useState<string[]>([]);
  const [f, setF] = useState({
    fecha: atencion?.fecha ?? hoyISO(),
    empresaId: atencion?.empresaId ?? (empresas.length === 1 ? empresas[0].id : ''),
    nombre: atencion?.nombre ?? '',
    celular: atencion?.celular ?? '',
    placa: atencion?.placa ?? '',
    marca: atencion?.marca ?? '',
    modelo: atencion?.modelo ?? '',
    servicio: atencion?.servicio ?? 'Cambio de aceite',
    detalle: atencion?.detalle ?? '',
    filtroAire: atencion?.filtroAire ?? '',
    filtroAceite: atencion?.filtroAceite ?? '',
    km: atencion?.kmActual != null ? String(atencion.kmActual) : '',
    monto: atencion?.monto != null ? String(atencion.monto) : '',
    cobro: atencion?.cobro ?? 'pendiente',
    notas: atencion?.notas ?? '',
  });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const p = normalizarPlaca(f.placa);
  const cel = normalizarCelular(f.celular);
  const sugerido = buscarFiltro(filtros, f.marca, f.modelo);
  const esAceite = f.servicio === 'Cambio de aceite';

  // Al escribir una placa conocida, completa marca, modelo y dueño
  const alCambiarPlaca = (valor: string) => {
    set('placa', valor.toUpperCase());
    const pl = normalizarPlaca(valor);
    if (!placaValida(pl)) return;
    const v = datos.vehiculos.find((x) => x.placa === pl && !x.eliminado);
    if (!v) return;
    setF((x) => ({ ...x, placa: valor.toUpperCase(), marca: x.marca || v.marca || '', modelo: x.modelo || [v.modelo, v.anio].filter(Boolean).join(' ') }));
    const c = v.clienteId ? datos.clientes.find((x) => x.id === v.clienteId && !x.eliminado) : undefined;
    if (c && !elegido) elegirCliente({ cliente: c, placas: datos.vehiculos.filter((x) => x.clienteId === c.id && !x.eliminado).map((x) => x.placa) }, pl);
  };

  const elegirCliente = ({ cliente, placas }: ClienteElegido, placaFija?: string) => {
    setElegido(cliente);
    setPlacasCliente(placas);
    const pl = placaFija ?? (placas.length === 1 ? placas[0] : '');
    const v = pl ? datos.vehiculos.find((x) => x.placa === pl && !x.eliminado) : undefined;
    setF((x) => ({
      ...x,
      nombre: esNombreRelleno(cliente.nombre) ? '' : cliente.nombre,
      celular: cliente.celular || '',
      empresaId: x.empresaId || cliente.empresaId || '',
      placa: pl || x.placa,
      marca: v?.marca || x.marca,
      modelo: v ? [v.modelo, v.anio].filter(Boolean).join(' ') : x.modelo,
    }));
  };

  const guardar = async () => {
    setError('');
    if (!f.empresaId) return setError('Elige la empresa del convenio.');
    if (!f.fecha) return setError('Pon la fecha de la atención.');
    if (!elegido && !f.nombre.trim()) return setError('Escribe el nombre del conductor o cliente.');
    if (f.celular && !celularValido(cel)) return setError('El celular debe tener 9 dígitos y empezar en 9.');
    if (!placaValida(p)) return setError('Escribe la placa (6 caracteres).');
    if (!f.servicio) return setError('Elige el servicio.');
    if (f.monto && isNaN(Number(f.monto))) return setError('El monto debe ser un número.');
    setGuardando(true);
    try {
      const empresa = empresas.find((e) => e.id === f.empresaId)!;
      const nombre = f.nombre.trim();
      const km = Number(f.km) || undefined;
      const aire = f.filtroAire.trim() || sugerido?.filtroAire || '';
      const aceiteF = f.filtroAceite.trim() || sugerido?.filtroAceite || '';

      // 1. Cliente: el elegido o uno nuevo (queda en la base con su empresa)
      let clienteId = elegido?.id;
      if (elegido) {
        const patch: Partial<Cliente> = {};
        if (nombre && nombre !== elegido.nombre) patch.nombre = nombre;
        if (cel && cel !== elegido.celular) patch.celular = cel;
        if (!elegido.empresaId) {
          patch.empresaId = f.empresaId;
          patch.canal = 'convenio';
        }
        if (!atencion && elegido.estado !== 'atendido') patch.estado = 'atendido';
        if (Object.keys(patch).length) await editar('clientes', elegido.id, patch);
      } else {
        const r = await registrar({
          nombre,
          celular: cel,
          canal: 'convenio',
          empresaId: f.empresaId,
          placa: p,
          marca: f.marca.trim() || undefined,
          modelo: f.modelo.trim() || undefined,
          interes: f.servicio,
          estado: 'atendido',
          tipoInteraccion: 'presencial',
          comentario: `Convenio ${empresa.nombre}: ${f.servicio}${f.detalle ? ` (${f.detalle.trim()})` : ''}`,
        });
        clienteId = r.clienteId;
        const existente = datos.clientes.find((c) => c.id === clienteId);
        if (existente && !existente.empresaId) await editar('clientes', clienteId, { empresaId: f.empresaId, canal: 'convenio' });
      }

      // 2. Vehículo
      let v = datos.vehiculos.find((x) => x.placa === p && !x.eliminado);
      let vehiculoId = v?.id;
      if (!v) {
        vehiculoId = await crear('vehiculos', { placa: p, marca: f.marca.trim() || undefined, modelo: f.modelo.trim() || undefined, clienteId, empresaId: f.empresaId });
      } else {
        const patch: Record<string, string> = {};
        if (!v.clienteId && clienteId) patch.clienteId = clienteId;
        if (!v.empresaId) patch.empresaId = f.empresaId;
        if (!v.marca && f.marca.trim()) patch.marca = f.marca.trim();
        if (!v.modelo && f.modelo.trim()) patch.modelo = f.modelo.trim();
        if (Object.keys(patch).length) await editar('vehiculos', v.id, patch);
      }

      // 3. Catálogo de filtros: si es un modelo nuevo, se aprende solo
      if (f.marca.trim() && f.modelo.trim() && (aire || aceiteF) && !sugerido) {
        await crear('filtros', { marca: f.marca.trim(), modelo: f.modelo.trim(), filtroAire: aire || undefined, filtroAceite: aceiteF || undefined });
      }

      // 4. Si fue cambio de aceite, también entra a Cambio de aceite (para el recordatorio del próximo)
      const intervalo = intervaloPorDetalle(f.detalle);
      const datosAceite = {
        fecha: f.fecha,
        placa: p,
        vehiculoId,
        clienteId,
        detalle: f.detalle.trim() || 'Cambio de aceite (convenio)',
        kmActual: km,
        intervaloKm: intervalo,
        kmProximo: km && intervalo ? km + intervalo : undefined,
        monto: Number(f.monto) || 0,
        celular: cel || undefined,
        sede: 'Ica',
      };
      let servicioAceiteId = atencion?.servicioAceiteId;
      if (esAceite) {
        if (servicioAceiteId) await editar('serviciosAceite', servicioAceiteId, datosAceite);
        else servicioAceiteId = await crear('serviciosAceite', datosAceite);
      } else if (servicioAceiteId) {
        await eliminar('serviciosAceite', servicioAceiteId);
        servicioAceiteId = undefined;
      }

      // 5. La atención
      const doc = {
        fecha: f.fecha,
        empresaId: f.empresaId,
        clienteId,
        vehiculoId,
        placa: p,
        nombre: nombre || (elegido && !esNombreRelleno(elegido.nombre) ? elegido.nombre : ''),
        celular: cel || elegido?.celular || '',
        servicio: f.servicio,
        detalle: f.detalle.trim() || undefined,
        marca: f.marca.trim() || undefined,
        modelo: f.modelo.trim() || undefined,
        filtroAire: aire || undefined,
        filtroAceite: aceiteF || undefined,
        kmActual: km,
        monto: f.monto ? Number(f.monto) : undefined,
        cobro: f.cobro,
        cobradoEn: f.cobro === 'cobrado' ? atencion?.cobradoEn ?? ahoraISO() : undefined,
        notas: f.notas.trim() || undefined,
        servicioAceiteId,
      };
      if (atencion) await editar('atenciones', atencion.id, doc);
      else {
        await crear('atenciones', doc);
        if (elegido && clienteId) {
          await crear('interacciones', {
            clienteId,
            fecha: ahoraISO(),
            tipo: 'presencial',
            comentario: `Convenio ${empresa.nombre}: ${f.servicio}${f.detalle ? ` (${f.detalle.trim()})` : ''} · ${p}`,
          });
        }
      }
      avisar(atencion ? 'Atención actualizada.' : `Atención de ${p} registrada para ${empresa.nombre}.`);
      onCerrar();
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar. Revisa la conexión e inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={atencion ? 'Atención de convenio' : 'Registrar atención de convenio'}
      descripcion={atencion ? `Registrada por ${atencion.creadoPor} el ${fechaCorta(atencion.creadoEn)}` : 'Un carro de empresa atendido en el taller.'}
      ancho="lg"
      pie={
        <>
          {atencion && (
            <Boton variante="peligro" className="mr-auto" onClick={() => setBorrar(true)}>
              Eliminar
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : atencion ? 'Guardar cambios' : 'Registrar atención'}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Campo etiqueta="Empresa" requerido>
            <Selector value={f.empresaId} onChange={(e) => set('empresaId', e.target.value)}>
              <option value="">Elegir</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha" requerido>
            <Entrada type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </Campo>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gris">Cliente o conductor</legend>
          {elegido ? (
            <div className="flex items-center gap-3 rounded-md border border-ok/30 bg-ok-suave px-3 py-2.5">
              <UserCheck className="h-4 w-4 shrink-0 text-ok" />
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{esNombreRelleno(elegido.nombre) ? 'Cliente sin nombre' : elegido.nombre}</span>
                <span className="text-gris"> · ya está en la base</span>
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-gris hover:text-tinta"
                onClick={() => {
                  setElegido(null);
                  setPlacasCliente([]);
                }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <BuscarCliente
              onElegir={(e) => elegirCliente(e)}
              placeholder="Buscar en la base: nombre, celular o placa"
              vacio="No está en la base. Llena sus datos abajo y se registrará solo con su empresa."
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" requerido={!elegido}>
              <Entrada value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
            </Campo>
            <Campo etiqueta="Celular">
              <Entrada value={f.celular} onChange={(e) => set('celular', e.target.value)} inputMode="tel" invalido={!!f.celular && !celularValido(cel)} />
            </Campo>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gris">Vehículo</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Placa" requerido>
              <Entrada value={f.placa} onChange={(e) => alCambiarPlaca(e.target.value)} invalido={!!f.placa && !placaValida(p)} />
              {placasCliente.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {placasCliente.map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => alCambiarPlaca(x)}
                      className={cx('rounded border px-2 py-0.5 font-display text-xs font-semibold tracking-wide', p === x ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte text-gris')}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              )}
            </Campo>
            <Campo etiqueta="Marca">
              <Entrada value={f.marca} onChange={(e) => set('marca', e.target.value)} />
            </Campo>
            <Campo etiqueta="Modelo y año">
              <Entrada value={f.modelo} onChange={(e) => set('modelo', e.target.value)} />
            </Campo>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-gris">Servicio</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Servicio" requerido>
              <Selector value={f.servicio} onChange={(e) => set('servicio', e.target.value)}>
                {listas.servicios.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta={esAceite ? 'Aceite usado' : 'Detalle'}>
              <Entrada
                value={f.detalle}
                onChange={(e) => set('detalle', e.target.value)}
                list={esAceite ? 'aceites-convenio' : undefined}
              />
              <datalist id="aceites-convenio">
                {productosAceite.map((x) => (
                  <option key={x.id} value={`${x.nombre} ${x.variante ?? ''}`.trim()} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Filtro de aire" ayuda={sugerido?.filtroAire && !f.filtroAire ? `Del catálogo: ${sugerido.filtroAire}` : undefined}>
              <Entrada value={f.filtroAire} onChange={(e) => set('filtroAire', e.target.value)} />
            </Campo>
            <Campo etiqueta="Filtro de aceite" ayuda={sugerido?.filtroAceite && !f.filtroAceite ? `Del catálogo: ${sugerido.filtroAceite}` : undefined}>
              <Entrada value={f.filtroAceite} onChange={(e) => set('filtroAceite', e.target.value)} />
            </Campo>
            {esAceite && (
              <Campo etiqueta="Kilometraje" ayuda="Sirve para calcular el próximo cambio.">
                <Entrada value={f.km} onChange={(e) => set('km', e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
              </Campo>
            )}
            <Campo etiqueta="Monto (S/)" ayuda="Lo que se le cobrará a la empresa.">
              <Entrada value={f.monto} onChange={(e) => set('monto', e.target.value)} inputMode="decimal" />
            </Campo>
            <Campo etiqueta="Cobro">
              <Selector value={f.cobro} onChange={(e) => set('cobro', e.target.value as typeof f.cobro)}>
                <option value="pendiente">Pendiente</option>
                <option value="cobrado">Cobrado</option>
              </Selector>
            </Campo>
          </div>
          {esAceite && <p className="mt-2 text-xs text-gris">También queda registrado en Cambio de aceite, para recordarle el próximo cambio.</p>}
        </fieldset>

        <Campo etiqueta="Notas">
          <AreaTexto value={f.notas} onChange={(e) => set('notas', e.target.value)} className="min-h-[60px]" />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
      <Confirmar
        abierto={borrar}
        titulo="Eliminar atención"
        texto="Se quitará esta atención del registro del convenio."
        accion="Eliminar"
        onCerrar={() => setBorrar(false)}
        onConfirmar={async () => {
          if (!atencion) return;
          await eliminar('atenciones', atencion.id);
          if (atencion.servicioAceiteId) await eliminar('serviciosAceite', atencion.servicioAceiteId);
          avisar('Atención eliminada.');
          onCerrar();
        }}
      />
    </Modal>
  );
}

/* ---------------- Formularios de empresa y filtro ---------------- */

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

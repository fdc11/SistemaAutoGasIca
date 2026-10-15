import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Pencil, Plus } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { CATEGORIAS, nombreCategoria } from '../lib/catalogos';
import type { CategoriaProducto, Producto } from '../lib/types';
import { cx, fechaCorta, hoyISO, normalizarPlaca, plano, soles } from '../lib/utils';
import {
  Boton,
  BotonIcono,
  Buscador,
  Campo,
  Encabezado,
  Entrada,
  Etiqueta,
  Modal,
  Paginacion,
  Panel,
  Pestanas,
  Selector,
  Tabla,
  Td,
  Th,
  Vacio,
  useAvisos,
} from '../components/ui';

const orden = (c: string) => CATEGORIAS.findIndex((x) => x.id === c);

const TIPOS_VENTA = ['Instalación en taller', 'Venta directa', 'Venta externa', 'Garantía', 'Ajuste de inventario'];

export default function Inventario() {
  const productos = useActivos('productos');
  const movimientos = useActivos('movimientos');
  const [vista, setVista] = useState<'stock' | 'movimientos'>('stock');
  const [cat, setCat] = useState<CategoriaProducto | ''>('');
  const [q, setQ] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);
  const [mov, setMov] = useState<{ tipo: 'entrada' | 'salida'; producto?: Producto } | null>(null);
  const [prod, setProd] = useState<Producto | 'nuevo' | null>(null);
  const [pagina, setPagina] = useState(1);

  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of movimientos) m.set(x.productoId, (m.get(x.productoId) ?? 0) + (x.tipo === 'entrada' ? 1 : -1) * Number(x.cantidad || 0));
    return m;
  }, [movimientos]);

  const sinAceites = productos.filter((p) => p.categoria !== 'aceite');
  const bajos = sinAceites.filter((p) => (stock.get(p.id) ?? 0) < p.stockMinimo && p.stockMinimo > 0);

  const lista = useMemo(() => {
    const t = plano(q);
    return productos
      .filter((p) => (cat ? p.categoria === cat : true))
      .filter((p) => !t || plano(`${p.nombre} ${p.variante}`).includes(t))
      .filter((p) => !soloBajo || ((stock.get(p.id) ?? 0) < p.stockMinimo && p.stockMinimo > 0))
      .sort((a, b) => orden(a.categoria) - orden(b.categoria) || a.nombre.localeCompare(b.nombre) || (a.variante ?? '').localeCompare(b.variante ?? '', 'es', { numeric: true }));
  }, [productos, cat, q, soloBajo, stock]);

  const movs = useMemo(() => [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn)), [movimientos]);
  const nombreProd = (id: string) => {
    const p = productos.find((x) => x.id === id);
    return p ? `${p.nombre}${p.variante ? ' · ' + p.variante : ''}` : 'Producto eliminado';
  };

  const categoriasUsadas = CATEGORIAS.filter((c) => productos.some((p) => p.categoria === c.id));

  return (
    <>
      <Encabezado
        titulo="Inventario"
        descripcion="El stock se calcula con las entradas y salidas. Cada salida queda ligada a la placa del vehículo o a la venta."
        acciones={
          <>
            <Boton variante="secundario" icono={<ArrowDownToLine className="h-4 w-4" />} onClick={() => setMov({ tipo: 'entrada' })}>
              Registrar entrada
            </Boton>
            <Boton icono={<ArrowUpFromLine className="h-4 w-4" />} onClick={() => setMov({ tipo: 'salida' })}>
              Registrar salida
            </Boton>
          </>
        }
      />

      {bajos.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setVista('stock');
            setSoloBajo(true);
            setCat('');
          }}
          className="mb-5 flex w-full items-center justify-between rounded-lg border border-rojo/25 bg-rojo-suave px-4 py-3 text-left text-sm text-rojo-osc"
        >
          <span>
            <strong>{bajos.length}</strong> {bajos.length === 1 ? 'producto está' : 'productos están'} por debajo de su stock mínimo.
          </span>
          <span className="font-semibold underline underline-offset-2">Ver cuáles</span>
        </button>
      )}

      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={(v) => {
          setVista(v);
          setPagina(1);
        }}
        opciones={[
          { id: 'stock', nombre: 'Stock actual', cuenta: productos.length },
          { id: 'movimientos', nombre: 'Movimientos', cuenta: movimientos.length },
        ]}
      />

      {vista === 'stock' ? (
        <Panel sinRelleno>
          <div className="flex flex-col gap-3 border-b border-linea p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              <Chip activo={!cat} onClick={() => setCat('')}>
                Todo
              </Chip>
              {categoriasUsadas.map((c) => (
                <Chip key={c.id} activo={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.nombre}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gris">
                <input type="checkbox" className="h-4 w-4 accent-rojo" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} />
                Solo stock bajo
              </label>
              <Buscador valor={q} onCambio={setQ} placeholder="Buscar producto" className="w-56" />
              <Boton variante="secundario" icono={<Plus className="h-4 w-4" />} onClick={() => setProd('nuevo')}>
                Producto
              </Boton>
            </div>
          </div>
          {lista.length === 0 ? (
            <Vacio icono={<Boxes className="h-8 w-8" />} titulo="Sin productos para mostrar" texto="Agrega productos o carga el catálogo inicial desde Ajustes." />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Medida o variante</Th>
                  <Th>Categoría</Th>
                  <Th className="text-right">Stock</Th>
                  <Th className="text-right">Mínimo</Th>
                  <Th>Estado</Th>
                  <Th className="text-right">Movimiento</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const s = stock.get(p.id) ?? 0;
                  const bajo = p.stockMinimo > 0 && s < p.stockMinimo;
                  const aceite = p.categoria === 'aceite';
                  return (
                    <tr key={p.id}>
                      <Td className="font-semibold">{p.nombre}</Td>
                      <Td>{p.variante || '—'}</Td>
                      <Td className="text-gris">{nombreCategoria(p.categoria)}</Td>
                      <Td className={cx('text-right font-display text-lg font-bold num', s === 0 ? 'text-gris-claro' : bajo ? 'text-rojo' : '')}>{aceite && s === 0 ? '—' : s}</Td>
                      <Td className="text-right num text-gris">{p.stockMinimo || '—'}</Td>
                      <Td>
                        {aceite ? (
                          <span className="text-[13px] text-gris">{p.intervaloKm ? `Cambio cada ${p.intervaloKm.toLocaleString('es-PE')} km` : ''}</span>
                        ) : s === 0 ? (
                          <Etiqueta>Agotado</Etiqueta>
                        ) : bajo ? (
                          <Etiqueta tono="rojo">Reponer</Etiqueta>
                        ) : (
                          <Etiqueta tono="ok">Disponible</Etiqueta>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <BotonIcono titulo="Entrada" onClick={() => setMov({ tipo: 'entrada', producto: p })}>
                            <ArrowDownToLine className="h-4 w-4" />
                          </BotonIcono>
                          <BotonIcono titulo="Salida" onClick={() => setMov({ tipo: 'salida', producto: p })} disabled={s <= 0} className="disabled:opacity-30">
                            <ArrowUpFromLine className="h-4 w-4" />
                          </BotonIcono>
                          <BotonIcono titulo="Editar producto" onClick={() => setProd(p)}>
                            <Pencil className="h-4 w-4" />
                          </BotonIcono>
                        </div>
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
          {movs.length === 0 ? (
            <Vacio titulo="Sin movimientos" texto="Registra entradas cuando llegue mercadería y salidas cuando se instale o venda." />
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th>Producto</Th>
                    <Th className="text-right">Cantidad</Th>
                    <Th>Placa o DNI</Th>
                    <Th>Motivo</Th>
                    <Th>Registró</Th>
                  </tr>
                </thead>
                <tbody>
                  {movs.slice((pagina - 1) * 30, pagina * 30).map((m) => (
                    <tr key={m.id}>
                      <Td className="num">{fechaCorta(m.fecha)}</Td>
                      <Td>{m.tipo === 'entrada' ? <Etiqueta tono="ok">Entrada</Etiqueta> : <Etiqueta tono="info">Salida</Etiqueta>}</Td>
                      <Td>{nombreProd(m.productoId)}</Td>
                      <Td className="text-right font-semibold num">{m.tipo === 'entrada' ? '+' : '−'}{m.cantidad}</Td>
                      <Td className="num">{m.referencia || '—'}</Td>
                      <Td className="text-gris">{[m.tipoVenta, m.nota].filter(Boolean).join(' · ') || '—'}</Td>
                      <Td className="text-gris">{m.creadoPor}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Paginacion pagina={pagina} total={movs.length} porPagina={30} onCambio={setPagina} />
            </>
          )}
        </Panel>
      )}

      {mov && <FormMovimiento tipo={mov.tipo} producto={mov.producto} stock={stock} onCerrar={() => setMov(null)} />}
      {prod && <FormProducto producto={prod === 'nuevo' ? undefined : prod} onCerrar={() => setProd(null)} />}
    </>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-full border px-3 py-1 text-[13px] font-semibold', activo ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta')}
    >
      {children}
    </button>
  );
}

function FormMovimiento({
  tipo,
  producto,
  stock,
  onCerrar,
}: {
  tipo: 'entrada' | 'salida';
  producto?: Producto;
  stock: Map<string, number>;
  onCerrar: () => void;
}) {
  const { crear } = useDatos();
  const productos = useActivos('productos');
  const avisar = useAvisos();
  const [f, setF] = useState({
    productoId: producto?.id ?? '',
    cantidad: '1',
    referencia: '',
    tipoVenta: tipo === 'salida' ? TIPOS_VENTA[0] : '',
    nota: '',
    fecha: hoyISO(),
  });
  const [error, setError] = useState('');
  const disponible = stock.get(f.productoId) ?? 0;
  const guardar = async () => {
    const n = Number(f.cantidad);
    if (!f.productoId) return setError('Elige el producto.');
    if (!n || n <= 0) return setError('La cantidad debe ser mayor a cero.');
    if (tipo === 'salida' && n > disponible) return setError(`Solo hay ${disponible} en stock. Registra primero la entrada.`);
    const ref = f.referencia.trim();
    await crear('movimientos', {
      productoId: f.productoId,
      tipo,
      cantidad: n,
      referencia: ref ? (/^\d{8}$/.test(ref) ? ref : normalizarPlaca(ref)) : undefined,
      tipoVenta: f.tipoVenta || undefined,
      nota: f.nota || undefined,
      fecha: f.fecha,
    });
    avisar(tipo === 'entrada' ? 'Entrada registrada.' : 'Salida registrada.');
    onCerrar();
  };
  const grupos = CATEGORIAS.map((c) => ({ ...c, items: productos.filter((p) => p.categoria === c.id) })).filter((g) => g.items.length);
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>{tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Producto" requerido className="sm:col-span-2" ayuda={f.productoId ? `Stock actual: ${disponible}` : undefined}>
          <Selector value={f.productoId} onChange={(e) => setF({ ...f, productoId: e.target.value })}>
            <option value="">Elegir</option>
            {grupos.map((g) => (
              <optgroup key={g.id} label={g.nombre}>
                {g.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.variante ? ` · ${p.variante}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Cantidad" requerido>
          <Entrada inputMode="numeric" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Campo>
        {tipo === 'salida' && (
          <>
            <Campo etiqueta="Placa o DNI" ayuda="Placa del vehículo donde se instaló, o DNI si es venta.">
              <Entrada value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value.toUpperCase() })} />
            </Campo>
            <Campo etiqueta="Motivo">
              <Selector value={f.tipoVenta} onChange={(e) => setF({ ...f, tipoVenta: e.target.value })}>
                {TIPOS_VENTA.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Selector>
            </Campo>
          </>
        )}
        <Campo etiqueta="Nota" className="sm:col-span-2">
          <Entrada value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder={tipo === 'entrada' ? 'Proveedor, guía, factura' : 'Opcional'} />
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function FormProducto({ producto, onCerrar }: { producto?: Producto; onCerrar: () => void }) {
  const { crear, editar, eliminar } = useDatos();
  const avisar = useAvisos();
  const [f, setF] = useState({
    categoria: producto?.categoria ?? ('tanque_glp' as CategoriaProducto),
    nombre: producto?.nombre ?? '',
    variante: producto?.variante ?? '',
    intervaloKm: producto?.intervaloKm ? String(producto.intervaloKm) : '',
    precio: producto?.precio != null ? String(producto.precio) : '',
    stockMinimo: String(producto?.stockMinimo ?? 1),
  });
  const [error, setError] = useState('');
  const guardar = async () => {
    if (!f.nombre.trim()) return setError('Escribe el nombre del producto.');
    const data = {
      categoria: f.categoria,
      nombre: f.nombre.trim(),
      variante: f.variante.trim() || undefined,
      intervaloKm: f.categoria === 'aceite' && f.intervaloKm ? Number(f.intervaloKm) : undefined,
      precio: f.precio ? Number(f.precio) : undefined,
      stockMinimo: Number(f.stockMinimo) || 0,
    };
    if (producto) await editar('productos', producto.id, data);
    else await crear('productos', data);
    avisar(producto ? 'Producto actualizado.' : 'Producto agregado.');
    onCerrar();
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={producto ? 'Editar producto' : 'Nuevo producto'}
      pie={
        <>
          {producto && (
            <Boton
              variante="peligro"
              className="mr-auto"
              onClick={async () => {
                await eliminar('productos', producto.id);
                avisar('Producto enviado a la papelera.');
                onCerrar();
              }}
            >
              Eliminar
            </Boton>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>Guardar</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Categoría">
          <Selector value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaProducto })}>
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Nombre" requerido>
          <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Tanque GLP toroidal" />
        </Campo>
        <Campo etiqueta="Medida o variante">
          <Entrada value={f.variante} onChange={(e) => setF({ ...f, variante: e.target.value })} placeholder="12 GL · boca interna" />
        </Campo>
        <Campo etiqueta="Stock mínimo" ayuda="Avisa cuando el stock baje de este número. 0 = sin aviso.">
          <Entrada inputMode="numeric" value={f.stockMinimo} onChange={(e) => setF({ ...f, stockMinimo: e.target.value.replace(/\D/g, '') })} />
        </Campo>
        <Campo etiqueta="Precio de venta (S/)">
          <Entrada inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value.replace(/[^\d.]/g, '') })} />
        </Campo>
        {f.categoria === 'aceite' && (
          <Campo etiqueta="Intervalo de cambio (km)">
            <Entrada inputMode="numeric" value={f.intervaloKm} onChange={(e) => setF({ ...f, intervaloKm: e.target.value.replace(/\D/g, '') })} />
          </Campo>
        )}
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
      {producto?.precio != null && <p className="mt-3 text-xs text-gris">Precio actual: {soles(producto.precio)}</p>}
    </Modal>
  );
}

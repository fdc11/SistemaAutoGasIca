import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Plus, Droplet, Pencil, Trash2 } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { fichasAceite, type FichaAceite } from '../lib/analisis';
import { DIAS_ENTRE_CAMBIOS, MESES, intervaloPorDetalle } from '../lib/catalogos';
import type { ServicioAceite } from '../lib/types';
import {
  ahoraISO,
  celularValido,
  cx,
  enlaceWhatsApp,
  fechaCorta,
  formatoCelular,
  hoyISO,
  normalizarCelular,
  normalizarPlaca,
  placaValida,
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
import { clientePorPlaca } from '../lib/analisis';
import { BotonesExcel } from '../components/BotonesExcel';

const RESPUESTAS = ['Agendó cita', 'Aún no le toca', 'No responde', 'Lo hizo en otro taller', 'Vendió el vehículo', 'No desea'];

type Vista = 'contactar' | 'servicios';
type Filtro = 'vencido' | 'semana' | 'proximo';

export default function Aceite() {
  const servicios = useActivos('serviciosAceite');
  const clientes = useActivos('clientes');
  const [vista, setVista] = useState<Vista>('contactar');
  const [filtro, setFiltro] = useState<Filtro>('semana');
  const [q, setQ] = useState('');
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11
  const [pagina, setPagina] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const [editar, setEditar] = useState<ServicioAceite | null>(null);
  const [respuesta, setRespuesta] = useState<FichaAceite | null>(null);
  const [borrar, setBorrar] = useState<ServicioAceite | null>(null);
  const { eliminar } = useDatos();
  const avisar = useAvisos();

  const fichas = useMemo(() => fichasAceite(servicios), [servicios]);
  const nombreDe = (id?: string) => clientes.find((c) => c.id === id)?.nombre;

  const conteo = useMemo(() => {
    const vencido = fichas.filter((f) => f.estado === 'vencido' && f.diasParaProximo >= -60).length;
    const semana = fichas.filter((f) => f.estado === 'semana').length;
    const proximo = fichas.filter((f) => f.estado === 'proximo').length;
    return { vencido, semana, proximo };
  }, [fichas]);

  const porContactar = useMemo(() => {
    const t = q.toUpperCase().replace(/\s/g, '');
    return fichas
      .filter((f) => (filtro === 'vencido' ? f.estado === 'vencido' && f.diasParaProximo >= -60 : f.estado === filtro))
      .filter((f) => !t || f.placa.includes(t) || (f.celular ?? '').includes(t) || (nombreDe(f.clienteId) ?? '').toUpperCase().replace(/\s/g, '').includes(t))
      .sort((a, b) => a.diasParaProximo - b.diasParaProximo);
  }, [fichas, filtro, q, clientes]); // eslint-disable-line

  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const delMes = useMemo(() => {
    const t = q.toUpperCase().replace(/\s/g, '');
    return servicios
      .filter((s) => s.fecha.startsWith(prefijo))
      .filter((s) => !t || s.placa.includes(t) || (s.celular ?? '').includes(t) || s.detalle.toUpperCase().replace(/\s/g, '').includes(t))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn));
  }, [servicios, prefijo, q]);
  const totalMes = delMes.reduce((a, s) => a + (Number(s.monto) || 0), 0);
  const conCelular = delMes.filter((s) => s.celular).length;
  const anios = useMemo(() => {
    const s = new Set(servicios.map((x) => Number(x.fecha.slice(0, 4))).filter(Boolean));
    s.add(hoy.getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [servicios]); // eslint-disable-line

  const mensaje = (f: FichaAceite) =>
    `Hola${nombreDe(f.clienteId) ? ' ' + nombreDe(f.clienteId)!.split(' ')[0] : ''}, te saluda AutoGas Ica. Tu vehículo de placa ${f.placa} hizo su último cambio de aceite el ${fechaCorta(f.ultimo.fecha)}. Ya está cerca su próximo cambio. ¿Te separamos un horario esta semana?`;

  const POR = 30;

  return (
    <>
      <Encabezado
        titulo="Cambio de aceite"
        descripcion={`El sistema calcula cuándo le toca a cada vehículo: su propio intervalo si ya volvió antes, o ${DIAS_ENTRE_CAMBIOS} días si es su primera vez.`}
        acciones={
          <>
            <BotonesExcel seccion="Cambio de aceite" importar={['aceite']} exportar={['aceite']} />
            <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setNuevo(true)}>
              Registrar servicio
            </Boton>
          </>
        }
      />

      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={(v) => {
          setVista(v);
          setPagina(1);
        }}
        opciones={[
          { id: 'contactar', nombre: 'Por contactar', cuenta: conteo.vencido + conteo.semana },
          { id: 'servicios', nombre: 'Servicios por mes' },
        ]}
      />

      {vista === 'contactar' ? (
        <Panel sinRelleno>
          <div className="flex flex-col gap-3 border-b border-linea p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['vencido', 'Atrasados', conteo.vencido],
                  ['semana', 'Le toca esta semana', conteo.semana],
                  ['proximo', 'Próximas 3 semanas', conteo.proximo],
                ] as [Filtro, string, number][]
              ).map(([id, n, c]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  className={cx(
                    'rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                    filtro === id ? 'border-carbon bg-carbon text-white' : 'border-linea-fuerte bg-white text-gris hover:text-tinta',
                  )}
                >
                  {n} <span className={filtro === id ? 'text-carbon-texto' : 'text-gris-claro'}>{c}</span>
                </button>
              ))}
            </div>
            <Buscador valor={q} onCambio={setQ} placeholder="Placa, celular o nombre" className="md:w-72" />
          </div>
          {filtro === 'vencido' && <p className="border-b border-linea bg-fondo px-4 py-2 text-[13px] text-gris">Se muestran los atrasados hasta 60 días. Los más antiguos pasan al segmento de clientes perdidos.</p>}
          {porContactar.length === 0 ? (
            <Vacio icono={<Droplet className="h-8 w-8" />} titulo="Nadie en esta lista" texto="Cuando a un vehículo le toque su cambio, aparecerá aquí con su botón de WhatsApp." />
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Placa</Th>
                    <Th>Cliente</Th>
                    <Th>Último cambio</Th>
                    <Th>Visitas</Th>
                    <Th>Le toca</Th>
                    <Th>Respuesta</Th>
                    <Th className="text-right">Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {porContactar.slice((pagina - 1) * POR, pagina * POR).map((f) => (
                    <tr key={f.placa}>
                      <Td className="font-display text-base font-semibold tracking-wide num">{f.placa}</Td>
                      <Td>
                        {f.clienteId ? (
                          <Link to={`/clientes/${f.clienteId}`} className="font-medium hover:underline">
                            {nombreDe(f.clienteId) ?? '—'}
                          </Link>
                        ) : (
                          <span className="text-gris">Sin ficha</span>
                        )}
                        <p className="text-[13px] text-gris num">{f.celular ? formatoCelular(f.celular) : 'Sin celular'}</p>
                      </Td>
                      <Td>
                        <p className="num">{fechaCorta(f.ultimo.fecha)}</p>
                        <p className="max-w-[220px] truncate text-[13px] text-gris">{f.ultimo.detalle}</p>
                      </Td>
                      <Td className="num">{f.visitas}</Td>
                      <Td>
                        <p className="num">{fechaCorta(f.fechaProxima)}</p>
                        <p className={cx('text-[13px] num', f.diasParaProximo < 0 ? 'font-semibold text-rojo' : 'text-gris')}>
                          {f.diasParaProximo < 0 ? `${-f.diasParaProximo} días de atraso` : f.diasParaProximo === 0 ? 'Hoy' : `En ${f.diasParaProximo} días`}
                        </p>
                      </Td>
                      <Td>{f.ultimo.respuesta ? <Etiqueta>{f.ultimo.respuesta}</Etiqueta> : <span className="text-gris-claro">—</span>}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {f.celular && (
                            <a href={enlaceWhatsApp(f.celular, mensaje(f))} target="_blank" rel="noreferrer">
                              <Boton tam="sm" variante="secundario" icono={<MessageCircle className="h-3.5 w-3.5 text-ok" />}>
                                Escribir
                              </Boton>
                            </a>
                          )}
                          <Boton tam="sm" variante="secundario" onClick={() => setRespuesta(f)}>
                            Respuesta
                          </Boton>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Paginacion pagina={pagina} total={porContactar.length} porPagina={POR} onCambio={setPagina} />
            </>
          )}
        </Panel>
      ) : (
        <Panel sinRelleno>
          <div className="flex flex-col gap-3 border-b border-linea p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Selector value={mes} onChange={(e) => { setMes(Number(e.target.value)); setPagina(1); }} className="!w-40" aria-label="Mes">
                {MESES.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </Selector>
              <Selector value={anio} onChange={(e) => { setAnio(Number(e.target.value)); setPagina(1); }} className="!w-28" aria-label="Año">
                {anios.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Selector>
              <Buscador valor={q} onCambio={setQ} placeholder="Placa, celular o producto" className="w-64" />
            </div>
            <dl className="flex gap-6 text-sm">
              <div>
                <dt className="text-[12.5px] text-gris">Servicios</dt>
                <dd className="font-display text-xl font-bold num">{delMes.length}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-gris">Ingresos</dt>
                <dd className="font-display text-xl font-bold num">{soles(totalMes)}</dd>
              </div>
              <div>
                <dt className="text-[12.5px] text-gris">Con celular</dt>
                <dd className={cx('font-display text-xl font-bold num', delMes.length && conCelular / delMes.length < 0.8 ? 'text-rojo' : '')}>
                  {delMes.length ? Math.round((conCelular / delMes.length) * 100) : 0}%
                </dd>
              </div>
            </dl>
          </div>
          {delMes.length === 0 ? (
            <Vacio icono={<Droplet className="h-8 w-8" />} titulo={`Sin servicios en ${MESES[mes].toLowerCase()} de ${anio}`} texto="Registra un servicio o importa tu Excel de seguimiento de aceite." />
          ) : (
            <>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Placa</Th>
                    <Th>Detalle</Th>
                    <Th className="text-right">Km</Th>
                    <Th className="text-right">Próximo km</Th>
                    <Th className="text-right">Monto</Th>
                    <Th>Celular</Th>
                    <Th>Registró</Th>
                    <Th className="w-20"><span className="sr-only">Acciones</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {delMes.slice((pagina - 1) * POR, pagina * POR).map((s) => (
                    <tr key={s.id}>
                      <Td className="num">{fechaCorta(s.fecha)}</Td>
                      <Td className="font-semibold num">{s.placa}</Td>
                      <Td className="max-w-[280px] truncate">{s.detalle}</Td>
                      <Td className="text-right num">{s.kmActual ? s.kmActual.toLocaleString('es-PE') : '—'}</Td>
                      <Td className="text-right num">{s.kmProximo ? s.kmProximo.toLocaleString('es-PE') : '—'}</Td>
                      <Td className="text-right font-medium num">{soles(s.monto)}</Td>
                      <Td className="num">{s.celular ? formatoCelular(s.celular) : <span className="text-rojo">Falta</span>}</Td>
                      <Td className="text-gris">{s.creadoPor}</Td>
                      <Td>
                        <div className="flex justify-end">
                          <BotonIcono titulo="Editar" onClick={() => setEditar(s)}>
                            <Pencil className="h-4 w-4" />
                          </BotonIcono>
                          <BotonIcono titulo="Eliminar" onClick={() => setBorrar(s)}>
                            <Trash2 className="h-4 w-4" />
                          </BotonIcono>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
              <Paginacion pagina={pagina} total={delMes.length} porPagina={POR} onCambio={setPagina} />
            </>
          )}
        </Panel>
      )}

      {(nuevo || editar) && <FormServicio servicio={editar ?? undefined} onCerrar={() => { setNuevo(false); setEditar(null); }} />}
      {respuesta && <FormRespuesta ficha={respuesta} onCerrar={() => setRespuesta(null)} />}
      <Confirmar
        abierto={!!borrar}
        titulo="Eliminar servicio"
        texto={`El servicio de ${borrar?.placa} del ${fechaCorta(borrar?.fecha)} pasará a la papelera.`}
        accion="Eliminar"
        onCerrar={() => setBorrar(null)}
        onConfirmar={async () => {
          if (borrar) await eliminar('serviciosAceite', borrar.id);
          avisar('Servicio enviado a la papelera.');
        }}
      />
    </>
  );
}

function FormServicio({ servicio, onCerrar }: { servicio?: ServicioAceite; onCerrar: () => void }) {
  const { crear, editar, datos } = useDatos();
  const productos = useActivos('productos').filter((p) => p.categoria === 'aceite');
  const { asegurarVehiculo, registrar } = useAcciones();
  const avisar = useAvisos();
  const [f, setF] = useState({
    fecha: servicio?.fecha ?? hoyISO(),
    placa: servicio?.placa ?? '',
    productoId: servicio?.productoId ?? '',
    detalle: servicio?.detalle ?? '',
    kmActual: servicio?.kmActual ? String(servicio.kmActual) : '',
    monto: servicio?.monto != null ? String(servicio.monto) : '',
    celular: servicio?.celular ?? '',
    sinCelular: servicio ? !servicio.celular : false,
    nombre: '',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));
  const p = normalizarPlaca(f.placa);
  const { cliente, vehiculo } = placaValida(p) ? clientePorPlaca(p, datos.vehiculos, datos.clientes) : { cliente: undefined, vehiculo: undefined };
  const intervalo = productos.find((x) => x.id === f.productoId)?.intervaloKm ?? intervaloPorDetalle(f.detalle);
  const km = Number(f.kmActual) || undefined;

  const elegirProducto = (id: string) => {
    const pr = productos.find((x) => x.id === id);
    setF((x) => ({
      ...x,
      productoId: id,
      detalle: pr ? `${pr.nombre} ${pr.variante ?? ''}`.trim() : x.detalle,
      monto: pr?.precio != null && !x.monto ? String(pr.precio) : x.monto,
    }));
  };

  const celularFinal = f.sinCelular ? '' : normalizarCelular(f.celular || cliente?.celular);

  const guardar = async () => {
    if (!placaValida(p)) return setError('Escribe una placa válida de 6 caracteres.');
    if (!f.detalle.trim()) return setError('Elige el aceite o escribe el detalle del servicio.');
    if (!f.monto || isNaN(Number(f.monto))) return setError('Escribe el monto pagado.');
    if (!f.sinCelular && !celularValido(celularFinal)) return setError('Falta el celular del cliente. Sin celular no se le puede recordar el próximo cambio.');
    let clienteId = cliente?.id;
    let vehiculoId = vehiculo?.id;
    if (!clienteId && f.nombre.trim() && celularFinal) {
      const r = await registrar({ nombre: f.nombre, celular: celularFinal, canal: 'presencial', estado: 'atendido', placa: p, interes: 'Cambio de aceite', tipoInteraccion: 'presencial', comentario: 'Registrado al hacer su cambio de aceite' });
      clienteId = r.clienteId;
      vehiculoId = r.vehiculoId;
    }
    if (!vehiculoId) vehiculoId = await asegurarVehiculo(p, { clienteId });
    const datosServicio = {
      fecha: f.fecha,
      placa: p,
      vehiculoId,
      clienteId,
      productoId: f.productoId || undefined,
      detalle: f.detalle.trim(),
      kmActual: km,
      intervaloKm: intervalo,
      kmProximo: km && intervalo ? km + intervalo : undefined,
      monto: Number(f.monto),
      celular: celularFinal || undefined,
      sede: 'Ica',
    };
    if (servicio) {
      await editar('serviciosAceite', servicio.id, datosServicio);
      avisar('Servicio actualizado.');
    } else {
      await crear('serviciosAceite', datosServicio);
      avisar(`Cambio de aceite de ${p} registrado.`);
    }
    onCerrar();
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={servicio ? 'Editar servicio de aceite' : 'Registrar cambio de aceite'}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>{servicio ? 'Guardar cambios' : 'Registrar servicio'}</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Placa" requerido>
          <Entrada value={f.placa} onChange={(e) => set('placa', e.target.value.toUpperCase())} />
        </Campo>
        <Campo etiqueta="Fecha" requerido>
          <Entrada type="date" value={f.fecha} max={hoyISO()} onChange={(e) => set('fecha', e.target.value)} />
        </Campo>
        {placaValida(p) && (
          <div className="rounded-md bg-fondo px-3 py-2.5 text-sm sm:col-span-2">
            {cliente ? (
              <>
                <span className="font-semibold">{cliente.nombre}</span>
                {vehiculo?.marca && <span className="text-gris"> · {vehiculo.marca} {vehiculo.modelo}</span>}
              </>
            ) : (
              <span className="text-gris">Vehículo sin cliente. Escribe su nombre y celular para crear su ficha.</span>
            )}
          </div>
        )}
        {placaValida(p) && !cliente && !servicio && (
          <Campo etiqueta="Nombre del cliente" className="sm:col-span-2">
            <Entrada value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </Campo>
        )}
        <Campo etiqueta="Aceite">
          <Selector value={f.productoId} onChange={(e) => elegirProducto(e.target.value)}>
            <option value="">Elegir</option>
            {productos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre} {x.variante}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Detalle" requerido>
          <Entrada value={f.detalle} onChange={(e) => set('detalle', e.target.value)} />
        </Campo>
        <Campo etiqueta="Km actual" ayuda={intervalo ? `Intervalo: ${intervalo.toLocaleString('es-PE')} km${km ? ` · próximo a los ${(km + intervalo).toLocaleString('es-PE')} km` : ''}` : 'Elige el aceite para calcular el próximo cambio'}>
          <Entrada inputMode="numeric" value={f.kmActual} onChange={(e) => set('kmActual', e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo etiqueta="Monto pagado (S/)" requerido>
          <Entrada inputMode="decimal" value={f.monto} onChange={(e) => set('monto', e.target.value.replace(/[^\d.]/g, ''))} />
        </Campo>
        <Campo etiqueta="Celular" requerido={!f.sinCelular} className="sm:col-span-2" ayuda={cliente?.celular && !f.celular ? `Se usará ${formatoCelular(cliente.celular)}` : undefined}>
          <Entrada inputMode="numeric" value={f.celular} disabled={f.sinCelular} onChange={(e) => set('celular', e.target.value)} />
        </Campo>
        <label className="flex items-center gap-2 text-sm text-gris sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-rojo" checked={f.sinCelular} onChange={(e) => set('sinCelular', e.target.checked)} />
          El cliente no quiso dar su número
        </label>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

function FormRespuesta({ ficha, onCerrar }: { ficha: FichaAceite; onCerrar: () => void }) {
  const { editar, crear } = useDatos();
  const avisar = useAvisos();
  const [r, setR] = useState(ficha.ultimo.respuesta ?? '');
  const [nota, setNota] = useState('');
  const guardar = async () => {
    if (!r) return;
    await editar('serviciosAceite', ficha.ultimo.id, { respuesta: r });
    if (ficha.clienteId)
      await crear('interacciones', {
        clienteId: ficha.clienteId,
        fecha: ahoraISO(),
        tipo: 'whatsapp',
        resultado: r,
        comentario: `Recordatorio de cambio de aceite (${ficha.placa}): ${r}.${nota ? ' ' + nota : ''}`,
      });
    avisar('Respuesta guardada.');
    onCerrar();
  };
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Respuesta de ${ficha.placa}`}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={!r}>
            Guardar respuesta
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {RESPUESTAS.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setR(x)}
              className={cx('rounded-md border px-3 py-2 text-left text-sm font-medium', r === x ? 'border-rojo bg-rojo-suave text-rojo-osc' : 'border-linea-fuerte hover:border-tinta')}
            >
              {x}
            </button>
          ))}
        </div>
        <AreaTexto value={nota} onChange={(e) => setNota(e.target.value)} className="min-h-[64px]" />
        {r === 'Agendó cita' && (
          <p className="text-sm text-gris">
            Recuerda agendarlo en la{' '}
            <Link to="/agenda" className="font-semibold text-tinta underline">
              agenda
            </Link>
            .
          </p>
        )}
      </div>
    </Modal>
  );
}

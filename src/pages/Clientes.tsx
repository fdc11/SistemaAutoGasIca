import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, MessageCircle, UserPlus, Users } from 'lucide-react';
import { useActivos } from '../data/store';
import { CANALES, ESTADOS, estadoInfo, nombreCanal } from '../lib/catalogos';
import type { EstadoCliente } from '../lib/types';
import { cx, enlaceWhatsApp, fechaCorta, formatoCelular, hoyISO, plano } from '../lib/utils';
import { Boton, Buscador, Encabezado, Entrada, Etiqueta, Paginacion, Panel, Pestanas, Selector, Tabla, Td, Th, Vacio } from '../components/ui';

const POR_PAGINA = 25;

export default function Clientes() {
  const clientes = useActivos('clientes');
  const vehiculos = useActivos('vehiculos');
  const empresas = useActivos('empresas');
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<'todos' | EstadoCliente>('todos');
  const [canal, setCanal] = useState('');
  const [asesor, setAsesor] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<'reciente' | 'antiguo' | 'nombre'>('reciente');

  const placasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const v of vehiculos) if (v.clienteId) m.set(v.clienteId, [...(m.get(v.clienteId) ?? []), v.placa]);
    return m;
  }, [vehiculos]);

  const asesores = useMemo(() => [...new Set(clientes.map((c) => c.creadoPor))].sort(), [clientes]);

  const base = useMemo(() => {
    const t = plano(q).replace(/\s+/g, '');
    return clientes.filter((c) => {
      if (canal && c.canal !== canal) return false;
      if (asesor && c.creadoPor !== asesor) return false;
      if (desde && c.fechaContacto < desde) return false;
      if (hasta && c.fechaContacto > hasta) return false;
      if (t) {
        const placas = (placasDe.get(c.id) ?? []).join(' ');
        const hay = plano(c.nombre).replace(/\s+/g, '') + ' ' + c.celular + ' ' + plano(placas) + ' ' + plano(c.interes);
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [clientes, q, canal, asesor, desde, hasta, placasDe]);

  const conteo = useMemo(() => {
    const m: Record<string, number> = { todos: base.length };
    for (const c of base) m[c.estado] = (m[c.estado] ?? 0) + 1;
    return m;
  }, [base]);

  const lista = useMemo(() => {
    const l = estado === 'todos' ? base : base.filter((c) => c.estado === estado);
    return [...l].sort((a, b) =>
      orden === 'nombre'
        ? a.nombre.localeCompare(b.nombre)
        : orden === 'antiguo'
          ? a.creadoEn.localeCompare(b.creadoEn)
          : b.creadoEn.localeCompare(a.creadoEn),
    );
  }, [base, estado, orden]);

  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const filtrando = q || canal || asesor || desde || hasta;

  const exportar = async () => {
    const XLSX = await import('xlsx');
    const filas = lista.map((c) => ({
      Nombre: c.nombre,
      Celular: c.celular,
      Ciudad: c.ciudad ?? '',
      Canal: nombreCanal(c.canal),
      Anuncio: c.subcanal ?? '',
      Empresa: empresas.find((e) => e.id === c.empresaId)?.nombre ?? '',
      Placas: (placasDe.get(c.id) ?? []).join(', '),
      Interés: c.interes ?? '',
      Estado: estadoInfo(c.estado).nombre,
      'Motivo de pérdida': c.motivoPerdida ?? '',
      'Próximo contacto': c.proximoContacto ?? '',
      'Fecha de contacto': c.fechaContacto,
      'Registrado por': c.creadoPor,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `clientes-autogas-${hoyISO()}.xlsx`);
  };

  const pestañas = [
    { id: 'todos' as const, nombre: 'Todos', cuenta: conteo.todos },
    ...ESTADOS.map((e) => ({ id: e.id, nombre: e.nombre, cuenta: conteo[e.id] ?? 0 })),
  ];

  return (
    <>
      <Encabezado
        titulo="Base de clientes"
        descripcion="Todos los clientes de todos los canales. Busca por nombre, celular o placa."
        acciones={
          <>
            <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={exportar} disabled={!lista.length}>
              Exportar a Excel
            </Boton>
            <Link to="/registrar">
              <Boton icono={<UserPlus className="h-4 w-4" />}>Registrar cliente</Boton>
            </Link>
          </>
        }
      />

      <Panel sinRelleno>
        <div className="grid gap-3 border-b border-linea p-4 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <Buscador valor={q} onCambio={(v) => { setQ(v); setPagina(1); }} placeholder="Nombre, celular o placa" />
          <Selector value={canal} onChange={(e) => { setCanal(e.target.value); setPagina(1); }} aria-label="Canal">
            <option value="">Todos los canales</option>
            {CANALES.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Selector>
          <Selector value={asesor} onChange={(e) => { setAsesor(e.target.value); setPagina(1); }} aria-label="Registrado por">
            <option value="">Todos los asesores</option>
            {asesores.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Selector>
          <Entrada type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPagina(1); }} aria-label="Desde" title="Contacto desde" />
          <Entrada type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPagina(1); }} aria-label="Hasta" title="Contacto hasta" />
        </div>
        <div className="flex items-end justify-between gap-3 px-4 pt-2">
          <Pestanas opciones={pestañas} valor={estado} onCambio={(v) => { setEstado(v); setPagina(1); }} className="flex-1 border-b-0" />
          <Selector value={orden} onChange={(e) => setOrden(e.target.value as any)} className="mb-1.5 hidden h-9 !w-44 shrink-0 md:block" aria-label="Orden">
            <option value="reciente">Más recientes</option>
            <option value="antiguo">Más antiguos</option>
            <option value="nombre">Por nombre</option>
          </Selector>
        </div>

        {lista.length === 0 ? (
          <div className="border-t border-linea">
            <Vacio
              icono={<Users className="h-8 w-8" />}
              titulo={filtrando || estado !== 'todos' ? 'Ningún cliente coincide con los filtros' : 'Todavía no hay clientes'}
              texto={filtrando ? 'Prueba con otro nombre, celular o placa, o quita algún filtro.' : 'Registra el primero o importa tus Excel de prospectos.'}
              accion={
                !filtrando && (
                  <Link to="/registrar">
                    <Boton>Registrar cliente</Boton>
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <>
            <Tabla className="border-t border-linea">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Canal</Th>
                  <Th>Placa</Th>
                  <Th>Interés</Th>
                  <Th>Estado</Th>
                  <Th>Próximo contacto</Th>
                  <Th>Registro</Th>
                  <Th className="w-10"><span className="sr-only">WhatsApp</span></Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => {
                  const e = estadoInfo(c.estado);
                  const placas = placasDe.get(c.id) ?? [];
                  const vence = c.proximoContacto && c.proximoContacto <= hoyISO() && !['atendido', 'perdido'].includes(c.estado);
                  return (
                    <tr key={c.id} onClick={() => navigate(`/clientes/${c.id}`)} className="cursor-pointer hover:bg-[#FAFAFB]">
                      <Td>
                        <p className="font-semibold">{c.nombre || 'Sin nombre'}</p>
                        <p className="text-[13px] text-gris num">{formatoCelular(c.celular)}</p>
                      </Td>
                      <Td>
                        {nombreCanal(c.canal)}
                        {(c.subcanal || c.empresaId) && (
                          <p className="text-[13px] text-gris">{c.subcanal ?? empresas.find((x) => x.id === c.empresaId)?.nombre}</p>
                        )}
                      </Td>
                      <Td className="font-medium num">{placas.length ? placas.join(', ') : <span className="text-gris-claro">—</span>}</Td>
                      <Td className="max-w-[200px] truncate">{c.interes || <span className="text-gris-claro">—</span>}</Td>
                      <Td>
                        <Etiqueta tono={e.tono}>{e.nombre}</Etiqueta>
                      </Td>
                      <Td className={cx('num', vence ? 'font-semibold text-rojo' : '')}>{fechaCorta(c.proximoContacto)}</Td>
                      <Td>
                        <p className="num">{fechaCorta(c.fechaContacto)}</p>
                        <p className="text-[13px] text-gris">{c.creadoPor}</p>
                      </Td>
                      <Td onClick={(ev) => ev.stopPropagation()}>
                        {c.celular && (
                          <a
                            href={enlaceWhatsApp(c.celular)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Escribir a ${c.nombre} por WhatsApp`}
                            title="Escribir por WhatsApp"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gris hover:bg-ok-suave hover:text-ok"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
            <Paginacion pagina={pagina} total={lista.length} porPagina={POR_PAGINA} onCambio={setPagina} />
          </>
        )}
      </Panel>
    </>
  );
}

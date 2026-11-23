import { useMemo, useState } from 'react';
import { Download, RotateCcw, Trash2, X } from 'lucide-react';
import { useDatos } from '../data/store';
import { useAuth } from '../data/auth';
import { borrarDatosDemo } from '../data/backend';
import { sembrarCatalogo } from '../data/demo';
import { COLECCIONES, type Listas, type NombreColeccion } from '../lib/types';
import { esNombreRelleno, fechaHora, hoyISO } from '../lib/utils';
import { Boton, BotonIcono, Confirmar, Encabezado, Entrada, Etiqueta, Panel, Pestanas, Tabla, Td, Th, Vacio, useAvisos } from '../components/ui';

const NOMBRES: Record<NombreColeccion, string> = {
  clientes: 'Cliente',
  vehiculos: 'Vehículo',
  interacciones: 'Contacto',
  citas: 'Cita',
  bloqueos: 'Bloqueo',
  ingresos: 'Ingreso al taller',
  serviciosAceite: 'Servicio de aceite',
  empresas: 'Empresa',
  filtros: 'Filtro',
  atenciones: 'Atención de convenio',
  numeros: 'Número nuevo',
  productos: 'Producto',
  movimientos: 'Movimiento',
  importaciones: 'Importación',
  ajustes: 'Ajustes',
};

const LISTAS: { clave: keyof Pick<Listas, 'servicios' | 'subcanales' | 'motivosPerdida' | 'tecnicos' | 'ciudades' | 'asesores' | 'areasCliente' | 'tiposContacto'>; titulo: string; ayuda: string }[] = [
  { clave: 'tiposContacto', titulo: 'Tipos de contacto (Números nuevos)', ayuda: 'Por dónde llegó cada número nuevo. Se usan en el análisis de tráfico.' },
  { clave: 'areasCliente', titulo: 'Áreas del taller', ayuda: 'Dónde se atendió al cliente. Se elige al registrarlo y sirve para segmentar la base.' },
  { clave: 'asesores', titulo: 'Personal que atiende', ayuda: 'Nombres que aparecen en «Atiende» y en «Agendado por».' },
  { clave: 'servicios', titulo: 'Servicios', ayuda: 'Aparecen al registrar clientes, citas e ingresos.' },
  { clave: 'tecnicos', titulo: 'Técnicos', ayuda: 'Se asignan al ingreso del vehículo al taller.' },
  { clave: 'subcanales', titulo: 'Anuncios (publicidad)', ayuda: 'De qué anuncio vino el cliente.' },
  { clave: 'motivosPerdida', titulo: 'Motivos de pérdida', ayuda: 'Obligatorio al marcar un cliente como perdido.' },
  { clave: 'ciudades', titulo: 'Ciudades', ayuda: 'Ciudad del cliente.' },
];

const describir = (col: NombreColeccion, x: any) =>
  x.nombre || x.placa || x.motivo || x.archivo || x.comentario?.slice(0, 60) || x.id;

export default function Ajustes() {
  const { datos, listas, guardarListas, restaurar, borrarDefinitivo, modo, editar } = useDatos();
  const { usuario } = useAuth();
  const avisar = useAvisos();
  const [vista, setVista] = useState<'listas' | 'papelera' | 'importaciones' | 'datos'>('listas');
  const [confirmar, setConfirmar] = useState<null | { titulo: string; texto: string; accion: string; fn: () => Promise<void> | void }>(null);

  const papelera = useMemo(
    () =>
      COLECCIONES.flatMap((col) => (datos[col] as any[]).filter((x) => x.eliminado).map((x) => ({ col, x }))).sort((a, b) =>
        (b.x.eliminadoEn ?? '').localeCompare(a.x.eliminadoEn ?? ''),
      ),
    [datos],
  );
  const importaciones = [...datos.importaciones].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  /** Descarga todo. Devuelve true si se descargó bien. */
  const respaldo = async (): Promise<boolean> => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      // Excel no acepta más de 32 767 caracteres por celda: los textos largos
      // (p. ej., la lista de registros de una importación) se reparten en «campo», «campo (2)»…
      const MAX = 32000;
      for (const col of COLECCIONES) {
        const filas = (datos[col] as any[]).map((x) => {
          const fila: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(x)) {
            const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
            if (typeof val === 'string' && val.length > MAX) {
              for (let i = 0; i * MAX < val.length; i++) fila[i ? `${k} (${i + 1})` : k] = val.slice(i * MAX, (i + 1) * MAX);
            } else fila[k] = val;
          }
          return fila;
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ vacio: '' }]), col.slice(0, 31));
      }
      XLSX.writeFile(wb, `respaldo-autogas-${hoyISO()}.xlsx`);
      avisar('Respaldo descargado.');
      return true;
    } catch (e) {
      console.error(e);
      avisar('No se pudo generar el respaldo. Recarga la página e inténtalo otra vez.', 'error');
      return false;
    }
  };

  const revertir = async (imp: (typeof importaciones)[number]) => {
    for (const [col, ids] of Object.entries(imp.ids ?? {})) await borrarDefinitivo(col as NombreColeccion, ids);
    await editar('importaciones', imp.id, { revertida: true });
    avisar(`Importación de ${imp.archivo} revertida.`);
  };

  return (
    <>
      <Encabezado titulo="Ajustes" descripcion="Listas de opciones, papelera, importaciones y respaldo de los datos." />
      <Pestanas
        className="mb-5"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { id: 'listas', nombre: 'Listas de opciones' },
          { id: 'papelera', nombre: 'Papelera', cuenta: papelera.length },
          { id: 'importaciones', nombre: 'Importaciones', cuenta: importaciones.length },
          { id: 'datos', nombre: 'Datos y respaldo' },
        ]}
      />

      {vista === 'listas' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {LISTAS.map((l) => (
            <EditorLista
              key={l.clave}
              titulo={l.titulo}
              ayuda={l.ayuda}
              valores={listas[l.clave]}
              onGuardar={async (v) => {
                await guardarListas({ [l.clave]: v });
                avisar(`${l.titulo}: lista actualizada.`);
              }}
            />
          ))}
        </div>
      )}

      {vista === 'papelera' && (
        <Panel sinRelleno>
          {papelera.length === 0 ? (
            <Vacio icono={<Trash2 className="h-8 w-8" />} titulo="La papelera está vacía" texto="Lo que elimines en el sistema llega aquí y se puede restaurar." />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Tipo</Th>
                  <Th>Registro</Th>
                  <Th>Eliminado</Th>
                  <Th>Por</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {papelera.map(({ col, x }) => (
                  <tr key={col + x.id}>
                    <Td>
                      <Etiqueta>{NOMBRES[col]}</Etiqueta>
                    </Td>
                    <Td className="font-medium">{describir(col, x)}</Td>
                    <Td className="num">{fechaHora(x.eliminadoEn)}</Td>
                    <Td className="text-gris">{x.actualizadoPor ?? '—'}</Td>
                    <Td>
                      <div className="flex justify-end gap-2">
                        <Boton
                          tam="sm"
                          variante="secundario"
                          icono={<RotateCcw className="h-3.5 w-3.5" />}
                          onClick={async () => {
                            await restaurar(col, x.id);
                            avisar('Registro restaurado.');
                          }}
                        >
                          Restaurar
                        </Boton>
                        <Boton
                          tam="sm"
                          variante="peligro"
                          onClick={() =>
                            setConfirmar({
                              titulo: 'Borrar para siempre',
                              texto: `«${describir(col, x)}» se borrará definitivamente. Esta acción no se puede deshacer.`,
                              accion: 'Borrar definitivamente',
                              fn: () => borrarDefinitivo(col, [x.id]),
                            })
                          }
                        >
                          Borrar
                        </Boton>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Panel>
      )}

      {vista === 'importaciones' && (
        <Panel sinRelleno>
          {importaciones.length === 0 ? (
            <Vacio titulo="Aún no se importó ningún Excel" />
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <Th>Archivo</Th>
                  <Th>Tipo</Th>
                  <Th>Fecha</Th>
                  <Th>Por</Th>
                  <Th className="text-right">Leídas</Th>
                  <Th className="text-right">Creadas</Th>
                  <Th className="text-right">Fusionadas</Th>
                  <Th className="text-right">Omitidas</Th>
                  <Th className="text-right">Acción</Th>
                </tr>
              </thead>
              <tbody>
                {importaciones.map((i) => (
                  <tr key={i.id}>
                    <Td className="max-w-[240px] truncate font-medium">{i.archivo}</Td>
                    <Td>{i.plantilla}</Td>
                    <Td className="num">{fechaHora(i.creadoEn)}</Td>
                    <Td className="text-gris">{i.creadoPor}</Td>
                    <Td className="text-right num">{i.leidas}</Td>
                    <Td className="text-right num">{i.creadas}</Td>
                    <Td className="text-right num">{i.fusionadas}</Td>
                    <Td className="text-right num">{i.omitidas}</Td>
                    <Td className="text-right">
                      {i.revertida ? (
                        <Etiqueta>Revertida</Etiqueta>
                      ) : (
                        <Boton
                          tam="sm"
                          variante="secundario"
                          onClick={() =>
                            setConfirmar({
                              titulo: 'Revertir importación',
                              texto: `Se borrarán los ${i.creadas} registros creados al importar ${i.archivo}. Lo que se fusionó con registros existentes no se toca.`,
                              accion: 'Revertir',
                              fn: () => revertir(i),
                            })
                          }
                        >
                          Revertir
                        </Boton>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Panel>
      )}

      {vista === 'datos' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel titulo="Respaldo">
            <p className="text-sm text-gris">Descarga todos los datos del sistema en un Excel, una hoja por tipo de registro. Guárdalo una vez por semana.</p>
            <Boton className="mt-4" variante="secundario" icono={<Download className="h-4 w-4" />} onClick={() => void respaldo()}>
              Descargar respaldo completo
            </Boton>
            <p className="mt-5 text-sm text-gris">
              O todo en un solo Excel con las columnas de los formatos del taller (prospectos, aceite, convenios, citas, inventario…). Cada sección también tiene su propio botón «Exportar».
            </p>
            <Boton
              className="mt-3"
              variante="secundario"
              icono={<Download className="h-4 w-4" />}
              onClick={async () => {
                const { FORMATOS, descargar } = await import('../lib/exportar');
                await descargar(FORMATOS, datos as any, {}, `autogas-exportacion-completa-${hoyISO()}.xlsx`);
                avisar('Exportación completa descargada.');
              }}
            >
              Exportar todo con formato del taller
            </Boton>
          </Panel>
          <Panel titulo="Catálogo inicial">
            <p className="text-sm text-gris">
              Carga los equipos del Excel de stock, los aceites con su intervalo, las empresas con convenio y el catálogo de filtros. Úsalo una sola vez, al empezar.
            </p>
            <Boton
              className="mt-4"
              variante="secundario"
              disabled={datos.productos.length > 0}
              onClick={async () => {
                await sembrarCatalogo(usuario?.nombre ?? 'Sistema');
                avisar('Catálogo inicial cargado.');
              }}
            >
              {datos.productos.length > 0 ? 'El catálogo ya está cargado' : 'Cargar catálogo inicial'}
            </Boton>
          </Panel>
          <Panel titulo="Conexión">
            <p className="text-sm">
              {modo === 'firebase' ? (
                <>
                  Conectado a <strong>Firebase</strong>. Los datos se guardan en la nube y se ven al instante en todos los equipos.
                </>
              ) : (
                <>
                  <strong>Modo demostración.</strong> Los datos viven solo en este navegador. Para trabajar en la nube, completa el archivo <code className="rounded bg-fondo px-1">.env.local</code> con los datos de Firebase (ver LEEME.md).
                </>
              )}
            </p>
            {modo === 'demo' && (
              <Boton
                className="mt-4"
                variante="peligro"
                onClick={() =>
                  setConfirmar({
                    titulo: 'Borrar datos de demostración',
                    texto: 'Se borrarán todos los datos guardados en este navegador y se recargará la página con datos de ejemplo nuevos.',
                    accion: 'Borrar y recargar',
                    fn: () => {
                      borrarDatosDemo();
                      window.location.reload();
                    },
                  })
                }
              >
                Borrar datos de demostración
              </Boton>
            )}
          </Panel>
          <VaciarClientes onRespaldo={respaldo} />
          <Panel titulo="Registros">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {(['clientes', 'vehiculos', 'citas', 'serviciosAceite', 'productos', 'movimientos'] as NombreColeccion[]).map((c) => (
                <div key={c} className="flex justify-between border-b border-linea py-1.5">
                  <dt className="text-gris">{NOMBRES[c]}s</dt>
                  <dd className="font-semibold num">{(datos[c] as any[]).filter((x) => !x.eliminado).length.toLocaleString('es-PE')}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      )}

      <Confirmar
        abierto={!!confirmar}
        titulo={confirmar?.titulo ?? ''}
        texto={confirmar?.texto ?? ''}
        accion={confirmar?.accion ?? ''}
        peligro
        onCerrar={() => setConfirmar(null)}
        onConfirmar={async () => {
          await confirmar?.fn();
        }}
      />
    </>
  );
}

function EditorLista({ titulo, ayuda, valores, onGuardar }: { titulo: string; ayuda: string; valores: string[]; onGuardar: (v: string[]) => void }) {
  const [nuevo, setNuevo] = useState('');
  const agregar = () => {
    const v = nuevo.trim();
    if (!v || valores.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onGuardar([...valores, v]);
    setNuevo('');
  };
  return (
    <Panel titulo={titulo}>
      <p className="mb-3 text-[13px] text-gris">{ayuda}</p>
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {valores.length === 0 && <li className="text-sm text-gris-claro">Lista vacía</li>}
        {valores.map((v) => (
          <li key={v} className="flex items-center gap-1 rounded-md border border-linea bg-fondo py-1 pl-2.5 pr-1 text-sm">
            {v}
            <BotonIcono titulo={`Quitar ${v}`} className="h-6 w-6" onClick={() => onGuardar(valores.filter((x) => x !== v))}>
              <X className="h-3.5 w-3.5" />
            </BotonIcono>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          agregar();
        }}
      >
        <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label={`Nueva opción para ${titulo}`} />
        <Boton type="submit" variante="secundario" disabled={!nuevo.trim()}>
          Agregar
        </Boton>
      </form>
    </Panel>
  );
}

/** Borra clientes, vehículos e historial. Las citas de la agenda se conservan con una copia del nombre y celular. */
function VaciarClientes({ onRespaldo }: { onRespaldo: () => Promise<boolean> }) {
  const { datos, crearVarios, borrarDefinitivo } = useDatos();
  const avisar = useAvisos();
  const [respaldado, setRespaldado] = useState(false);
  const [texto, setTexto] = useState('');
  const [paso, setPaso] = useState('');
  const n = { clientes: datos.clientes.length, vehiculos: datos.vehiculos.length, interacciones: datos.interacciones.length };
  const total = n.clientes + n.vehiculos + n.interacciones;

  const vaciar = async () => {
    try {
      // 1. Copia nombre y celular dentro de cada cita para que la agenda siga igual
      setPaso('Protegiendo las citas de la agenda…');
      const porId = new Map(datos.clientes.map((c) => [c.id, c]));
      const duenoDe = new Map(datos.vehiculos.filter((v) => v.clienteId).map((v) => [v.placa, v.clienteId!]));
      const citas = datos.citas.map((c) => {
        const cl = porId.get(c.clienteId ?? '') ?? porId.get(duenoDe.get(c.placa) ?? '');
        const nombre = c.nombreCliente || (cl && !esNombreRelleno(cl.nombre) ? cl.nombre : undefined);
        const celular = c.celularCliente || cl?.celular || undefined;
        return { ...c, clienteId: undefined, nombreCliente: nombre, celularCliente: celular };
      });
      if (citas.length) await crearVarios('citas', citas as any);
      // 2. Borra historial, vehículos y clientes (también los que estaban en la papelera)
      setPaso('Borrando historial…');
      await borrarDefinitivo('interacciones', datos.interacciones.map((x) => x.id));
      setPaso('Borrando vehículos…');
      await borrarDefinitivo('vehiculos', datos.vehiculos.map((x) => x.id));
      setPaso('Borrando clientes…');
      await borrarDefinitivo('clientes', datos.clientes.map((x) => x.id));
      avisar(`Base de clientes vaciada. La agenda conserva sus ${citas.length} citas.`);
      setTexto('');
      setRespaldado(false);
    } catch (e) {
      console.error(e);
      avisar('No se pudo terminar. Revisa la conexión y vuelve a intentarlo: lo que ya se borró no se repite.', 'error');
    } finally {
      setPaso('');
    }
  };

  return (
    <Panel titulo="Vaciar base de clientes" className="border-rojo/30 lg:col-span-2">
      <p className="text-sm">
        Borra <strong className="num">{n.clientes.toLocaleString('es-PE')}</strong> clientes, <strong className="num">{n.vehiculos.toLocaleString('es-PE')}</strong> vehículos y{' '}
        <strong className="num">{n.interacciones.toLocaleString('es-PE')}</strong> registros de historial, para volver a cargar la base ya normalizada.
      </p>
      <p className="mt-1.5 text-sm text-gris">
        <strong className="text-tinta">La agenda no se toca:</strong> antes de borrar, cada cita guarda una copia del nombre y celular del cliente, así el botón Recordar sigue funcionando.
        Tampoco se tocan Cambio de aceite, Convenios, Taller ni Inventario.
      </p>
      <ol className="mt-4 space-y-3 text-sm">
        <li className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">1.</span>
          <Boton
            tam="sm"
            variante="secundario"
            icono={<Download className="h-3.5 w-3.5" />}
            onClick={async () => {
              if (await onRespaldo()) setRespaldado(true);
            }}
          >
            Descargar respaldo
          </Boton>
          {respaldado ? <span className="text-ok">Respaldo descargado ✓</span> : <span className="text-gris">Obligatorio: es la única forma de recuperar los datos.</span>}
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">2.</span>
          <span className="text-gris">Escribe <strong className="text-tinta">BORRAR</strong> para confirmar:</span>
          <Entrada
            aria-label="Escribe BORRAR para confirmar"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="h-9 !w-44"
            disabled={!respaldado || !!paso}
          />
          <Boton tam="sm" variante="peligro" disabled={!respaldado || texto.trim() !== 'BORRAR' || !!paso || total === 0} onClick={vaciar}>
            {paso || 'Vaciar base de clientes'}
          </Boton>
          {total === 0 && <span className="text-gris">La base ya está vacía.</span>}
        </li>
      </ol>
    </Panel>
  );
}

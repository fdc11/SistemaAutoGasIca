import { useMemo, useState } from 'react';
import { Download, RotateCcw, Trash2, X } from 'lucide-react';
import { useDatos } from '../data/store';
import { useAuth } from '../data/auth';
import { borrarDatosDemo } from '../data/backend';
import { sembrarCatalogo } from '../data/demo';
import { COLECCIONES, type Listas, type NombreColeccion } from '../lib/types';
import { fechaHora, hoyISO } from '../lib/utils';
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
  productos: 'Producto',
  movimientos: 'Movimiento',
  importaciones: 'Importación',
  ajustes: 'Ajustes',
};

const LISTAS: { clave: keyof Pick<Listas, 'servicios' | 'subcanales' | 'motivosPerdida' | 'tecnicos' | 'ciudades' | 'asesores'>; titulo: string; ayuda: string }[] = [
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

  const respaldo = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const col of COLECCIONES) {
      const filas = (datos[col] as any[]).map((x) =>
        Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : v])),
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ vacio: '' }]), col.slice(0, 31));
    }
    XLSX.writeFile(wb, `respaldo-autogas-${hoyISO()}.xlsx`);
    avisar('Respaldo descargado.');
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
            <Boton className="mt-4" variante="secundario" icono={<Download className="h-4 w-4" />} onClick={respaldo}>
              Descargar respaldo completo
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
        <Entrada value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Agregar opción" />
        <Boton type="submit" variante="secundario" disabled={!nuevo.trim()}>
          Agregar
        </Boton>
      </form>
    </Panel>
  );
}

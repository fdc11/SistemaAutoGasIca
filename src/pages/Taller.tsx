import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { differenceInMinutes, parseISO } from 'date-fns';
import { LogIn, Wrench } from 'lucide-react';
import { useDatos, useActivos } from '../data/store';
import { useAcciones } from '../data/acciones';
import { AREAS, nombreArea } from '../lib/catalogos';
import type { Area, Ingreso } from '../lib/types';
import { clientePorPlaca } from '../lib/analisis';
import { ahoraISO, cx, fechaCorta, horaDe, hoyISO, normalizarPlaca, placaValida } from '../lib/utils';
import { Boton, Campo, Encabezado, Entrada, Etiqueta, Modal, Panel, Selector, Tabla, Td, Th, Vacio, useAvisos } from '../components/ui';
import { BotonesExcel } from '../components/BotonesExcel';

const duracion = (a: string, b?: string) => {
  const m = differenceInMinutes(b ? parseISO(b) : new Date(), parseISO(a));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

export default function Taller() {
  const ingresos = useActivos('ingresos');
  const { editar, datos } = useDatos();
  const avisar = useAvisos();
  const [fecha, setFecha] = useState(hoyISO());
  const [nuevo, setNuevo] = useState(false);

  const enTaller = useMemo(() => ingresos.filter((i) => !i.horaSalida).sort((a, b) => a.horaIngreso.localeCompare(b.horaIngreso)), [ingresos]);
  const delDia = useMemo(
    () => ingresos.filter((i) => i.horaIngreso.slice(0, 10) === fecha || (i.horaSalida ?? '').slice(0, 10) === fecha).sort((a, b) => b.horaIngreso.localeCompare(a.horaIngreso)),
    [ingresos, fecha],
  );

  const salida = async (i: Ingreso) => {
    await editar('ingresos', i.id, { horaSalida: ahoraISO() });
    const { cliente } = clientePorPlaca(i.placa, datos.vehiculos, datos.clientes);
    if (cliente && cliente.estado !== 'atendido') await editar('clientes', cliente.id, { estado: 'atendido' });
    avisar(`${i.placa} salió del taller.`);
  };

  return (
    <>
      <Encabezado
        titulo="Control de taller"
        descripcion="Qué vehículos están dentro, en qué área y con qué técnico. Al registrar la salida, el cliente pasa a Atendido."
        acciones={
          <>
            <BotonesExcel seccion="Control de taller" exportar={['taller']} />
            <Boton icono={<LogIn className="h-4 w-4" />} onClick={() => setNuevo(true)}>
              Registrar ingreso
            </Boton>
          </>
        }
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {AREAS.map((a) => {
          const lista = enTaller.filter((i) => i.area === a.id);
          return (
            <Panel key={a.id} titulo={`${a.nombre} · ${lista.length} en taller`} sinRelleno>
              {lista.length === 0 ? (
                <p className="px-5 py-6 text-sm text-gris">No hay vehículos en esta área.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {lista.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                      <span className="rounded border border-linea-fuerte px-2 py-0.5 font-display text-lg font-semibold tracking-wide num">{i.placa}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.servicio}</p>
                        <p className="text-[13px] text-gris">
                          {[i.marcaModelo, i.tecnico ? `Técnico: ${i.tecnico}` : 'Sin técnico'].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className="text-right text-[13px]">
                        <p className="font-medium num">Entró {horaDe(i.horaIngreso)}</p>
                        <p className="text-gris num">{duracion(i.horaIngreso)}</p>
                      </div>
                      <Boton tam="sm" variante="secundario" onClick={() => salida(i)}>
                        Registrar salida
                      </Boton>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      <Panel
        titulo="Movimientos del día"
        acciones={<Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value || hoyISO())} className="h-9 !w-40" aria-label="Fecha" />}
        sinRelleno
      >
        {delDia.length === 0 ? (
          <Vacio icono={<Wrench className="h-8 w-8" />} titulo={`Sin ingresos el ${fechaCorta(fecha)}`} texto="Los ingresos se registran aquí o desde una cita de la agenda." />
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>Placa</Th>
                <Th>Vehículo</Th>
                <Th>Servicio</Th>
                <Th>Área</Th>
                <Th>Técnico</Th>
                <Th>Ingreso</Th>
                <Th>Salida</Th>
                <Th>Tiempo</Th>
              </tr>
            </thead>
            <tbody>
              {delDia.map((i) => (
                <tr key={i.id}>
                  <Td className="font-semibold num">{i.placa}</Td>
                  <Td>{i.marcaModelo || '—'}</Td>
                  <Td>{i.servicio}</Td>
                  <Td>{nombreArea(i.area)}</Td>
                  <Td>{i.tecnico || '—'}</Td>
                  <Td className="num">{horaDe(i.horaIngreso)}</Td>
                  <Td className="num">{i.horaSalida ? horaDe(i.horaSalida) : <Etiqueta tono="aviso">En taller</Etiqueta>}</Td>
                  <Td className="num">{duracion(i.horaIngreso, i.horaSalida)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Panel>

      {nuevo && <NuevoIngreso onCerrar={() => setNuevo(false)} />}
    </>
  );
}

function NuevoIngreso({ onCerrar }: { onCerrar: () => void }) {
  const { crear, listas, datos } = useDatos();
  const { asegurarVehiculo } = useAcciones();
  const avisar = useAvisos();
  const [placa, setPlaca] = useState('');
  const [servicio, setServicio] = useState('');
  const [area, setArea] = useState<Area>('gas');
  const [tecnico, setTecnico] = useState('');
  const [error, setError] = useState('');
  const p = normalizarPlaca(placa);
  const { cliente, vehiculo } = placaValida(p) ? clientePorPlaca(p, datos.vehiculos, datos.clientes) : { cliente: undefined, vehiculo: undefined };

  const guardar = async () => {
    if (!placaValida(p)) return setError('Escribe una placa válida de 6 caracteres.');
    if (!servicio) return setError('Elige el servicio.');
    await asegurarVehiculo(p);
    await crear('ingresos', {
      placa: p,
      marcaModelo: [vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(' ') || undefined,
      servicio,
      area,
      tecnico: tecnico || undefined,
      horaIngreso: ahoraISO(),
    });
    avisar(`${p} ingresó al taller.`);
    onCerrar();
  };

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Registrar ingreso"
      descripcion="Para vehículos que llegan sin cita."
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar}>Registrar ingreso</Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Placa" requerido className="sm:col-span-2">
          <Entrada value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
        </Campo>
        {placaValida(p) && (
          <p className={cx('rounded-md bg-fondo px-3 py-2 text-sm sm:col-span-2', !cliente && 'text-gris')}>
            {cliente ? (
              <>
                {cliente.nombre} · {[vehiculo?.marca, vehiculo?.modelo].filter(Boolean).join(' ')}
              </>
            ) : (
              <>
                Placa sin cliente.{' '}
                <Link to="/registrar/presencial" className="font-semibold text-tinta underline">
                  Registrar cliente
                </Link>
              </>
            )}
          </p>
        )}
        <Campo etiqueta="Servicio" requerido>
          <Selector value={servicio} onChange={(e) => setServicio(e.target.value)}>
            <option value="">Elegir</option>
            {listas.servicios.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Área">
          <Selector value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Técnico a cargo" className="sm:col-span-2" ayuda={listas.tecnicos.length ? undefined : 'Agrega técnicos en Ajustes.'}>
          <Selector value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
            <option value="">Sin asignar</option>
            {listas.tecnicos.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Selector>
        </Campo>
      </div>
      {error && <p className="mt-4 rounded-md bg-rojo-suave px-3 py-2 text-sm text-rojo-osc">{error}</p>}
    </Modal>
  );
}

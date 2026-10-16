// Lectura de la hoja «TABLA DE PROSPECTOS» (FORMATO CONTROL NUMEROS) para la sección Números nuevos.
// Conserva la fecha de contacto y el último contacto de cada fila del Excel.
import type { EstadoNumero, NumeroNuevo, Nuevo } from '../lib/types';
import { normalizarCelular, normalizarPlaca, placaValida, plano, titulo } from '../lib/utils';
import { claveEncabezado, inferirEstado, leerFecha, leerMarca, leerServicio, texto, type Celda, type Hoja } from './lectura';

const COLUMNAS: Record<string, string[]> = {
  fecha: ['fechadecontacto', 'fecha', 'fechacontacto'],
  telefono: ['telefono', 'celular', 'numero', 'numerodecelular', 'numerodetelefono'],
  nombre: ['nombrecompletocontacto', 'nombrecompleto', 'nombre', 'nombresyapellidos', 'contacto'],
  tipo: ['tipodecontacto', 'tipocontacto', 'fuente', 'canal', 'fuentedecampana'],
  interes: ['interes', 'servicio', 'tipodeserviciosconsultado', 'tipodeservicioconsultado'],
  area: ['area'],
  placa: ['placa'],
  marca: ['marca', 'marcadelvehiculo'],
  modelo: ['modeloyano', 'modelo', 'modeloano'],
  cita: ['fechadecita', 'cita'],
  ultimo: ['ultimocontacto', 'ultimocontecto', 'ultimocontato'],
  comentarios: ['comentarios', 'comentario', 'observaciones', 'notas'],
  estado: ['estado'],
};

/** Encuentra la fila de encabezados (la que tiene teléfono y fecha) y el índice de cada columna. */
export function detectarEncabezado(hoja: Hoja): { fila: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(15, hoja.filas.length); i++) {
    const claves = (hoja.filas[i] ?? []).map((c) => claveEncabezado(c));
    const col: Record<string, number> = {};
    for (const [campo, alias] of Object.entries(COLUMNAS)) {
      // Primero coincidencia exacta, luego la que empieza igual
      let k = claves.findIndex((c) => alias.includes(c));
      if (k < 0) k = claves.findIndex((c) => c && alias.some((a) => c.startsWith(a)));
      if (k >= 0) col[campo] = k;
    }
    if (col.telefono != null && col.fecha != null) return { fila: i, col };
  }
  return null;
}

/** «wstp», «PUBLICIDAD», «ORGANICO»… → tipo de contacto de la lista del sistema. */
export function leerTipoContacto(v: Celda): string {
  const t = plano(v).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Sin dato';
  if (/^(w|wh|wa|ws|was|wsp|wstp|wsyp|wastp|whatsapp|whatsap|watsap)/.test(t.replace(/\s/g, ''))) return 'WhatsApp';
  if (/facebook|fb/.test(t)) return 'Facebook Ads';
  if (/tiktok/.test(t)) return 'TikTok Ads';
  if (/instagram/.test(t)) return 'Instagram';
  if (/google/.test(t)) return 'Google';
  if (/publicidad|anuncio|ads/.test(t)) return 'Publicidad';
  if (/organico/.test(t)) return 'Orgánico';
  if (/cliente/.test(t)) return 'Cliente recurrente';
  if (/referid|referenc|recomend/.test(t)) return 'Referido';
  if (/llamada|telefon/.test(t)) return 'Llamada';
  if (/presencial|local|taller/.test(t)) return 'Presencial';
  return titulo(texto(v));
}

/** Estado del número según el comentario («SE LE ENVIO COTIZACION», «NO CONTESTA»…). */
function estadoDe(comentario: string, estadoExcel: string): EstadoNumero {
  const e = plano(estadoExcel);
  if (e) {
    if (/concret|atendid|cerrad|realiz/.test(e)) return 'concretado';
    if (/perdid/.test(e)) return 'perdido';
    if (/cita/.test(e)) return 'cita';
    if (/cotiz/.test(e)) return 'cotizacion';
    if (/sin respuesta|no contest/.test(e)) return 'sin_respuesta';
    if (/nuevo/.test(e)) return 'nuevo';
    if (/contact|seguim/.test(e)) return 'contactado';
  }
  const t = plano(comentario);
  if (!t) return 'contactado';
  if (/(no contest|no respond|sin respuesta|no responde)/.test(t)) return 'sin_respuesta';
  const inf = inferirEstado(comentario, 'contactado').estado;
  return inf === 'atendido' ? 'concretado' : inf === 'perdido' ? 'perdido' : inf === 'cita' ? 'cita' : inf === 'cotizacion' ? 'cotizacion' : 'contactado';
}

/** Área deducida del interés (solo cuando es claro). */
export function areaDeInteres(servicio: string | undefined, areas: string[]): string | undefined {
  const s = plano(servicio);
  if (!s) return undefined;
  const buscar = (re: RegExp) => areas.find((a) => re.test(plano(a)));
  if (/conversion/.test(s)) return buscar(/convers/);
  if (/gas|regulacion|quinquenal|certificacion|tanque|electronica|inyector/.test(s)) return buscar(/^gas/);
  if (/aceite|mantenimiento (mayor|menor)|afinamiento|bujia|refrigerante|diagnostico/.test(s)) return buscar(/mecan/);
  return undefined;
}

export interface ResultadoLectura {
  docs: Nuevo<NumeroNuevo>[];
  leidas: number;
  unidas: number; // filas del mismo número dentro del archivo, juntadas en una sola
  yaRegistrados: { fila: number; celular: string }[];
  sinTelefono: { fila: number; detalle: string }[];
  fechasCorregidas: { fila: number; detalle: string }[];
}

/**
 * Convierte la hoja en números nuevos.
 * - Un número = un celular. Si aparece varias veces en el archivo se junta: fecha = la primera, último contacto = el más reciente.
 * - Los celulares que ya están en el sistema se omiten.
 */
export function leerNumeros(hoja: Hoja, existentes: Set<string>, opciones: { area?: string; deducirArea: boolean; areas: string[] }): ResultadoLectura | null {
  const enc = detectarEncabezado(hoja);
  if (!enc) return null;
  const { col } = enc;
  const v = (fila: Celda[], campo: string): Celda => (col[campo] != null ? fila[col[campo]] ?? null : null);
  const anioHoja = Number(hoja.nombre.match(/20\d{2}/)?.[0]) || undefined;

  const porCel = new Map<string, Nuevo<NumeroNuevo> & { _filas: number[] }>();
  const r: ResultadoLectura = { docs: [], leidas: 0, unidas: 0, yaRegistrados: [], sinTelefono: [], fechasCorregidas: [] };

  hoja.filas.forEach((fila, i) => {
    if (i <= enc.fila || !fila || !fila.some((c) => texto(c))) return;
    const nFila = i + 1;
    r.leidas++;
    const crudo = texto(v(fila, 'telefono'));
    const cel = normalizarCelular(crudo);
    if (!cel) {
      r.sinTelefono.push({ fila: nFila, detalle: crudo ? `«${crudo}» no es un celular válido` : `sin teléfono (${texto(v(fila, 'nombre')) || 'sin nombre'})` });
      return;
    }
    if (existentes.has(cel)) {
      r.yaRegistrados.push({ fila: nFila, celular: cel });
      return;
    }

    let f = leerFecha(v(fila, 'fecha'));
    let u = leerFecha(v(fila, 'ultimo'));
    // Año mal escrito dentro de la hoja de un año (2003, 0202 → año de la hoja)
    const corregir = (x: { iso: string; valida: boolean }, crudoF: Celda, etiqueta: string) => {
      if (!anioHoja) return x;
      const m = (x.valida ? x.iso : '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m && Number(m[1]) !== anioHoja) {
        const iso = `${anioHoja}-${m[2]}-${m[3]}`;
        r.fechasCorregidas.push({ fila: nFila, detalle: `${etiqueta} «${texto(crudoF)}» → ${m[3]}/${m[2]}/${anioHoja}` });
        return { iso, valida: true };
      }
      return x;
    };
    f = corregir(f, v(fila, 'fecha'), 'Fecha');
    u = corregir(u, v(fila, 'ultimo'), 'Último contacto');
    // Fechas imposibles: arrastre automático de Excel (28/09 → 28/10 → 28/11…) o contacto posterior al último contacto
    const hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD local
    if (f.valida && u.valida && u.iso <= hoy && (f.iso > hoy || f.iso > u.iso)) {
      r.fechasCorregidas.push({
        fila: nFila,
        detalle: `Fecha de contacto ${f.iso.split('-').reverse().join('/')} ${f.iso > hoy ? 'está en el futuro' : 'es posterior al último contacto'}: se usó la del último contacto (${u.iso.split('-').reverse().join('/')})`,
      });
      f = u;
    }
    if (u.valida && u.iso > hoy) {
      r.fechasCorregidas.push({ fila: nFila, detalle: `Último contacto ${u.iso.split('-').reverse().join('/')} está en el futuro: se quitó` });
      u = { iso: '', valida: false };
    }
    if (f.valida && f.iso > hoy) {
      r.fechasCorregidas.push({ fila: nFila, detalle: `Fecha de contacto ${f.iso.split('-').reverse().join('/')} está en el futuro y no hay otra fecha: revísala después de importar` });
    }
    if (!f.valida && u.valida) {
      r.fechasCorregidas.push({ fila: nFila, detalle: 'Sin fecha de contacto: se usó la del último contacto' });
      f = u;
    }
    if (!f.valida) {
      r.sinTelefono.push({ fila: nFila, detalle: `${cel}: sin fecha de contacto ni de último contacto` });
      return;
    }
    const c = leerFecha(v(fila, 'cita'));
    const citaTxt = texto(v(fila, 'cita'));
    const comentario = [texto(v(fila, 'comentarios')), !c.valida && citaTxt ? `Cita: ${citaTxt}` : ''].filter(Boolean).join(' | ');
    const interesTxt = texto(v(fila, 'interes'));
    const interes = leerServicio(interesTxt);
    const pla = normalizarPlaca(v(fila, 'placa'));
    const areaExcel = texto(v(fila, 'area'));
    const area = opciones.area || (areaExcel ? opciones.areas.find((a) => plano(a) === plano(areaExcel)) ?? titulo(areaExcel) : undefined) || (opciones.deducirArea ? areaDeInteres(interes, opciones.areas) : undefined);

    const doc: Nuevo<NumeroNuevo> & { _filas: number[] } = {
      fecha: f.iso,
      celular: cel,
      nombre: titulo(texto(v(fila, 'nombre'))) || undefined,
      tipoContacto: leerTipoContacto(v(fila, 'tipo')),
      interes,
      interesDetalle: interesTxt || undefined,
      area,
      placa: placaValida(pla) ? pla : undefined,
      marca: leerMarca(v(fila, 'marca')),
      modelo: titulo(texto(v(fila, 'modelo'))) || undefined,
      fechaCita: c.valida ? c.iso : undefined,
      ultimoContacto: u.valida ? u.iso : undefined,
      comentarios: comentario || undefined,
      estado: estadoDe(comentario, texto(v(fila, 'estado'))),
      _filas: [nFila],
    };

    const previo = porCel.get(cel);
    if (!previo) {
      porCel.set(cel, doc);
      return;
    }
    // Mismo número otra vez en el archivo: se junta con el primero
    r.unidas++;
    const primero = doc.fecha < previo.fecha ? doc : previo;
    const otro = primero === doc ? previo : doc;
    const ultimos = [previo.ultimoContacto, doc.ultimoContacto, previo.fecha, doc.fecha].filter(Boolean).sort();
    porCel.set(cel, {
      ...otro,
      ...Object.fromEntries(Object.entries(primero).filter(([, x]) => x !== undefined)),
      nombre: primero.nombre || otro.nombre,
      placa: primero.placa || otro.placa,
      marca: primero.marca || otro.marca,
      modelo: primero.modelo || otro.modelo,
      fechaCita: otro.fechaCita || primero.fechaCita,
      ultimoContacto: ultimos.at(-1),
      estado: otro.fecha >= primero.fecha ? otro.estado : primero.estado,
      comentarios: [...new Set([primero.comentarios, otro.comentarios].filter(Boolean))].join(' | ') || undefined,
      _filas: [...previo._filas, nFila],
    } as typeof doc);
  });

  r.docs = [...porCel.values()].map(({ _filas, ...d }) => d);
  return r;
}

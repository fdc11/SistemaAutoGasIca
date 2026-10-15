// Lectura de archivos Excel con SheetJS y utilidades de limpieza.
import * as XLSX from 'xlsx';
import { format, isValid } from 'date-fns';
import { plano, titulo } from '../lib/utils';
import type { Canal, EstadoCliente } from '../lib/types';

export type Celda = string | number | boolean | Date | null;
export interface Hoja {
  nombre: string;
  filas: Celda[][];
}

export async function leerArchivo(archivo: File): Promise<Hoja[]> {
  const buf = await archivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return wb.SheetNames.map((nombre) => {
    const ws = wb.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, defval: null, raw: true, blankrows: true });
    return { nombre, filas };
  });
}

export const letraColumna = (i: number) => {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
};

export const claveEncabezado = (v: unknown) => plano(v).replace(/[^a-z0-9]/g, '');

/** Fecha desde una celda: Date, número de serie de Excel, «dd/mm/aaaa» o «aaaa-mm-dd». */
export function leerFecha(v: Celda, anioMin = 2020): { iso: string; valida: boolean } {
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number' && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) d = new Date(p.y, p.m - 1, p.d);
  } else if (typeof v === 'string') {
    const t = v.trim();
    let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,5})/);
    if (m) {
      let y = Number(m[3]);
      if (m[3].length === 2) y += 2000;
      if (m[3].length === 5) {
        // «20206» o «02026»: sobra un dígito; se prueba quitando uno a la vez
        const max = new Date().getFullYear() + 1;
        for (let k = 0; k < 5; k++) {
          const c = Number(m[3].slice(0, k) + m[3].slice(k + 1));
          if (c >= anioMin && c <= max) {
            y = c;
            break;
          }
        }
      }
      d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    } else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  if (!d || !isValid(d)) return { iso: '', valida: false };
  const iso = format(d, 'yyyy-MM-dd');
  const y = d.getFullYear();
  const max = new Date().getFullYear() + 1;
  return { iso, valida: y >= anioMin && y <= max };
}

export const texto = (v: Celda) => (v == null ? '' : v instanceof Date ? format(v, 'dd/MM/yyyy') : String(v).replace(/\s+/g, ' ').trim());

export const numeroDe = (v: Celda): number | undefined => {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  const s = texto(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(s);
  return s && isFinite(n) ? n : undefined;
};

/** «WSTP», «whATSAPP», «Facebook Ads», «ORGANICO»… → canal del sistema. */
export function leerCanal(v: Celda): { canal: Canal; subcanal?: string } | null {
  const t = plano(v).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^(w|wh|wa|ws|was|wsp|wstp|wsyp|wastp|whatsapp|whatsap|watsap)/.test(t.replace(/\s/g, ''))) return { canal: 'whatsapp' };
  if (/facebook|fb/.test(t)) return { canal: 'publicidad', subcanal: 'Facebook Ads' };
  if (/tiktok/.test(t)) return { canal: 'publicidad', subcanal: 'TikTok Ads' };
  if (/instagram|ig\b/.test(t)) return { canal: 'publicidad', subcanal: 'Instagram' };
  if (/google/.test(t)) return { canal: 'publicidad', subcanal: 'Google' };
  if (/publicidad|anuncio|ads/.test(t)) return { canal: 'publicidad', subcanal: 'Facebook Ads' };
  if (/organico|presencial|local|taller|cliente/.test(t)) return { canal: 'presencial' };
  if (/referid|referenc|recomend/.test(t)) return { canal: 'referido' };
  if (/llamada|telefon/.test(t)) return { canal: 'llamada' };
  if (/convenio|empresa/.test(t)) return { canal: 'convenio' };
  return null;
}

/** Deduce el estado a partir del comentario libre. Devuelve también si fue una deducción segura. */
export function inferirEstado(comentario: string, porDefecto: EstadoCliente = 'contactado'): { estado: EstadoCliente; motivo?: string } {
  const t = plano(comentario);
  if (!t) return { estado: porDefecto };
  if (/(realizo|se realizo|realizado|atendido|vino al taller|instalad|ya se hizo|hizo el servicio)/.test(t)) return { estado: 'atendido' };
  if (/(otra ciudad|de lima|de arequipa|provincia)/.test(t)) return { estado: 'perdido', motivo: 'Es de otra ciudad' };
  if (/(no interesad|no desea|ya no|vendio|compro en otro|otro taller|lo hizo en)/.test(t)) return { estado: 'perdido', motivo: 'Lo hizo en otro taller' };
  if (/(cita programada|agendo|agendad|separo cita|cita el)/.test(t)) return { estado: 'cita' };
  if (/(cotiz|coizacion|proforma|precio enviado)/.test(t)) return { estado: 'cotizacion' };
  if (/(no contest|no respond|sin respuesta|no responde)/.test(t)) return { estado: 'seguimiento' };
  if (/(seguimiento|interesad|por confirmar|confirmara|se acercara|se apersonara|llamar)/.test(t)) return { estado: 'seguimiento' };
  return { estado: porDefecto };
}

/** «NEW LEGACY 2010» → modelo «New Legacy», año «2010». */
export function separarModeloAnio(v: Celda): { modelo?: string; anio?: string } {
  const t = texto(v);
  if (!t) return {};
  if (/^\d{4}$/.test(t)) return { anio: t };
  const m = t.match(/^(.*?)\s*((?:19|20)\d{2})\s*$/);
  if (m) return { modelo: titulo(m[1]) || undefined, anio: m[2] };
  return { modelo: titulo(t) };
}

/** Normaliza marcas frecuentes mal escritas. */
export function leerMarca(v: Celda): string | undefined {
  const t = plano(v).replace(/[^a-z ]/g, '').trim();
  if (!t) return undefined;
  const mapa: Record<string, string> = {
    hiunday: 'Hyundai', hyumdai: 'Hyundai', hyuandai: 'Hyundai', hyundai: 'Hyundai', hiundai: 'Hyundai',
    chagan: 'Changan', changan: 'Changan', susuki: 'Suzuki', nazda: 'Mazda', bmv: 'BMW', bmw: 'BMW',
    hilux: 'Toyota', hillux: 'Toyota', yaris: 'Toyota', vw: 'Volkswagen', volkswagen: 'Volkswagen',
    jac: 'JAC', dfsk: 'DFSK', baic: 'BAIC', jetour: 'Jetour', geely: 'Geely', kia: 'Kia', toyota: 'Toyota',
    nissan: 'Nissan', chevrolet: 'Chevrolet', mitsubishi: 'Mitsubishi', renault: 'Renault', daewoo: 'Daewoo',
    'great wall': 'Great Wall', 'ssang yong': 'SsangYong', ssangyong: 'SsangYong', peugeot: 'Peugeot', foton: 'Foton',
  };
  return mapa[t] ?? mapa[t.replace(/\s/g, '')] ?? titulo(t);
}

/** Servicio de interés: unifica «MTTO», errores de tipeo y mayúsculas. */
export function leerServicio(v: Celda): string | undefined {
  const t = plano(v);
  if (!t) return undefined;
  if (/gnv/.test(t) && /convers|^gnv$/.test(t)) return 'Conversión GNV';
  if (/glp/.test(t) && /convers|^glp$/.test(t)) return 'Conversión GLP';
  if (/^gnv\b/.test(t)) return 'Conversión GNV';
  if (/^glp\b/.test(t)) return 'Conversión GLP';
  if (/(mtto|manten|mantein|mantenimeinto).*(gas|glp|gnv)/.test(t)) return 'Mantenimiento de gas';
  if (/(mtto|manten|mantein).*mayor/.test(t)) return 'Mantenimiento mayor';
  if (/(mtto|manten|mantein).*menor/.test(t)) return 'Mantenimiento menor';
  if (/regulac|calibrac/.test(t)) return 'Regulación de gas';
  if (/1\.?000\s*km|control mil|mil km|1000/.test(t)) return 'Control 1,000 km';
  if (/certific/.test(t)) return 'Certificación anual';
  if (/quinquenal/.test(t)) return 'Revisión quinquenal';
  if (/diagnost|escaneo|scanner/.test(t)) return 'Diagnóstico';
  if (/garantia/.test(t)) return 'Garantía';
  if (/aceite|acite|castrol|moly|vistony|shell|mobil|promo/.test(t)) return 'Cambio de aceite';
  if (/afinamiento/.test(t)) return 'Afinamiento';
  if (/bujia/.test(t)) return 'Cambio de bujías';
  if (/electronic/.test(t)) return 'Cambio de electrónica';
  if (/inyector/.test(t)) return 'Cambio de inyectores';
  if (/tanque/.test(t)) return 'Montaje de tanque';
  if (/refrigerante/.test(t)) return 'Carga de refrigerante';
  if (/(mtto|manten|mantein)/.test(t)) return 'Mantenimiento menor';
  return titulo(String(v));
}

export function horaAgenda(v: Celda): string | null {
  const t = texto(v).toUpperCase();
  const m = t.match(/^(\d{1,2})[:.](\d{2})\s*(AM|PM)?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

import { format, parseISO, isValid, differenceInCalendarDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

/** Celular peruano: 9 dígitos que empiezan en 9. Quita espacios, guiones y +51. */
export function normalizarCelular(v: unknown): string {
  let s = String(v ?? '').replace(/\D/g, '');
  if (s.length === 11 && s.startsWith('51')) s = s.slice(2);
  return /^9\d{8}$/.test(s) ? s : '';
}
export const celularValido = (v: string) => /^9\d{8}$/.test(v);
export const formatoCelular = (v?: string) =>
  v && v.length === 9 ? `${v.slice(0, 3)} ${v.slice(3, 6)} ${v.slice(6)}` : v || '—';

/** Placa: 6 caracteres alfanuméricos en mayúscula, sin guion ni espacios. */
export function normalizarPlaca(v: unknown): string {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s;
}
export const placaValida = (v: string) => /^[A-Z0-9]{6}$/.test(v);

/** Busca una placa dentro de un texto sucio ("Y2G200 11:30", "Csq-589"). */
export function extraerPlaca(v: unknown): string {
  const t = String(v ?? '').toUpperCase();
  const m = t.match(/\b([A-Z0-9]{3})[\s-]?([A-Z0-9]{3})\b/);
  if (!m) return '';
  const p = (m[1] + m[2]).replace(/[^A-Z0-9]/g, '');
  return /\d/.test(p) && /[A-Z]/.test(p) ? p : '';
}

export const titulo = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export const hoyISO = () => format(new Date(), 'yyyy-MM-dd');
export const ahoraISO = () => new Date().toISOString();

export function fechaCorta(v?: string) {
  if (!v) return '—';
  const d = parseISO(v);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '—';
}
export function fechaLarga(v?: string) {
  if (!v) return '—';
  const d = parseISO(v);
  return isValid(d) ? format(d, "d 'de' MMMM yyyy", { locale: es }) : '—';
}
export function fechaHora(v?: string) {
  if (!v) return '—';
  const d = parseISO(v);
  return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm') : '—';
}
export function horaDe(v?: string) {
  if (!v) return '—';
  const d = parseISO(v);
  return isValid(d) ? format(d, 'HH:mm') : '—';
}
export const diasDesde = (v?: string) => {
  if (!v) return Infinity;
  const d = parseISO(v);
  return isValid(d) ? differenceInCalendarDays(new Date(), d) : Infinity;
};
export const sumarDias = (iso: string, dias: number) => format(addDays(parseISO(iso), dias), 'yyyy-MM-dd');

export const soles = (n?: number) =>
  n == null || isNaN(n)
    ? '—'
    : 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const numero = (n?: number) => (n == null || isNaN(n) ? '—' : n.toLocaleString('es-PE'));

export const enlaceWhatsApp = (celular: string, mensaje = '') =>
  `https://wa.me/51${celular}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;

/** Quita tildes y pasa a minúsculas, para buscar y comparar. */
export const plano = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Similitud 0..1 entre dos textos (Levenshtein normalizado). */
export function similitud(a: string, b: string) {
  a = plano(a);
  b = plano(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length,
    n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n);
}

export function mediana(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

export function agruparPor<T, K extends string | number>(xs: T[], f: (x: T) => K) {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = f(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Nombres de relleno que dejó la importación («Sin nombre», «Cliente Y2B688»). */
export const esNombreRelleno = (n?: string) => !n?.trim() || /^sin nombre$/i.test(n.trim()) || /^cliente\s+[a-z0-9]{6}$/i.test(n.trim());
export const nombreReal = (n?: string) => (esNombreRelleno(n) ? '' : n!.trim());

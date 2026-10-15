import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseActivo } from './firebase';
import type { NombreColeccion } from '../lib/types';

type Doc = Record<string, any> & { id: string };
type Listener = (docs: Doc[]) => void;

export interface Backend {
  modo: 'firebase' | 'demo';
  subscribe(col: NombreColeccion, cb: Listener): () => void;
  set(col: NombreColeccion, id: string, data: Doc): Promise<void>;
  update(col: NombreColeccion, id: string, patch: Record<string, any>): Promise<void>;
  remove(col: NombreColeccion, id: string): Promise<void>;
  setMany(col: NombreColeccion, docs: Doc[]): Promise<void>;
  removeMany(col: NombreColeccion, ids: string[]): Promise<void>;
}

const limpiar = (o: Record<string, any>) => {
  const r: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r;
};

/* ---------------- Firestore ---------------- */

const LOTE = 450; // Firestore permite 500 operaciones por lote

function firestoreBackend(): Backend {
  const d = db!;
  return {
    modo: 'firebase',
    subscribe(col, cb) {
      return onSnapshot(collection(d, col), (snap) => {
        cb(snap.docs.map((x) => ({ ...(x.data() as any), id: x.id })));
      });
    },
    async set(col, id, data) {
      const { id: _, ...rest } = data;
      await setDoc(doc(d, col, id), limpiar(rest));
    },
    async update(col, id, patch) {
      await updateDoc(doc(d, col, id), limpiar(patch));
    },
    async remove(col, id) {
      await deleteDoc(doc(d, col, id));
    },
    async setMany(col, docs) {
      for (let i = 0; i < docs.length; i += LOTE) {
        const b = writeBatch(d);
        for (const x of docs.slice(i, i + LOTE)) {
          const { id, ...rest } = x;
          b.set(doc(d, col, id), limpiar(rest));
        }
        await b.commit();
      }
    },
    async removeMany(col, ids) {
      for (let i = 0; i < ids.length; i += LOTE) {
        const b = writeBatch(d);
        for (const id of ids.slice(i, i + LOTE)) b.delete(doc(d, col, id));
        await b.commit();
      }
    },
  };
}

/* ---------------- Modo demostración (localStorage) ---------------- */

const CLAVE = (col: string) => `autogas:${col}`;

function demoBackend(): Backend {
  const mem = new Map<string, Map<string, Doc>>();
  const subs = new Map<string, Set<Listener>>();

  const cargar = (col: string) => {
    if (!mem.has(col)) {
      let arr: Doc[] = [];
      try {
        arr = JSON.parse(localStorage.getItem(CLAVE(col)) || '[]');
      } catch {
        arr = [];
      }
      mem.set(col, new Map(arr.map((x) => [x.id, x])));
    }
    return mem.get(col)!;
  };
  const emitir = (col: string) => {
    const m = cargar(col);
    const arr = [...m.values()];
    try {
      localStorage.setItem(CLAVE(col), JSON.stringify(arr));
    } catch {
      /* almacenamiento lleno: los datos siguen en memoria */
    }
    subs.get(col)?.forEach((cb) => cb(arr));
  };

  return {
    modo: 'demo',
    subscribe(col, cb) {
      if (!subs.has(col)) subs.set(col, new Set());
      subs.get(col)!.add(cb);
      cb([...cargar(col).values()]);
      return () => subs.get(col)!.delete(cb);
    },
    async set(col, id, data) {
      cargar(col).set(id, limpiar({ ...data, id }) as Doc);
      emitir(col);
    },
    async update(col, id, patch) {
      const m = cargar(col);
      const cur = m.get(id);
      if (cur) m.set(id, limpiar({ ...cur, ...patch }) as Doc);
      emitir(col);
    },
    async remove(col, id) {
      cargar(col).delete(id);
      emitir(col);
    },
    async setMany(col, docs) {
      const m = cargar(col);
      for (const x of docs) m.set(x.id, limpiar(x) as Doc);
      emitir(col);
    },
    async removeMany(col, ids) {
      const m = cargar(col);
      for (const id of ids) m.delete(id);
      emitir(col);
    },
  };
}

export const backend: Backend = firebaseActivo ? firestoreBackend() : demoBackend();

export function borrarDatosDemo() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('autogas:'))
    .forEach((k) => localStorage.removeItem(k));
}

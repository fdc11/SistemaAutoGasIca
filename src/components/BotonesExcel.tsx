import { lazy, Suspense, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { Boton } from './ui';
import type { FormatoExtra } from './ExportadorExcel';

// Se cargan solo al abrirlos: así las pantallas no cargan el lector de Excel si no se usa.
const ImportadorExcel = lazy(() => import('./ImportadorExcel').then((m) => ({ default: m.ImportadorExcel })));
const ExportadorExcel = lazy(() => import('./ExportadorExcel').then((m) => ({ default: m.ExportadorExcel })));

/** Botones «Importar» y «Exportar» de cada sección, con solo los formatos que le corresponden. */
export function BotonesExcel({
  importar,
  exportar,
  extras,
  seccion,
}: {
  importar?: string[];
  exportar?: string[];
  extras?: FormatoExtra[];
  seccion: string;
}) {
  const [abierto, setAbierto] = useState<'importar' | 'exportar' | null>(null);
  return (
    <>
      {!!importar?.length && (
        <Boton variante="secundario" icono={<FileUp className="h-4 w-4" />} onClick={() => setAbierto('importar')}>
          Importar
        </Boton>
      )}
      {(!!exportar?.length || !!extras?.length) && (
        <Boton variante="secundario" icono={<Download className="h-4 w-4" />} onClick={() => setAbierto('exportar')}>
          Exportar
        </Boton>
      )}
      <Suspense fallback={null}>
        {abierto === 'importar' && importar && <ImportadorExcel plantillas={importar} titulo={`Importar a ${seccion}`} onCerrar={() => setAbierto(null)} />}
        {abierto === 'exportar' && <ExportadorExcel formatos={exportar ?? []} extras={extras} titulo={`Exportar ${seccion}`} onCerrar={() => setAbierto(null)} />}
      </Suspense>
    </>
  );
}

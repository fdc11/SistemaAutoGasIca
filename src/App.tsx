import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './data/auth';
import { DataProvider } from './data/store';
import { AvisosProvider } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Registrar from './pages/Registrar';
import Clientes from './pages/Clientes';
import Numeros from './pages/Numeros';
import FichaCliente from './pages/FichaCliente';
import Agenda from './pages/Agenda';
import Taller from './pages/Taller';
import Aceite from './pages/Aceite';
import Convenios from './pages/Convenios';
import Inventario from './pages/Inventario';
import Ajustes from './pages/Ajustes';
import Exportar from './pages/Exportar';

const Importar = lazy(() => import('./pages/Importar'));

function Rutas() {
  const { usuario, cargando } = useAuth();
  if (cargando) return null;
  if (!usuario) return <Login />;
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Inicio />} />
          <Route path="registrar" element={<Registrar />} />
          <Route path="registrar/:canal" element={<Registrar />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:id" element={<FichaCliente />} />
          <Route path="numeros" element={<Numeros />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="taller" element={<Taller />} />
          <Route path="aceite" element={<Aceite />} />
          <Route path="convenios" element={<Convenios />} />
          <Route path="inventario" element={<Inventario />} />
          <Route
            path="importar"
            element={
              <Suspense fallback={<p className="text-sm text-gris">Cargando importador…</p>}>
                <Importar />
              </Suspense>
            }
          />
          <Route path="exportar" element={<Exportar />} />
          <Route path="ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AvisosProvider>
        <Rutas />
      </AvisosProvider>
    </AuthProvider>
  );
}

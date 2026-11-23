import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

/*
 * Escala uniforme en pantallas anchas.
 * El diseño se ve como en una laptop de ~1360 px de ancho. En monitores más anchos
 * (1600, 1920, 2560 px…) todo se agranda en la misma proporción, en vez de verse
 * chiquito y con espacios vacíos. En pantallas de 1360 px o menos no cambia nada.
 */
const ANCHO_DISENO = 1360;
function ajustarEscala() {
  const z = Math.min(Math.max(window.innerWidth / ANCHO_DISENO, 1), 1.75);
  const r = document.documentElement;
  r.style.setProperty('--z', z.toFixed(3));
}
ajustarEscala();
window.addEventListener('resize', ajustarEscala);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

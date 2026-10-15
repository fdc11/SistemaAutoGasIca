# Sistema AutoGas Ica

Aplicación web que reemplaza los Excel del taller. Junta en un solo lugar:

- los clientes de todos los canales,
- la agenda,
- el control de taller,
- el seguimiento de cambio de aceite,
- los convenios,
- el inventario de equipos.

Funciona en PC y en celular.

## 1. Probarlo en tu computadora

Necesitas tener instalado **Node.js 20 o más reciente** (https://nodejs.org).

Abre una terminal en esta carpeta y ejecuta:

```bash
npm install
npm run dev
```

Luego abre http://localhost:5173 en el navegador.

Sin configurar Firebase, el sistema arranca en **modo demostración**:

- Entras con cualquier correo y una contraseña de 4 caracteres o más.
- Se cargan datos de ejemplo.
- Todo se guarda solo en ese navegador.

Sirve para recorrer todas las pantallas y probar la importación de tus Excel.

## 2. Conectar Firebase (datos en la nube)

1. Entra a https://console.firebase.google.com y crea un proyecto, por ejemplo `autogas-ica`.
2. **Authentication**: pulsa *Comenzar*, activa *Correo electrónico/contraseña* y crea en *Usuarios* **una sola cuenta para el taller**. Todos entran con ella desde la computadora del taller y eligen su nombre en el selector *Atiende*, arriba a la derecha. Ese nombre queda en cada cita y registro. La lista de nombres se edita en Ajustes, en *Listas de opciones*.
3. **Firestore Database**: créala en modo producción, en la región `southamerica-east1` (São Paulo, la más cercana a Ica).
4. **Configuración del proyecto** (el engranaje), en *Tus apps*: agrega una **app web** y copia los valores de `firebaseConfig`.
5. Copia el archivo `.env.example`, renómbralo `.env.local` y pega cada valor en su línea.
6. Sube las reglas de seguridad. Instala la herramienta una sola vez y luego despliega:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add            # elige tu proyecto
   firebase deploy --only firestore:rules
   ```

7. Vuelve a ejecutar `npm run dev`. La franja amarilla de "modo demostración" desaparece y el sistema ya trabaja en la nube.

La primera vez, entra a **Ajustes, pestaña Datos y respaldo, y pulsa "Cargar catálogo inicial"**. Eso carga:

- los equipos del Excel de stock,
- los aceites con su intervalo,
- las empresas de convenio,
- los filtros por modelo.

## 3. Pasar los Excel al sistema

Usa la pantalla **Importar Excel**. El sistema reconoce solo el formato de cada archivo. El orden recomendado es:

1. `SEGUIMIENTO DE CAMBIO ACEITE 2026`: crea los vehículos y los servicios.
2. `FORMATO CONTROL NUMEROS`, una importación por pestaña:
   - TABLA DE PROSPECTOS 2025
   - TABLA DE PROSPECTOS 2026
   - BaseClientes
   - Seguimiento-Llamadas
   - Hoja1
3. `REGISTRO ACEITES CONVENIO`: solo la pestaña JULIO. Las demás pestañas son copia del archivo anterior.
4. `CITAS AUTOGAS`, con el formato "Agenda de citas". Elige los meses y el año.
5. `LISTA DE REFRIGERANTE`.

En cada importación, antes de guardar, revisa la pantalla de revisión:

- las filas con error,
- las que ya existen, que se suman a la ficha existente en vez de duplicarse,
- las repetidas.

Cada importación se puede **revertir** desde Ajustes, en la pestaña Importaciones.

## Exportar a Excel

La pantalla **Exportar Excel** descarga cada módulo con las mismas columnas de los Excel originales:

- prospectos,
- BaseClientes,
- llamadas,
- aceite,
- convenios,
- citas,
- control de patio,
- refrigerante,
- stock y movimientos.

Puedes elegir el periodo, o bajar todo en un solo archivo con una hoja por módulo. Un archivo exportado se puede volver a importar sin duplicar datos.

## 4. Publicarlo en internet (Vercel)

1. Sube esta carpeta a un repositorio de GitHub. El archivo `.env.local` no se sube, y no debe subirse.
2. En https://vercel.com, *Add New Project*: importa el repositorio. Vercel detecta Vite solo.
3. En *Settings, Environment Variables*, agrega las mismas seis variables `VITE_FIREBASE_…` del `.env.local`.
4. Despliega. En Firebase, en *Authentication, Configuración, Dominios autorizados*, agrega el dominio que te dé Vercel.

## 5. Análisis nocturno con Python (fase 5, opcional)

La carpeta `functions/` tiene una función de Python que corre todas las noches. Hace dos cosas:

- Calcula los segmentos de clientes de aceite y aplica K-Means (scikit-learn) sobre recencia, frecuencia y monto.
- Guarda el resultado en la colección `analitica`.

El sistema ya muestra los segmentos sin esta función, porque los calcula en el navegador. La función sirve para análisis más pesados.

Requiere activar el plan **Blaze** de Firebase (pago por uso). Para desplegarla:

```bash
firebase deploy --only functions
```

## Estructura

```
src/
  pages/        Pantallas: Inicio, Registrar, Clientes, FichaCliente, Agenda, Taller,
                Aceite, Convenios, Inventario, Importar, Ajustes, Login
  components/   Piezas visuales compartidas (botones, tablas, ventanas, menú)
  data/         Conexión con Firebase, sesión, datos de ejemplo y operaciones
  import/       Lectura de Excel, plantillas por formato y control de duplicados
  lib/          Tipos de datos, catálogos, cálculos de aceite y segmentos
functions/      Análisis nocturno en Python
firestore.rules Reglas de seguridad de la base de datos
```

## Reglas importantes del sistema

- **Celular:** 9 dígitos que empiezan en 9. Se guarda sin espacios ni +51.
- **Placa:** 6 caracteres en mayúscula, sin guion. Es la que une agenda, aceite, convenios e inventario.
- **Próximo cambio de aceite:** se calcula con el intervalo propio de cada vehículo si ya volvió antes. Si no, con 64 días, que es la mediana real del taller.
- **Eliminar no borra:** lo eliminado va a la papelera, en Ajustes, y se puede restaurar.
- **Respaldo:** en Ajustes, pestaña Datos y respaldo, puedes descargar todo en un Excel. Hazlo una vez por semana.

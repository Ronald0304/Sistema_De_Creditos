/** CREDIMANAGER - SISTEMA DE GESTIÓN DE CRÉDITOS
 *  Servidor principal (Node.js + Express + SQLite)

 *  Estructura del proyecto:
 *    database/    -> Conexión, esquema (10 tablas) y datos de demostración
 *    middleware/  -> Autenticación, roles y cabeceras de seguridad
 *    routers/     -> Endpoints de la API REST agrupados por módulo + vistas
 *    utils/       -> Parámetros de negocio, cálculos financieros, auditoría
 *    tamplates/   -> Vistas HTML de cada panel
 *    css/         -> Hojas de estilo
 *    javascrip/   -> Lógica del frontend (manipulación del DOM)
 *    img/         -> Recursos gráficos
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const db = require('./database/db');
const { actualizarMora, programarControlMora } = require('./utils/mora');
const { SEGURIDAD } = require('./utils/parametros');
const { cabecerasSeguridad, exigirJson } = require('./middleware/seguridad');
const { ErrorNegocio } = require('./utils/errores');

// Routers de la API
const rutasAuth = require('./routers/auth');
const rutasUsuarios = require('./routers/usuarios');
const rutasClientes = require('./routers/clientes');
const rutasSolicitudes = require('./routers/solicitudes');
const rutasEvaluaciones = require('./routers/evaluaciones');
const rutasAprobaciones = require('./routers/aprobaciones');
const rutasCreditos = require('./routers/creditos');
const rutasPagos = require('./routers/pagos');
const rutasReportes = require('./routers/reportes');
const rutasPortalCliente = require('./routers/clientesp');
// Router de vistas HTML protegidas
const rutasVistas = require('./routers/vistas');

const app = express();
const PUERTO = Number(process.env.PUERTO || process.env.PORT || 3000);

/*  CONFIGURACIÓN GENERAL */
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cabecerasSeguridad);
app.use(express.json({ limit: '200kb' }));

/* Sesiones: cookie httpOnly + SameSite, expiración por inactividad (rolling) */
app.use(
  session({
    name: 'credimanager.sid',
    secret: process.env.SECRETO_SESION || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SEGURIDAD.minutosSesion * 60 * 1000
    }
  })
);

/*  ARCHIVOS ESTÁTICOS (solo carpetas públicas: nunca la raíz del proyecto,
 *  para no exponer la base de datos ni el código del servidor)*/
const opcionesEstaticos = { maxAge: '1h', index: false };
app.use('/css', express.static(path.join(__dirname, 'css'), opcionesEstaticos));
app.use('/javascrip', express.static(path.join(__dirname, 'javascrip'), opcionesEstaticos));
app.use('/img', express.static(path.join(__dirname, 'img'), opcionesEstaticos));

/*  API REST */
app.use('/api', exigirJson);
app.use('/api/auth', rutasAuth);
app.use('/api/usuarios', rutasUsuarios);
app.use('/api/clientes', rutasClientes);
app.use('/api/solicitudes', rutasSolicitudes);
app.use('/api/evaluaciones', rutasEvaluaciones);
app.use('/api/aprobaciones', rutasAprobaciones);
app.use('/api/creditos', rutasCreditos);
app.use('/api/pagos', rutasPagos);
app.use('/api/reportes', rutasReportes);
app.use('/api/clientesp', rutasPortalCliente);

/* Endpoint de API inexistente */
app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));

/*  VISTAS HTML (landing + paneles protegidos por rol) */
app.use('/', rutasVistas);

/* MANEJADOR GLOBAL DE ERRORES
 *  Express 5 captura automáticamente los errores de funciones async. */
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (error instanceof ErrorNegocio) {
    return res.status(error.estado).json({ error: error.message, codigo: error.codigo });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  if (error.code === 'SQLITE_CONSTRAINT') {
    const mensaje = /UNIQUE/.test(error.message)
      ? 'Ya existe un registro con esos datos (valor duplicado).'
      : 'La operación viola una restricción de integridad de datos.';
    return res.status(409).json({ error: mensaje });
  }
  console.error('Error no controlado:', error);
  return res.status(500).json({ error: 'Ocurrió un error interno en el servidor. Intente nuevamente.' });
});

/*  ARRANQUE */
async function iniciar() {
  await db.inicializar();
  const { cuotasVencidas } = await actualizarMora();
  if (cuotasVencidas) console.log(`Control de mora: ${cuotasVencidas} cuota(s) marcadas como vencidas.`);
  programarControlMora();

  app.listen(PUERTO, () => {
    console.log(`   iniciado en http://localhost:${PUERTO}`);
  });
}

iniciar().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});

module.exports = app;

/**
 *  ROUTER: VISTAS HTML PROTEGIDAS

 *  - GET /             Landing page con panel de inicio de sesión integrado.
 *  - GET /app/:pagina  Paneles internos. Antes de servir el HTML se verifica:
 *        1) que exista una sesión válida y el usuario siga activo,
 *        2) que no tenga pendiente el cambio obligatorio de contraseña,
 *        3) que su rol tenga permiso para esa página.
 *    Si alguna condición falla, se redirige a la página que corresponda.
 *  Las vistas se sirven con "Cache-Control: no-store" para que, tras cerrar
 *  sesión, el botón "Atrás" del navegador no muestre información sensible.
 */
const path = require('path');
const express = require('express');
const db = require('../database/db');
const { INICIO_POR_ROL } = require('../utils/parametros');

const router = express.Router();
const CARPETA_VISTAS = path.join(__dirname, '..', 'tamplates');

const PERSONAL = ['ADMIN', 'OFICIAL', 'ANALISTA', 'JEFE', 'CAJERO', 'GERENTE'];
const TODOS = [...PERSONAL, 'CLIENTE'];

/** Mapa de páginas: ruta amigable -> archivo HTML + roles autorizados */
const PAGINAS = {
  // Comunes
  'cambiar-clave': { archivo: 'cambiar_clave.html', roles: TODOS },
  perfil:          { archivo: 'perfil.html',        roles: PERSONAL },
  // Administrador
  usuarios:        { archivo: 'usuarios.html',      roles: ['ADMIN'] },
  auditoria:       { archivo: 'auditoria.html',     roles: ['ADMIN'] },
  // Oficial de Crédito (el Administrador supervisa la gestión de clientes)
  clientes:        { archivo: 'clientes.html',      roles: ['OFICIAL', 'ADMIN'] },
  solicitudes:     { archivo: 'solicitudes.html',   roles: ['OFICIAL'] },
  garantias:       { archivo: 'garantias.html',     roles: ['OFICIAL'] },
  desembolsos:     { archivo: 'desembolsos.html',   roles: ['OFICIAL'] },
  // Analista de Crédito
  evaluaciones:    { archivo: 'evaluaciones.html',  roles: ['ANALISTA'] },
  evaluar:         { archivo: 'detalle_evaluacion.html', roles: ['ANALISTA'] },
  // Jefe de Crédito
  aprobaciones:    { archivo: 'aprobaciones.html',  roles: ['JEFE'] },
  historial:       { archivo: 'historial.html',     roles: ['JEFE', 'GERENTE'] },
  // Cajero
  pagos:           { archivo: 'pagos.html',         roles: ['CAJERO'] },
  // Gerente
  reportes:        { archivo: 'reportes.html',      roles: ['GERENTE', 'ADMIN'] },
  // Cliente
  portal:          { archivo: 'cliente_panel.html', roles: ['CLIENTE'] },
  // Documentos imprimibles
  contrato:        { archivo: 'contratos.html',     roles: ['JEFE', 'OFICIAL', 'GERENTE', 'ADMIN', 'CLIENTE'] },
  cronograma:      { archivo: 'cronograma.html',    roles: ['JEFE', 'OFICIAL', 'GERENTE', 'ADMIN', 'CAJERO', 'ANALISTA', 'CLIENTE'] },
  voucher:         { archivo: 'voucher.html',       roles: ['CAJERO', 'GERENTE', 'ADMIN', 'CLIENTE'] }
};

/** Evita que el navegador guarde en caché las vistas privadas */
function sinCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
}

/* Landing page --------------------------------------------------------------- */
router.get('/', (req, res) => {
  sinCache(res);
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

/* Compatibilidad con rutas antiguas del proyecto ---------------------------- */
router.get(['/login', '/index.html', '/tamplates/login.html'], (req, res) => res.redirect('/'));

/* Paneles protegidos ---------------------------------------------------------- */
router.get('/app/:pagina', async (req, res) => {
  const pagina = PAGINAS[req.params.pagina];
  if (!pagina) return res.status(404).sendFile(path.join(CARPETA_VISTAS, 'no_encontrado.html'));

  const sesion = req.session?.usuario;
  if (!sesion) return res.redirect('/?acceso=requerido#acceso');

  const usuario = await db.obtener('SELECT rol, activo, debe_cambiar_clave FROM usuario WHERE id_usuario = ?', [sesion.id]);
  if (!usuario || !usuario.activo) {
    req.session.destroy(() => {});
    return res.redirect('/?acceso=deshabilitado#acceso');
  }
  if (usuario.debe_cambiar_clave && req.params.pagina !== 'cambiar-clave') return res.redirect('/app/cambiar-clave');
  if (!pagina.roles.includes(usuario.rol)) return res.redirect(INICIO_POR_ROL[usuario.rol]);

  sinCache(res);
  return res.sendFile(path.join(CARPETA_VISTAS, pagina.archivo));
});

/* Atajo: /app lleva al inicio del rol ------------------------------------------ */
router.get('/app', (req, res) => {
  const rol = req.session?.usuario?.rol;
  res.redirect(rol ? INICIO_POR_ROL[rol] : '/');
});

module.exports = router;

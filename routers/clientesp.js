const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ==========================================
// 1. LOGIN PARA CLIENTES
// ==========================================
router.post('/login', (req, res) => {
  const { login, clave } = req.body;
  const sql = `SELECT id_cliente, nombres, apellidos, ci, primer_login FROM cliente WHERE login = ? AND clave = ?`;
  
  db.get(sql, [login, clave], (err, cliente) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cliente) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    res.json({
      mensaje: 'Login exitoso',
      usuario: {
        id_cliente: cliente.id_cliente,
        id: cliente.id_cliente,
        nombre: `${cliente.nombres} ${cliente.apellidos}`,
        ci: cliente.ci,
        rol: 'CLIENTE',
        primer_login: cliente.primer_login
      }
    });
  });
});

// ==========================================
// 2. CAMBIAR CONTRASEÑA DEL CLIENTE
// ==========================================
router.post('/cambiar-clave', (req, res) => {
  const { id_cliente, clave_actual, clave_nueva } = req.body;

  const sqlCheck = `SELECT id_cliente FROM cliente WHERE id_cliente = ? AND clave = ?`;

  db.get(sqlCheck, [id_cliente, clave_actual], (err, fila) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!fila) return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });

    const sqlUpdate = `UPDATE cliente SET clave = ?, primer_login = 0 WHERE id_cliente = ?`;
    db.run(sqlUpdate, [clave_nueva, id_cliente], (errUpd) => {
      if (errUpd) return res.status(500).json({ error: errUpd.message });
      res.json({ mensaje: 'Contraseña actualizada con éxito.' });
    });
  });
});

// ==========================================
// 3. OBTENER PERFIL DEL CLIENTE LOGUEADO
// ==========================================
router.get('/perfil/:id_cliente', (req, res) => {
  const { id_cliente } = req.params;
  const sql = `SELECT id_cliente, nombres, apellidos, ci, telefono, direccion, ingresos_mensuales FROM cliente WHERE id_cliente = ?`;
  
  db.get(sql, [id_cliente], (err, fila) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!fila) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(fila);
  });
});

// ==========================================
// 4. OBTENER TODAS LAS SOLICITUDES DEL CLIENTE
// ==========================================
router.get('/solicitudes/:id_cliente', (req, res) => {
  const { id_cliente } = req.params;
  const sql = `
    SELECT id_solicitud, monto_solicitado, plazo_meses, destino, fecha_solicitud, estado 
    FROM solicitud_credito 
    WHERE id_cliente = ? 
    ORDER BY id_solicitud DESC
  `;
  
  db.all(sql, [id_cliente], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

// ==========================================
// 5. OBTENER CUOTAS Y PAGOS DEL CLIENTE
// ==========================================
router.get('/cuotas/:id_cliente', (req, res) => {
  const { id_cliente } = req.params;
  const sql = `
    SELECT 
      cr.numero_credito,
      cu.numero,
      cu.fecha_vencimiento,
      cu.monto,
      cu.saldo,
      cu.estado
    FROM cuota cu
    JOIN credito cr ON cu.id_credito = cr.id_credito
    JOIN solicitud_credito s ON cr.id_solicitud = s.id_solicitud
    WHERE s.id_cliente = ?
    ORDER BY cu.fecha_vencimiento ASC
  `;
  
  db.all(sql, [id_cliente], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

module.exports = router;
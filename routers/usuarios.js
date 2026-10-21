const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ==========================================
// 1. LISTAR TODOS LOS USUARIOS DEL SISTEMA
// ==========================================
router.get('/', (req, res) => {
  const sql = `
    SELECT id_usuario AS id, nombre_completo, login, rol, limite_aprobacion, activo 
    FROM usuario 
    ORDER BY id_usuario DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

// ==========================================
// 2. REGISTRAR NUEVO USUARIO
// ==========================================
router.post('/', (req, res) => {
  const { nombre_completo, login, clave_hash, rol, limite_aprobacion } = req.body;

  if (!nombre_completo || !login || !clave_hash || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const limite = limite_aprobacion !== undefined ? limite_aprobacion : 0.00;
  const sql = `
    INSERT INTO usuario (nombre_completo, login, clave_hash, rol, limite_aprobacion, activo) 
    VALUES (?, ?, ?, ?, ?, 1)
  `;

  db.run(sql, [nombre_completo, login, clave_hash, rol, limite], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'El nombre de usuario (login) ya se encuentra registrado.' });
      }
      return res.status(500).json({ error: err.message });
    }

    res.status(201).json({
      mensaje: 'Usuario registrado correctamente',
      id_usuario: this.lastID
    });
  });
});

// ==========================================
// 3. ACTUALIZAR USUARIO EXISTENTE (PUT)
// ==========================================
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nombre_completo, login, rol, limite_aprobacion } = req.body;

  const sql = `
    UPDATE usuario 
    SET nombre_completo = ?, login = ?, rol = ?, limite_aprobacion = ? 
    WHERE id_usuario = ?
  `;

  db.run(sql, [nombre_completo, login, rol, limite_aprobacion, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ mensaje: 'Usuario actualizado correctamente' });
  });
});

// ==========================================
// 4. CAMBIAR ESTADO (ACTIVAR / DESACTIVAR)
// ==========================================
router.patch('/:id/estado', (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  const sql = `UPDATE usuario SET activo = ? WHERE id_usuario = ?`;

  db.run(sql, [activo, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ mensaje: 'Estado actualizado con éxito' });
  });
});

// ==========================================
// 5. LISTAR TODOS LOS CLIENTES DESDE LA TABLA CLIENTE
// ==========================================
router.get('/clientes/todos', (req, res) => {
  const sql = `
    SELECT id_cliente, ci, nombres, apellidos, telefono, direccion, ingresos_mensuales 
    FROM cliente 
    ORDER BY id_cliente DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      total: filas ? filas.length : 0,
      clientes: filas || []
    });
  });
});

module.exports = router;
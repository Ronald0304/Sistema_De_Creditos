const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 1. LISTAR TODOS LOS USUARIOS DEL SISTEMA
router.get('/', (req, res) => {
  const sql = `
    SELECT id_usuario, nombre_completo, login, rol, limite_aprobacion, activo 
    FROM usuario 
    ORDER BY id_usuario DESC
  `;
  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

// 2. REGISTRAR UN NUEVO USUARIO
router.post('/registrar', (req, res) => {
  const { nombre_completo, login, clave_hash, rol, limite_aprobacion } = req.body;

  if (!nombre_completo || !login || !clave_hash || !rol) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para registrar el usuario.' });
  }

  const limite = limite_aprobacion !== undefined ? parseFloat(limite_aprobacion) : 0.00;
  const rolUpper = rol.toUpperCase();

  const sql = `
    INSERT INTO usuario (nombre_completo, login, clave_hash, rol, limite_aprobacion, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `;

  db.run(sql, [nombre_completo, login, clave_hash, rolUpper, limite], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed: usuario.login')) {
        return res.status(400).json({ error: 'El nombre de usuario (login) ya está en uso. Elija otro.' });
      }
      return res.status(500).json({ error: err.message });
    }

    res.status(201).json({
      mensaje: 'Usuario registrado con éxito',
      id_usuario: this.lastID
    });
  });
});

// 3. CAMBIAR ESTADO (ACTIVAR / DESACTIVAR) DE UN USUARIO
router.put('/estado/:id', (req, res) => {
  const { id } = req.params;
  const { activo } = req.body; // 1 (Activo) o 0 (Inactivo)

  if (activo === undefined || (activo !== 0 && activo !== 1)) {
    return res.status(400).json({ error: 'Estado inválido proporcionado.' });
  }

  const sql = `UPDATE usuario SET activo = ? WHERE id_usuario = ?`;
  db.run(sql, [activo, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ mensaje: 'Estado del usuario actualizado correctamente' });
  });
});

module.exports = router;
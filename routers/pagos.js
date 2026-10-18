const express = require('express');
const router = express.Router();
const db = require('../database/db');

// 1. BUSCAR CRÉDITO Y CUOTAS PENDIENTES
router.get('/buscar', (req, res) => {
  const { criterio } = req.query;

  if (!criterio) {
    return res.status(400).json({ error: 'Debe proporcionar un C.I. o Número de Crédito.' });
  }

  const sql = `
    SELECT 
      cr.id_credito,
      cr.numero_credito,
      cr.monto_aprobado,
      cr.saldo_capital,
      cr.estado AS estado_credito,
      cl.id_cliente,
      cl.ci,
      cl.nombres,
      cl.apellidos
    FROM credito cr
    JOIN solicitud_credito s ON cr.id_solicitud = s.id_solicitud
    JOIN cliente cl ON s.id_cliente = cl.id_cliente
    WHERE cr.numero_credito = ? OR cl.ci = ?
  `;

  db.get(sql, [criterio, criterio], (err, credito) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!credito) {
      return res.status(404).json({ error: 'No se encontró ningún crédito asociado a ese criterio.' });
    }

    const sqlCuotas = `
      SELECT * FROM cuota 
      WHERE id_credito = ? 
      ORDER BY numero ASC
    `;

    db.all(sqlCuotas, [credito.id_credito], (errCuotas, cuotas) => {
      if (errCuotas) return res.status(500).json({ error: errCuotas.message });

      res.json({
        credito: credito,
        cliente: {
          ci: credito.ci,
          nombre_completo: `${credito.nombres} ${credito.apellidos}`
        },
        cuotas: cuotas
      });
    });
  });
});

// 2. REGISTRAR PAGO DE CUOTA Y EMITIR COMPROBANTE
router.post('/registrar', (req, res) => {
  const { id_cuota, id_usuario, monto_recibido, forma_pago } = req.body;

  if (!id_cuota || !monto_recibido) {
    return res.status(400).json({ error: 'Datos incompletos para procesar el pago.' });
  }

  const idUsuarioCajero = id_usuario || 3;

  // Buscar nombre del cajero en la base de datos
  db.get(`SELECT nombre_completo FROM usuario WHERE id_usuario = ?`, [idUsuarioCajero], (errUser, userRow) => {
    const nombreCajero = userRow ? userRow.nombre_completo : 'Cajero de Ventanilla';

    const sqlCuota = `
      SELECT 
        c.id_cuota, c.id_credito, c.numero, c.monto, c.capital, c.interes, c.estado,
        cr.numero_credito,
        cl.nombres || ' ' || cl.apellidos AS cliente_nombre, cl.ci AS cliente_ci
      FROM cuota c
      JOIN credito cr ON c.id_credito = cr.id_credito
      JOIN solicitud_credito s ON cr.id_solicitud = s.id_solicitud
      JOIN cliente cl ON s.id_cliente = cl.id_cliente
      WHERE c.id_cuota = ?
    `;

    db.get(sqlCuota, [id_cuota], (err, cuota) => {
      if (err || !cuota) return res.status(404).json({ error: 'Cuota no encontrada' });
      if (cuota.estado === 'PAGADA') return res.status(400).json({ error: 'Esta cuota ya fue pagada' });

      const montoCuota = parseFloat(cuota.monto);
      const efectivoRecibido = parseFloat(monto_recibido);

      if (efectivoRecibido < montoCuota) {
        return res.status(400).json({ error: `El monto ingresado es insuficiente. Se requieren Bs. ${montoCuota.toFixed(2)}` });
      }

      const cambio = efectivoRecibido - montoCuota;
      const numero_recibo = 'REC-' + Date.now();

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        const sqlPago = `
          INSERT INTO pago (id_cuota, id_usuario, monto, monto_recibido, cambio, forma_pago, numero_recibo, fecha_pago)
          VALUES (?, ?, ?, ?, ?, ?, ?, DATETIME('now'))
        `;

        db.run(sqlPago, [id_cuota, idUsuarioCajero, montoCuota, efectivoRecibido, cambio, forma_pago || 'EFECTIVO', numero_recibo], function(errPago) {
          if (errPago) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error al insertar pago: ' + errPago.message });
          }

          db.run(`UPDATE cuota SET estado = 'PAGADA', saldo = 0 WHERE id_cuota = ?`, [id_cuota], (errUpd) => {
            if (errUpd) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: errUpd.message });
            }

            db.run(`UPDATE credito SET saldo_capital = MAX(0, saldo_capital - ?) WHERE id_credito = ?`, [cuota.capital, cuota.id_credito], (errCred) => {
              if (errCred) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: errCred.message });
              }

              db.run('COMMIT');
              res.json({
                mensaje: 'Pago registrado con éxito',
                recibo: {
                  numero_recibo: numero_recibo,
                  fecha: new Date().toLocaleString('es-BO'),
                  cliente: cuota.cliente_nombre,
                  ci: cuota.cliente_ci,
                  numero_credito: cuota.numero_credito,
                  numero_cuota: cuota.numero,
                  capital: cuota.capital,
                  interes: cuota.interes,
                  total_pagado: montoCuota,
                  monto_recibido: efectivoRecibido,
                  cambio: cambio,
                  cajero: nombreCajero
                }
              });
            });
          });
        });
      });
    });
  });
});

module.exports = router;
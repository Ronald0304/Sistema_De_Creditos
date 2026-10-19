const express = require('express');
const router = express.Router();
const db = require('../database/db');

// ==========================================
// 1. ENDPOINT DE LOGIN
// ==========================================
router.post('/login', (req, res) => {
  const { login, clave } = req.body;
  const sql = `SELECT id_usuario, nombre_completo, login, rol FROM usuario WHERE login = ? AND clave_hash = ? AND activo = 1`;
  
  db.get(sql, [login, clave], (err, usuario) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!usuario) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    res.json({
      mensaje: 'Login exitoso',
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre_completo,
        login: usuario.login,
        rol: usuario.rol
      }
    });
  });
});

// ==========================================
// 2. ENDPOINT DE SOLICITUDES Y MÉTRICAS
// ==========================================
router.get('/', (req, res) => {
  const estadoFiltro = req.query.estado || 'TODOS';

  const sqlMetricas = `
    SELECT 
      SUM(CASE WHEN estado = 'EN_EVALUACION' THEN 1 ELSE 0 END) as enEvaluacion,
      SUM(CASE WHEN estado = 'APROBADA' AND DATE(fecha_solicitud) = DATE('now') THEN 1 ELSE 0 END) as aprobadasHoy,
      SUM(CASE WHEN estado = 'RECHAZADA' AND DATE(fecha_solicitud) = DATE('now') THEN 1 ELSE 0 END) as rechazadasHoy
    FROM solicitud_credito
  `;

  db.get(sqlMetricas, [], (err, metricasRow) => {
    if (err) return res.status(500).json({ error: err.message });

    const metricas = {
      enEvaluacion: metricasRow?.enEvaluacion || 0,
      aprobadasHoy: metricasRow?.aprobadasHoy || 0,
      rechazadasHoy: metricasRow?.rechazadasHoy || 0
    };

    let sqlSolicitudes = `
      SELECT 
        s.id_solicitud AS id,
        c.nombres || ' ' || c.apellidos AS cliente,
        s.monto_solicitado AS monto,
        s.plazo_meses AS plazo,
        s.fecha_solicitud AS fecha,
        s.estado
      FROM solicitud_credito s
      JOIN cliente c ON s.id_cliente = c.id_cliente
    `;

    let params = [];
    if (estadoFiltro !== 'TODOS') {
      sqlSolicitudes += ` WHERE s.estado = ?`;
      params.push(estadoFiltro);
    }

    sqlSolicitudes += ` ORDER BY s.fecha_solicitud DESC`;

    db.all(sqlSolicitudes, params, (err, filas) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ metricas, solicitudes: filas });
    });
  });
});

// ==========================================
// 3. ENDPOINT PARA REGISTRAR CLIENTE
// ==========================================
router.post('/clientes', (req, res) => {
  const { ci, nombres, apellidos, telefono, direccion, ingresos_mensuales } = req.body;

  if (!ci || !nombres || !apellidos || ingresos_mensuales === undefined) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const sql = `INSERT INTO cliente (ci, nombres, apellidos, telefono, direccion, ingresos_mensuales) VALUES (?, ?, ?, ?, ?, ?)`;

  db.run(sql, [ci, nombres, apellidos, telefono, direccion, ingresos_mensuales], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: cliente.ci')) {
        return res.status(400).json({ error: 'El número de CI ya se encuentra registrado en el sistema.' });
      }
      return res.status(500).json({ error: err.message });
    }

    res.status(201).json({
      mensaje: 'Cliente registrado correctamente',
      id_cliente: this.lastID
    });
  });
});

// ==========================================
// 4. ENDPOINT PARA BUSCAR CLIENTE POR CI
// ==========================================
router.get('/buscar-cliente/:ci', (req, res) => {
  const { ci } = req.params;
  const sql = `SELECT id_cliente, nombres, apellidos, ci FROM cliente WHERE ci = ?`;

  db.get(sql, [ci], (err, cliente) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado. Debe registrarlo primero.' });

    res.json(cliente);
  });
});

// ==========================================
// 5. ENDPOINT PARA REGISTRAR NUEVA SOLICITUD
// ==========================================
router.post('/nueva', (req, res) => {
  const { id_cliente, id_usuario_registra, monto_solicitado, plazo_meses, destino } = req.body;

  if (!id_cliente || !id_usuario_registra || !monto_solicitado || !plazo_meses || !destino) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const sql = `
    INSERT INTO solicitud_credito 
    (id_cliente, id_usuario_registra, fecha_solicitud, monto_solicitado, plazo_meses, destino, estado) 
    VALUES (?, ?, DATE('now'), ?, ?, ?, 'REGISTRADA')
  `;

  db.run(sql, [id_cliente, id_usuario_registra, monto_solicitado, plazo_meses, destino], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    res.status(201).json({
      mensaje: 'Solicitud guardada correctamente',
      id_solicitud: this.lastID
    });
  });
});

// ==========================================
// 6. ENDPOINT PARA LISTAR SOLICITUDES EN DESPLEGABLE
// ==========================================
router.get('/listar-solicitudes', (req, res) => {
  const sql = `
    SELECT 
      s.id_solicitud, 
      c.nombres || ' ' || c.apellidos AS cliente_nombre
    FROM solicitud_credito s
    JOIN cliente c ON s.id_cliente = c.id_cliente
    ORDER BY s.id_solicitud DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

// ==========================================
// 7. ENDPOINTS PARA GARANTÍAS
// ==========================================
router.get('/garantias/:id_solicitud', (req, res) => {
  const { id_solicitud } = req.params;
  const sql = `SELECT * FROM garantia WHERE id_solicitud = ? ORDER BY id_garantia DESC`;

  db.all(sql, [id_solicitud], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

router.post('/garantias', (req, res) => {
  const { id_solicitud, tipo, descripcion, valor, estado } = req.body;

  if (!id_solicitud || !tipo || !descripcion || !valor) {
    return res.status(400).json({ error: 'Todos los campos marcados son obligatorios' });
  }

  const estadoGarantia = estado || 'VIGENTE';
  const sql = `
    INSERT INTO garantia (id_solicitud, tipo, descripcion, valor, estado)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sql, [id_solicitud, tipo, descripcion, valor, estadoGarantia], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    res.status(201).json({
      mensaje: 'Garantía registrada correctamente',
      id_garantia: this.lastID
    });
  });
});

// ==========================================
// 8. ENDPOINTS PARA DESEMBOLSOS
// ==========================================
router.get('/listar-aprobadas', (req, res) => {
  const sql = `
    SELECT 
      s.id_solicitud, 
      s.monto_solicitado, 
      s.plazo_meses,
      c.nombres || ' ' || c.apellidos AS cliente_nombre
    FROM solicitud_credito s
    JOIN cliente c ON s.id_cliente = c.id_cliente
    WHERE s.estado = 'APROBADA' OR s.estado = 'REGISTRADA'
    ORDER BY s.id_solicitud DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

router.get('/desembolsos', (req, res) => {
  const sql = `
    SELECT 
      d.id_desembolso,
      d.numero_credito,
      c.nombres || ' ' || c.apellidos AS cliente_nombre,
      d.monto_desembolsado AS monto,
      s.plazo_meses,
      d.fecha_desembolso,
      d.estado
    FROM desembolso d
    JOIN solicitud_credito s ON d.id_solicitud = s.id_solicitud
    JOIN cliente c ON s.id_cliente = c.id_cliente
    ORDER BY d.id_desembolso DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.json([]);
    res.json(filas);
  });
});

router.post('/desembolsos', (req, res) => {
  const { id_solicitud, numero_credito, monto_desembolsado, tasa_interes } = req.body;

  if (!id_solicitud || !numero_credito || !monto_desembolsado) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben ser completados' });
  }

  const sqlPlazo = `SELECT plazo_meses FROM solicitud_credito WHERE id_solicitud = ?`;

  db.get(sqlPlazo, [id_solicitud], (errSol, sol) => {
    if (errSol || !sol) {
      return res.status(400).json({ error: 'No se encontró la solicitud asociada' });
    }

    const plazo_meses = sol.plazo_meses;
    const interesAnual = tasa_interes || 12.00;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(`
        CREATE TABLE IF NOT EXISTS desembolso (
          id_desembolso INTEGER PRIMARY KEY AUTOINCREMENT,
          id_solicitud INTEGER,
          numero_credito TEXT UNIQUE,
          monto_desembolsado REAL,
          tasa_interes REAL,
          fecha_desembolso DATE,
          estado TEXT,
          FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS credito (
          id_credito INTEGER PRIMARY KEY AUTOINCREMENT,
          id_solicitud INTEGER,
          numero_credito TEXT UNIQUE,
          monto_aprobado REAL,
          plazo_meses INTEGER,
          saldo_capital REAL,
          estado TEXT,
          FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS cuota (
          id_cuota INTEGER PRIMARY KEY AUTOINCREMENT,
          id_credito INTEGER,
          numero INTEGER,
          fecha_vencimiento DATE,
          capital REAL,
          interes REAL,
          monto REAL,
          saldo REAL,
          estado TEXT,
          FOREIGN KEY (id_credito) REFERENCES credito(id_credito)
        )
      `);

      const sqlInsertDesembolso = `
        INSERT INTO desembolso (id_solicitud, numero_credito, monto_desembolsado, tasa_interes, fecha_desembolso, estado)
        VALUES (?, ?, ?, ?, DATE('now'), 'DESEMBOLSADO')
      `;

      db.run(sqlInsertDesembolso, [id_solicitud, numero_credito, monto_desembolsado, interesAnual], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Error en desembolso: ' + err.message });
        }

        const id_desembolso = this.lastID;

        const sqlCredito = `
          INSERT INTO credito (id_solicitud, numero_credito, monto_aprobado, plazo_meses, saldo_capital, estado)
          VALUES (?, ?, ?, ?, ?, 'VIGENTE')
        `;

        db.run(sqlCredito, [id_solicitud, numero_credito, monto_desembolsado, plazo_meses, monto_desembolsado], function(errCredito) {
          if (errCredito) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error en crédito: ' + errCredito.message });
          }

          const id_credito_generado = this.lastID;

          db.run(`UPDATE solicitud_credito SET estado = 'DESEMBOLSADO' WHERE id_solicitud = ?`, [id_solicitud]);

          const capitalCuota = monto_desembolsado / plazo_meses;
          const interesCuota = (monto_desembolsado * (interesAnual / 100)) / 12;
          const montoTotalCuota = capitalCuota + interesCuota;

          let cuotasInsertadas = 0;
          let errorCuotas = false;
          let saldoCapitalRestante = monto_desembolsado;

          for (let i = 1; i <= plazo_meses; i++) {
            const fechaVencimiento = new Date();
            fechaVencimiento.setMonth(fechaVencimiento.getMonth() + i);
            const fechaStr = fechaVencimiento.toISOString().split('T')[0];

            saldoCapitalRestante -= capitalCuota;
            const saldoCapitalFinal = Math.max(0, saldoCapitalRestante);

            const sqlCuota = `
              INSERT INTO cuota (id_credito, numero, fecha_vencimiento, capital, interes, monto, saldo, saldo_capital, estado)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')
            `;

            db.run(sqlCuota, [
              id_credito_generado, 
              i, 
              fechaStr, 
              capitalCuota, 
              interesCuota, 
              montoTotalCuota, 
              montoTotalCuota, 
              saldoCapitalFinal
            ], (errC) => {
              if (errC && !errorCuotas) {
                errorCuotas = true;
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error en cuota: ' + errC.message });
              }

              cuotasInsertadas++;
              if (cuotasInsertadas === parseInt(plazo_meses) && !errorCuotas) {
                db.run('COMMIT');
                res.status(201).json({
                  mensaje: 'Desembolso y cronograma de cuotas registrados con éxito',
                  id_desembolso: id_desembolso
                });
              }
            });
          }
        });
      });
    });
  });
});

// ==========================================
// 9. ENDPOINTS PARA EVALUACIONES (MODIFICADO Y CORREGIDO)
// ==========================================
router.get('/evaluaciones/pendientes', (req, res) => {
  const sql = `
    SELECT 
      s.id_solicitud, 
      s.monto_solicitado, 
      s.plazo_meses,
      s.estado,
      c.nombres || ' ' || c.apellidos AS cliente_nombre,
      c.ingresos_mensuales
    FROM solicitud_credito s
    JOIN cliente c ON s.id_cliente = c.id_cliente
    WHERE s.estado = 'REGISTRADA' 
      AND s.id_solicitud NOT IN (SELECT id_solicitud FROM evaluacion_credito)
    ORDER BY s.id_solicitud DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

router.post('/evaluaciones', (req, res) => {
  const { id_solicitud, referencia_crediticia, resultado_crediticio, ingresos, gastos, nivel_riesgo, resultado_evaluacion } = req.body;

  if (!id_solicitud || !ingresos || !gastos || !nivel_riesgo) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para la evaluación' });
  }

  // 1. Crear tabla si no existe
  const crearTablaSQL = `
    CREATE TABLE IF NOT EXISTS evaluacion_credito (
      id_evaluacion INTEGER PRIMARY KEY AUTOINCREMENT,
      id_solicitud INTEGER,
      referencia_crediticia TEXT,
      resultado_crediticio TEXT,
      ingresos REAL,
      gastos REAL,
      capacidad_pago REAL,
      nivel_riesgo TEXT,
      resultado TEXT,
      fecha_evaluacion DATE,
      FOREIGN KEY (id_solicitud) REFERENCES solicitud_credito(id_solicitud)
    )
  `;

  db.run(crearTablaSQL, (err) => {
    if (err) return res.status(500).json({ error: err.message });

    // 2. Asegurar que las columnas existan en bases de datos ya creadas
    db.run(`ALTER TABLE evaluacion_credito ADD COLUMN referencia_crediticia TEXT`, () => {
      db.run(`ALTER TABLE evaluacion_credito ADD COLUMN resultado_crediticio TEXT`, () => {
        
        const capacidad_pago = ingresos - gastos;
        
        // CORRECCIÓN CLAVE: Forzar que el estado sea 'EN_EVALUACION' para que vaya al Jefe de Créditos
        const estadoSolicitud = 'EN_EVALUACION';

        const sqlInsert = `
          INSERT INTO evaluacion_credito (id_solicitud, referencia_crediticia, resultado_crediticio, ingresos, gastos, capacidad_pago, nivel_riesgo, resultado, fecha_evaluacion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE('now'))
        `;

        db.run(sqlInsert, [id_solicitud, referencia_crediticia, resultado_crediticio, ingresos, gastos, capacidad_pago, nivel_riesgo, resultado_evaluacion], function(errInsert) {
          if (errInsert) return res.status(500).json({ error: errInsert.message });

          // Actualizar estado de la solicitud a EN_EVALUACION
          db.run(`UPDATE solicitud_credito SET estado = ? WHERE id_solicitud = ?`, [estadoSolicitud, id_solicitud], (errUpd) => {
            if (errUpd) return res.status(500).json({ error: errUpd.message });

            res.status(201).json({
              mensaje: 'Evaluación registrada correctamente',
              id_evaluacion: this.lastID,
              nuevo_estado: estadoSolicitud
            });
          });
        });

      });
    });
  });
});

// ==========================================
// 10. ENDPOINT PARA HISTORIAL DE DECISIONES
// ==========================================
router.get('/historial-decisiones', (req, res) => {
  const sql = `
    SELECT 
      s.id_solicitud,
      c.nombres || ' ' || c.apellidos AS cliente_nombre,
      s.monto_solicitado,
      s.plazo_meses,
      s.fecha_solicitud,
      s.estado AS estado_solicitud,
      s.motivo_rechazo,
      COALESCE(u.nombre_completo, 'Sistema / Comité') AS usuario_responsable
    FROM solicitud_credito s
    JOIN cliente c ON s.id_cliente = c.id_cliente
    LEFT JOIN usuario u ON s.id_usuario_registra = u.id_usuario
    WHERE s.estado IN ('APROBADA', 'RECHAZADA', 'DESEMBOLSADO')
    ORDER BY s.id_solicitud DESC
  `;

  db.all(sql, [], (err, filas) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(filas);
  });
});

// ==========================================
// 11. ENDPOINT PARA DETALLE DE EVALUACIÓN
// ==========================================
router.get('/detalle-evaluacion/:id', (req, res) => {
  const { id } = req.params;
  const sql = `
    SELECT 
      s.id_solicitud,
      s.monto_solicitado,
      s.plazo_meses,
      s.destino,
      s.estado,
      s.fecha_solicitud,
      s.motivo_rechazo,
      c.nombres || ' ' || c.apellidos AS cliente_nombre,
      c.ci AS cliente_ci,
      c.telefono AS cliente_telefono,
      c.ingresos_mensuales AS cliente_ingresos,
      e.fecha_evaluacion,
      e.ingresos AS eval_ingresos,
      e.gastos AS eval_gastos,
      e.capacidad_pago AS eval_capacidad,
      e.nivel_riesgo AS eval_riesgo,
      e.resultado AS eval_resultado,
      COALESCE(cr.numero_credito, 'CR-2025-' || printf('%04d', s.id_solicitud)) AS codigo_credito,
      COALESCE(ct.numero_contrato, 'CT-2025-' || printf('%04d', s.id_solicitud)) AS codigo_contrato
    FROM solicitud_credito s
    JOIN cliente c ON s.id_cliente = c.id_cliente
    LEFT JOIN evaluacion_credito e ON s.id_solicitud = e.id_solicitud
    LEFT JOIN credito cr ON s.id_solicitud = cr.id_solicitud
    LEFT JOIN contrato ct ON cr.id_credito = ct.id_credito
    WHERE s.id_solicitud = ?
  `;

  db.get(sql, [id], (err, fila) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!fila) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(fila);
  });
});

// ==========================================
// 12. CAMBIAR ESTADO (APROBAR / RECHAZAR CON CU09 Y CU10)
// ==========================================
router.post('/cambiar-estado', (req, res) => {
  const { id_solicitud, nuevo_estado, motivo_rechazo } = req.body;

  if (!id_solicitud || !nuevo_estado) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }

  const sqlUpdate = `UPDATE solicitud_credito SET estado = ?, motivo_rechazo = ? WHERE id_solicitud = ?`;

  db.run(sqlUpdate, [nuevo_estado, motivo_rechazo || null, id_solicitud], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    if (nuevo_estado === 'APROBADA') {
      const codCredito = `CR-2025-${String(id_solicitud).padStart(4, '0')}`;
      const numContrato = `CT-2025-${String(id_solicitud).padStart(4, '0')}`;

      db.get(`SELECT * FROM solicitud_credito WHERE id_solicitud = ?`, [id_solicitud], (errP, sol) => {
        if (errP || !sol) return;

        const plazo = sol.plazo_meses || 12;
        const monto = sol.monto_solicitado || 0;
        const tasaAnual = 12.00;
        const tasaMensual = (tasaAnual / 100) / 12;

        const sqlCredito = `
          INSERT OR IGNORE INTO credito (id_solicitud, numero_credito, monto_aprobado, tasa_interes, plazo_meses, saldo_capital, estado) 
          VALUES (?, ?, ?, ?, ?, ?, 'VIGENTE')
        `;

        db.run(sqlCredito, [id_solicitud, codCredito, monto, tasaAnual, plazo, monto], function(errCred) {
          if (errCred) return;
          const idCredito = this.lastID;

          db.run(`INSERT OR IGNORE INTO contrato (id_credito, numero_contrato, estado) VALUES (?, ?, 'GENERADO')`, [idCredito, numContrato]);

          const cuotaFija = (monto * tasaMensual * Math.pow(1 + tasaMensual, plazo)) / (Math.pow(1 + tasaMensual, plazo) - 1);
          let saldoCapital = monto;

          for (let i = 1; i <= plazo; i++) {
            const interes = saldoCapital * tasaMensual;
            const capital = cuotaFija - interes;
            saldoCapital -= capital;

            const fechaVenc = new Date();
            fechaVenc.setMonth(fechaVenc.getMonth() + i);
            const fechaStr = fechaVenc.toISOString().split('T')[0];

            db.run(`INSERT OR IGNORE INTO cuota (id_credito, numero, fecha_vencimiento, capital, interes, monto, saldo, saldo_capital, estado) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
                    [idCredito, i, fechaStr, capital, interes, cuotaFija, cuotaFija, Math.max(0, saldoCapital)]);
          }

          db.run(`INSERT INTO auditoria (id_usuario, operacion, entidad, id_entidad, resultado) VALUES (?, ?, ?, ?, ?)`,
                 [1, 'APROBAR_CREDITO', 'solicitud_credito', id_solicitud, 'EXITO']);
        });
      });
    }

    res.json({
      mensaje: `Solicitud marcada como ${nuevo_estado} con éxito`,
      filasAfectadas: this.changes
    });
  });
});

// ==========================================
// 13. ENDPOINT PARA REPORTES DE GESTIÓN (GERENTE)
// ==========================================
router.get('/reportes/gestion', (req, res) => {
  const anio = req.query.anio || '2026';

  const sqlResumen = `
    SELECT 
      COUNT(c.id_credito) AS total_creditos,
      COALESCE(SUM(c.monto_aprobado), 0) AS monto_total_colocado,
      SUM(CASE WHEN c.estado = 'VIGENTE' THEN 1 ELSE 0 END) as creditos_vigentes,
      SUM(CASE WHEN c.estado = 'CANCELADO' THEN 1 ELSE 0 END) as creditos_cancelados
    FROM credito c
  `;

  db.get(sqlResumen, [], (err, resumen) => {
    if (err) return res.status(500).json({ error: err.message });

    const sqlCuotas = `
      SELECT 
        strftime('%m', fecha_vencimiento) AS mes,
        COUNT(id_cuota) AS total_cuotas,
        COALESCE(SUM(monto), 0) AS monto_esperado,
        COALESCE(SUM(saldo), 0) AS monto_pendiente,
        SUM(CASE WHEN estado = 'PAGADA' THEN 1 ELSE 0 END) AS cuotas_pagadas,
        SUM(CASE WHEN estado = 'VENCIDA' THEN 1 ELSE 0 END) AS cuotas_vencidas
      FROM cuota
      WHERE strftime('%Y', fecha_vencimiento) = ?
      GROUP BY mes
      ORDER BY mes ASC
    `;

    db.all(sqlCuotas, [anio], (errC, cuotasMensuales) => {
      if (errC) return res.status(500).json({ error: errC.message });

      res.json({
        resumenGeneral: resumen,
        desgloseAnual: cuotasMensuales
      });
    });
  });
});

module.exports = router;
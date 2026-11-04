/** CONTROL AUTOMÁTICO DE MORA (CU13 - RF14 - RN09)

 *  Proceso que identifica cuotas vencidas y actualiza:
 *    - cuota.estado        PENDIENTE  -> VENCIDA
 *    - cuota.dias_atraso / recargo_mora (valor referencial a la fecha)
 *    - credito.estado      VIGENTE   <-> EN_MORA
 *  Se ejecuta al iniciar el servidor, cada hora, y antes de las consultas
 *  sensibles (búsquedas de caja, reportes, portal del cliente).
 */
const db = require('../database/db');
const { MORA } = require('./parametros');
const { fechaHoy } = require('./finanzas');

/**
 * Actualiza los estados de mora de toda la cartera.
 * @param {object} [tx] Ejecutor de transacción (si ya estamos dentro de una)
 * @returns {Promise<{cuotasVencidas:number}>}
 */
async function actualizarMora(tx) {
  const tarea = async (ejecutor) => {
    const hoy = fechaHoy();

    // 1) Cuotas pendientes cuya fecha ya pasó -> VENCIDA (solo créditos desembolsados)
    const { cambios } = await ejecutor.ejecutar(
      `UPDATE cuota SET estado = 'VENCIDA'
        WHERE estado = 'PENDIENTE' AND fecha_vencimiento < ?
          AND id_credito IN (SELECT id_credito FROM credito WHERE estado IN ('VIGENTE','EN_MORA'))`,
      [hoy]
    );

    // 2) Recalcular días de atraso y recargo referencial de las cuotas vencidas
    await ejecutor.ejecutar(
      `UPDATE cuota
          SET dias_atraso  = CAST(julianday(?) - julianday(fecha_vencimiento) AS INTEGER),
              recargo_mora = ROUND(MIN(monto * ? * MAX(0, CAST(julianday(?) - julianday(fecha_vencimiento) AS INTEGER) - ?), monto * ?), 2)
        WHERE estado = 'VENCIDA'`,
      [hoy, MORA.tasaRecargoDiario, hoy, MORA.diasGracia, MORA.topeRecargo]
    );

    // 3) Estado de los créditos según tengan o no cuotas vencidas
    await ejecutor.ejecutar(
      `UPDATE credito SET estado = 'EN_MORA'
        WHERE estado = 'VIGENTE'
          AND EXISTS (SELECT 1 FROM cuota q WHERE q.id_credito = credito.id_credito AND q.estado = 'VENCIDA')`
    );
    await ejecutor.ejecutar(
      `UPDATE credito SET estado = 'VIGENTE'
        WHERE estado = 'EN_MORA'
          AND NOT EXISTS (SELECT 1 FROM cuota q WHERE q.id_credito = credito.id_credito AND q.estado = 'VENCIDA')`
    );
    return { cuotasVencidas: cambios };
  };

  if (tx) return tarea(tx);
  return db.transaccion(tarea);
}

/** Programa la ejecución periódica del control de mora (cada hora) */
function programarControlMora() {
  const UNA_HORA = 60 * 60 * 1000;
  setInterval(() => {
    actualizarMora().catch((error) => console.error('Error en control de mora:', error.message));
  }, UNA_HORA).unref();
}

module.exports = { actualizarMora, programarControlMora };

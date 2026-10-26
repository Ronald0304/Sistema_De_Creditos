/* COMPONENTE COMPARTIDO: EXPEDIENTE DE UNA SOLICITUD
   ----------------------------------------------------------------------------
   Genera el HTML del expediente completo (cliente, condiciones, garantías,
   historial, dictamen del analista, resolución y crédito). Lo usan las
   vistas del Oficial (solicitudes), del Jefe (aprobaciones) y el historial.*/
(function () {
  'use strict';

  /**
   * @param {object} d Respuesta de GET /api/solicitudes/:id
   * @param {object} [opciones] { mostrarLinea: true }
   * @returns {string} HTML
   */
  function renderExpediente(d, { mostrarLinea = true } = {}) {
    const { solicitud: s, cliente: c, garantias, evaluacion: e, historial: h, credito: cr } = d;
    const cobertura = s.monto_solicitado > 0 ? (d.valor_garantias / s.monto_solicitado) * 100 : 0;

    const bloqueGarantias = garantias.length
      ? `<div class="tabla-contenedor"><table class="tabla">
          <thead><tr><th>Tipo</th><th>Descripción</th><th class="num">Valor comercial</th><th>Estado</th></tr></thead>
          <tbody>${garantias.map((g) => `<tr><td>${App.esc(g.tipo_nombre)}</td><td>${App.esc(g.descripcion)}${g.documento_respaldo ? `<span class="secundario">${App.esc(g.documento_respaldo)}</span>` : ''}</td><td class="num">${App.moneda(g.valor_comercial)}</td><td>${App.insignia(g.estado)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">Cobertura sobre el monto solicitado: ${App.porcentaje(cobertura)}</td><td class="num">${App.moneda(d.valor_garantias)}</td><td></td></tr></tfoot>
        </table></div>`
      : '<div class="aviso alerta"><div>Aún no se registraron garantías para esta solicitud.</div></div>';

    const bloqueHistorial = h
      ? `<div class="lista-datos">
          <div class="dato"><span>Referencia Core</span><strong class="mono">${App.esc(h.codigo_referencia)}</strong></div>
          <div class="dato"><span>Calificación / puntaje</span><strong>${App.esc(h.calificacion)} · ${h.puntaje} pts</strong></div>
          <div class="dato"><span>Deuda total en el sistema</span><strong>${App.moneda(h.deuda_externa_total)}</strong></div>
          <div class="dato"><span>Cuotas mensuales de otras deudas</span><strong>${App.moneda(h.cuota_mensual_externa)}</strong></div>
          <div class="dato"><span>Máximo atraso histórico</span><strong>${h.dias_mora_max} días</strong></div>
          <div class="dato"><span>Mora vigente</span><strong class="${h.en_mora_actual ? 'texto-peligro' : 'texto-exito'}">${h.en_mora_actual ? 'Sí' : 'No'}</strong></div>
        </div>
        ${h.observaciones ? `<p class="texto-chico texto-suave mt-1">${App.esc(h.observaciones)}</p>` : ''}`
      : '<p class="texto-suave">El historial crediticio aún no fue consultado por el analista.</p>';

    const bloqueEvaluacion = e
      ? `<div class="flex envolver mb-2">${App.insignia(e.dictamen)} ${App.insignia(e.nivel_riesgo)} <span class="texto-chico texto-suave">Por ${App.esc(e.analista)} · ${App.fechaHora(e.fecha_evaluacion)}</span></div>
        <div class="lista-datos">
          <div class="dato"><span>Ingresos verificados</span><strong>${App.moneda(e.ingresos)}</strong></div>
          <div class="dato"><span>Gastos</span><strong>${App.moneda(e.gastos)}</strong></div>
          <div class="dato"><span>Otras deudas (mensual)</span><strong>${App.moneda(e.deudas_mensuales)}</strong></div>
          <div class="dato"><span>Capacidad de pago</span><strong>${App.moneda(e.capacidad_pago)}</strong></div>
          <div class="dato"><span>Cuota estimada</span><strong>${App.moneda(e.cuota_estimada)}</strong></div>
          <div class="dato"><span>Cuota / capacidad</span><strong class="${e.relacion_cuota_ingreso > 70 ? 'texto-peligro' : ''}">${App.porcentaje(e.relacion_cuota_ingreso)}</strong></div>
          <div class="dato"><span>Cobertura de garantías</span><strong>${App.porcentaje(e.cobertura_garantia)}</strong></div>
          <div class="dato"><span>Puntaje interno</span><strong>${e.puntaje_interno} / 100</strong></div>
        </div>
        <div class="cita mt-2"><strong>Fundamento técnico:</strong> ${App.esc(e.observaciones)}</div>`
      : '<p class="texto-suave">Pendiente de evaluación por el Analista de Crédito.</p>';

    let bloqueResolucion = '';
    if (s.fecha_resolucion) {
      const tipo = s.estado === 'RECHAZADA' || s.estado === 'ANULADA' ? 'peligro' : 'exito';
      bloqueResolucion = `<div class="aviso ${tipo}">
        <div><strong>${App.esc(App.etiquetaEstado(s.estado))}</strong> ${s.jefe ? `por ${App.esc(s.jefe)}` : ''} el ${App.fechaHora(s.fecha_resolucion)}<br>${App.esc(s.observacion_resolucion || '')}</div></div>`;
    }

    const bloqueCredito = cr
      ? `<div class="lista-datos">
          <div class="dato"><span>N° de crédito</span><strong>${App.esc(cr.numero_credito)}</strong></div>
          <div class="dato"><span>N° de contrato</span><strong>${App.esc(cr.numero_contrato)}</strong></div>
          <div class="dato"><span>Monto aprobado</span><strong>${App.moneda(cr.monto_aprobado)}</strong></div>
          <div class="dato"><span>Tasa anual</span><strong>${App.porcentaje(cr.tasa_interes, 2)}</strong></div>
          <div class="dato"><span>Cuota mensual</span><strong>${App.moneda(cr.cuota_mensual)}</strong></div>
          <div class="dato"><span>Estado</span><strong>${App.insignia(cr.estado)}</strong></div>
        </div>
        <div class="flex envolver mt-2">
          <a class="boton boton-secundario boton-sm" href="/app/contrato?id=${cr.id_credito}" target="_blank" rel="noopener">Contrato</a>
          <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${cr.id_credito}" target="_blank" rel="noopener">Cronograma</a>
        </div>`
      : '';

    return `
      ${mostrarLinea ? `<div class="mb-3">${App.lineaTiempoSolicitud(s.estado)}</div>` : ''}
      <div class="resumen-expediente">
        <div><span>Código</span><strong>${App.esc(s.codigo)}</strong></div>
        <div><span>Producto</span><strong>${App.esc(s.producto)}</strong></div>
        <div><span>Monto solicitado</span><strong>${App.moneda(s.monto_solicitado)}</strong></div>
        <div><span>Plazo / tasa</span><strong>${s.plazo_meses} meses · ${App.porcentaje(s.tasa_interes, 2)}</strong></div>
        <div><span>Estado</span><strong>${App.insignia(s.estado)}</strong></div>
      </div>
      <p class="texto-chico texto-suave mt-1"><strong>Destino:</strong> ${App.esc(s.destino)}${s.descripcion ? ` — ${App.esc(s.descripcion)}` : ''} · Registrada por ${App.esc(s.oficial)} el ${App.fechaHora(s.fecha_solicitud)}</p>
      ${bloqueResolucion ? `<div class="mt-2">${bloqueResolucion}</div>` : ''}

      <h4 class="titulo-bloque">Cliente</h4>
      <div class="lista-datos">
        <div class="dato"><span>Nombre</span><strong>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</strong></div>
        <div class="dato"><span>CI</span><strong>${App.esc(c.ci)} ${App.esc(c.extension)}</strong></div>
        <div class="dato"><span>Ocupación</span><strong>${App.esc(c.ocupacion || '—')}</strong></div>
        <div class="dato"><span>Ingresos / gastos declarados</span><strong>${App.moneda(c.ingresos_mensuales)} / ${App.moneda(c.gastos_mensuales)}</strong></div>
        <div class="dato"><span>Teléfono</span><strong>${App.esc(c.telefono || '—')}</strong></div>
      </div>

      <h4 class="titulo-bloque">Garantías</h4>
      ${bloqueGarantias}

      <h4 class="titulo-bloque">Historial crediticio (Core Bancario)</h4>
      ${bloqueHistorial}

      <h4 class="titulo-bloque">Dictamen del Analista</h4>
      ${bloqueEvaluacion}

      ${bloqueCredito ? `<h4 class="titulo-bloque">Crédito generado</h4>${bloqueCredito}` : ''}`;
  }

  window.DetalleSolicitud = { renderExpediente };
})();

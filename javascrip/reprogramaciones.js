/* REPROGRAMACIÓN DE CRÉDITOS - OFICIAL Y JEFE DE CRÉDITO
   ----------------------------------------------------------------------------
   OFICIAL: revisa la solicitud del cliente y sus adjuntos, usa el simulador
            (el servidor suma al capital los intereses vencidos y moratorios y
            calcula el nuevo plan) y deriva el caso al Jefe con su dictamen.
   JEFE:    revisa la simulación (recalculada a la fecha) y el dictamen, y
            APRUEBA (nuevo cronograma + Adenda) o RECHAZA con motivo. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const usuario = await App.iniciar();
  const esOficial = usuario.rol === 'OFICIAL';

  const tabla = document.getElementById('tabla-reprogramaciones');
  const formulario = document.getElementById('formulario-simulacion');
  const botonDerivar = document.getElementById('boton-derivar');
  const botonAprobar = document.getElementById('boton-aprobar');
  const botonRechazar = document.getElementById('boton-rechazar');
  let vista = 'pendientes';
  let filas = [];
  let detalle = null;       // respuesta de GET /api/reprogramaciones/:id
  let simulacionValida = false;

  /* ---------------- Textos según el rol ---------------- */
  document.getElementById('miga-seccion').textContent = esOficial ? 'Originación' : 'Comité de crédito';
  document.getElementById('subtitulo-pagina').textContent = esOficial
    ? 'Revise las solicitudes de clientes en mora temprana, simule el nuevo plan de pagos y derive el caso al Jefe de Crédito.'
    : 'Revise la simulación y el dictamen del Oficial de Crédito y resuelva la aprobación o el rechazo de la reprogramación.';
  document.getElementById('pestana-pendientes').textContent = esOficial ? 'Por evaluar' : 'Por resolver';

  /** Texto de la propuesta del cliente */
  const textoPropuesta = (r) => (r.tipo_propuesta === 'PLAZO'
    ? `Plazo de ${r.propuesta_plazo} meses`
    : `Cuota máxima ${App.moneda(r.propuesta_cuota)}`);

  /* ---------------- Bandeja ---------------- */
  async function cargar() {
    tabla.innerHTML = App.filaCargando(7);
    try {
      const { metricas, reprogramaciones } = await App.api.get(`/api/reprogramaciones/bandeja?vista=${vista}`);
      filas = reprogramaciones;
      App.animarNumero(document.getElementById('kpi-pendientes'), metricas.pendientes_evaluacion);
      App.animarNumero(document.getElementById('kpi-revision'), metricas.en_revision_jefe);
      App.animarNumero(document.getElementById('kpi-aprobadas'), metricas.aprobadas_mes);
      App.animarNumero(document.getElementById('kpi-rechazadas'), metricas.rechazadas_mes);
      document.getElementById('nota-bandeja').textContent = vista === 'pendientes' ? 'Ordenadas por antigüedad de la solicitud' : 'Últimas 200 solicitudes';

      const accion = vista === 'pendientes' ? (esOficial ? 'Evaluar' : 'Resolver') : 'Ver';
      tabla.innerHTML = filas.length
        ? filas.map((r) => `
          <tr>
            <td><strong>${App.esc(r.codigo)}</strong><span class="secundario">${App.fechaHora(r.fecha_solicitud)}</span></td>
            <td>${App.esc(r.cliente)}<span class="secundario">CI ${App.esc(r.ci)} ${App.esc(r.extension)}</span></td>
            <td>${App.esc(r.numero_credito)}<span class="secundario">${App.esc(r.producto)}</span></td>
            <td class="num"><strong>${r.cuotas_vencidas} cuota(s)</strong><span class="secundario">${r.dias_mora} días · ${App.moneda(r.monto_vencido)}</span></td>
            <td>${App.esc(textoPropuesta(r))}<span class="secundario">${r.adjuntos} adjunto(s)</span></td>
            <td>${App.insignia(r.estado)}${r.recomendacion ? `<span class="secundario">Oficial: ${App.esc(App.etiquetaEstado(r.recomendacion))}</span>` : ''}</td>
            <td class="num"><button type="button" class="boton ${vista === 'pendientes' ? 'boton-primario' : 'boton-secundario'} boton-sm" data-abrir="${r.id_reprogramacion}">${accion}</button></td>
          </tr>`).join('')
        : App.filaVacia(7, vista === 'pendientes' ? 'No hay solicitudes de reprogramación por atender.' : 'Aún no hay solicitudes de reprogramación.');
    } catch (error) {
      tabla.innerHTML = App.filaVacia(7, error.message);
    }
  }

  document.getElementById('pestanas-vista').addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-vista]');
    if (!boton || boton.dataset.vista === vista) return;
    vista = boton.dataset.vista;
    document.querySelectorAll('#pestanas-vista .pestana').forEach((b) => b.classList.toggle('activa', b === boton));
    cargar();
  });

  /* ---------------- Expediente ---------------- */
  function renderExpediente(d) {
    const { reprogramacion: r, cliente: c, credito: cr, situacion: s, adjuntos } = d;
    const capacidad = c.ingresos_mensuales - c.gastos_mensuales;
    const enCurso = ['PENDIENTE_EVALUACION', 'EN_REVISION_JEFE'].includes(r.estado);

    const bloqueAdjuntos = adjuntos.length
      ? `<ul class="lista-adjuntos">${adjuntos.map((a) => `
          <li><span>${App.esc(a.nombre)} <small class="texto-suave">(${a.tipo_mime === 'application/pdf' ? 'PDF' : 'Imagen'} · ${App.numero(a.tamano / 1024, 0)} KB)</small></span>
            <a class="boton boton-secundario boton-sm" href="/api/reprogramaciones/${r.id_reprogramacion}/adjuntos/${a.id_adjunto}" target="_blank" rel="noopener">Abrir</a></li>`).join('')}</ul>`
      : '<p class="texto-suave">El cliente no adjuntó documentos de respaldo.</p>';

    const bloqueDictamen = r.recomendacion
      ? `<h4 class="titulo-bloque">Dictamen del Oficial de Crédito</h4>
        <div class="flex envolver mb-2">${App.insignia(r.recomendacion)} <span class="texto-chico texto-suave">Por ${App.esc(r.oficial)} · ${App.fechaHora(r.fecha_evaluacion)}</span></div>
        <div class="cita">${App.esc(r.dictamen_oficial)}</div>`
      : '';

    let bloqueResolucion = '';
    if (r.estado === 'APROBADA') {
      bloqueResolucion = `
        <div class="aviso exito mt-2"><div><strong>Aprobada</strong> por ${App.esc(r.jefe)} el ${App.fechaHora(r.fecha_resolucion)} · Adenda ${App.esc(r.numero_adenda)}<br>
          Capital reprogramado ${App.moneda(r.capital_reprogramado)} · ${r.nuevo_plazo} cuotas de ${App.moneda(r.nueva_cuota)} al ${App.numero(r.nueva_tasa, 2)} %.
          ${r.observacion_resolucion ? `<br>${App.esc(r.observacion_resolucion)}` : ''}</div></div>
        <div class="documentos-generados">
          <a class="documento" href="/app/adenda?id=${r.id_reprogramacion}" target="_blank" rel="noopener"><div><strong>Adenda ${App.esc(r.numero_adenda)}</strong><small>Ver e imprimir</small></div></a>
          <a class="documento" href="/app/cronograma?id=${r.id_credito}" target="_blank" rel="noopener"><div><strong>Cronograma vigente</strong><small>Nuevo plan de pagos</small></div></a>
        </div>`;
    } else if (r.estado === 'RECHAZADA') {
      bloqueResolucion = `<div class="aviso peligro mt-2"><div><strong>Rechazada</strong> por ${App.esc(r.jefe)} el ${App.fechaHora(r.fecha_resolucion)}.<br>Motivo: ${App.esc(r.observacion_resolucion)}</div></div>`;
    }

    return `
      <div class="flex entre envolver mb-2">
        <div>${App.insignia(r.estado)} <span class="texto-chico texto-suave">Solicitada el ${App.fechaHora(r.fecha_solicitud)}</span></div>
        <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${r.id_credito}" target="_blank" rel="noopener">Cronograma ${enCurso ? 'actual' : 'vigente'}</a>
      </div>

      <h4 class="titulo-bloque">Cliente y crédito</h4>
      <div class="lista-datos">
        <div class="dato"><span>Cliente</span><strong>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</strong></div>
        <div class="dato"><span>C.I. / teléfono</span><strong>${App.esc(c.ci)} ${App.esc(c.extension)} · ${App.esc(c.telefono || '—')}</strong></div>
        <div class="dato"><span>Ocupación</span><strong>${App.esc(c.ocupacion || '—')}</strong></div>
        <div class="dato"><span>Capacidad de pago declarada</span><strong>${App.moneda(capacidad)}</strong></div>
        <div class="dato"><span>Crédito</span><strong>${App.esc(cr.numero_credito)} · ${App.esc(cr.producto)}</strong></div>
        <div class="dato"><span>Estado del crédito</span><strong>${App.insignia(cr.estado)}</strong></div>
        <div class="dato"><span>Cuota actual / tasa</span><strong>${App.moneda(cr.cuota_mensual)} · ${App.numero(cr.tasa_interes, 2)} %</strong></div>
        <div class="dato"><span>Cuotas pagadas / pendientes</span><strong>${s.cuotas_pagadas} / ${s.cuotas_pendientes}</strong></div>
      </div>

      <h4 class="titulo-bloque">Solicitud del cliente</h4>
      <div class="cita mb-2">${App.esc(r.motivo)}</div>
      <p><strong>Propuesta:</strong> ${App.esc(textoPropuesta(r))} · <span class="texto-suave">Al solicitar tenía ${r.cuotas_vencidas} cuota(s) vencida(s) y ${r.dias_mora} días de mora.</span></p>

      ${enCurso ? `
      <h4 class="titulo-bloque">Situación de mora a la fecha</h4>
      <div class="resumen-expediente">
        <div><span>Cuotas vencidas</span><strong class="texto-peligro">${s.cuotas_vencidas}</strong></div>
        <div><span>Días de mora</span><strong>${s.dias_mora}</strong></div>
        <div><span>Saldo de capital</span><strong>${App.moneda(s.saldo_capital)}</strong></div>
        <div><span>Interés vencido</span><strong>${App.moneda(s.interes_vencido)}</strong></div>
        <div><span>Interés moratorio</span><strong>${App.moneda(s.interes_moratorio)}</strong></div>
        <div><span>Monto vencido</span><strong>${App.moneda(s.monto_vencido)}</strong></div>
      </div>` : ''}

      <h4 class="titulo-bloque">Documentos de respaldo</h4>
      ${bloqueAdjuntos}
      ${bloqueDictamen}
      ${bloqueResolucion}`;
  }

  /** Resumen + tabla del nuevo plan de pagos */
  function renderSimulacion(sim, capacidad) {
    const relacion = capacidad > 0 ? (sim.cuota / capacidad) * 100 : null;
    return `
      <div class="resumen-expediente">
        <div><span>Saldo de capital</span><strong>${App.moneda(sim.saldo_capital_anterior)}</strong></div>
        <div><span>+ Interés vencido</span><strong>${App.moneda(sim.interes_vencido)}</strong></div>
        <div><span>+ Interés moratorio</span><strong>${App.moneda(sim.interes_moratorio)}</strong></div>
        <div class="destacado"><span>= Capital reprogramado</span><strong>${App.moneda(sim.capital_reprogramado)}</strong></div>
        <div class="destacado"><span>Nueva cuota</span><strong>${App.moneda(sim.cuota)}</strong></div>
        <div><span>Cuota anterior</span><strong>${App.moneda(sim.cuota_anterior)}</strong></div>
        <div><span>Plazo / tasa</span><strong>${sim.plazo} meses · ${App.numero(sim.tasa, 2)} %</strong></div>
        <div><span>Total a pagar</span><strong>${App.moneda(sim.total_pagar)}</strong></div>
        <div><span>Primer / último vencimiento</span><strong>${App.fecha(sim.primer_vencimiento)} · ${App.fecha(sim.ultimo_vencimiento)}</strong></div>
        <div><span>Cuota / capacidad de pago</span><strong class="${relacion !== null && relacion > 70 ? 'texto-peligro' : 'texto-exito'}">${relacion === null ? '—' : App.porcentaje(relacion)}</strong></div>
      </div>
      <details class="detalle-plan">
        <summary>Ver nuevo cronograma (${sim.cuotas.length} cuotas)</summary>
        <div class="tabla-contenedor tabla-plan"><table class="tabla">
          <thead><tr><th class="centro">N°</th><th>Vencimiento</th><th class="num">Capital</th><th class="num">Interés</th><th class="num">Cuota</th><th class="num">Saldo</th></tr></thead>
          <tbody>${sim.cuotas.map((q) => `<tr><td class="centro">${q.numero}</td><td>${App.fecha(q.fecha_vencimiento)}</td><td class="num">${App.numero(q.capital)}</td><td class="num">${App.numero(q.interes)}</td><td class="num"><strong>${App.numero(q.monto)}</strong></td><td class="num">${App.numero(q.saldo_capital)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`;
  }

  /* ---------------- Abrir una solicitud ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-abrir]');
    if (!boton) return;
    const id = Number(boton.dataset.abrir);
    const fila = filas.find((r) => r.id_reprogramacion === id);
    document.getElementById('titulo-reprogramacion').textContent = `Reprogramación · ${fila?.codigo || ''}`;
    document.getElementById('expediente-reprogramacion').innerHTML = '<div class="cargador">Cargando expediente...</div>';
    ['panel-simulador', 'panel-jefe', 'boton-derivar', 'boton-aprobar', 'boton-rechazar']
      .forEach((elemento) => document.getElementById(elemento).classList.add('oculto'));
    App.abrirModal('modal-reprogramacion');

    try {
      detalle = await App.api.get(`/api/reprogramaciones/${id}`);
    } catch (error) {
      document.getElementById('expediente-reprogramacion').innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
      return;
    }
    document.getElementById('expediente-reprogramacion').innerHTML = renderExpediente(detalle);
    const { reprogramacion: r, cliente: c } = detalle;
    const capacidad = c.ingresos_mensuales - c.gastos_mensuales;

    // OFICIAL: simulador editable mientras la solicitud esté pendiente de evaluación
    if (esOficial && r.estado === 'PENDIENTE_EVALUACION' && detalle.simulacion) {
      formulario.reset();
      formulario.elements.plazo.max = detalle.plazo_maximo;
      formulario.elements.plazo.value = detalle.simulacion.plazo;
      formulario.elements.tasa.value = detalle.simulacion.tasa;
      document.getElementById('ayuda-plazo').textContent = r.tipo_propuesta === 'CUOTA'
        ? `Sugerido ${detalle.plazo_sugerido} meses para una cuota de hasta ${App.moneda(r.propuesta_cuota)} · máximo ${detalle.plazo_maximo}.`
        : `El cliente propuso ${r.propuesta_plazo} meses · máximo ${detalle.plazo_maximo}.`;
      document.getElementById('resultado-simulacion').innerHTML = renderSimulacion(detalle.simulacion, capacidad);
      simulacionValida = true;
      document.getElementById('panel-simulador').classList.remove('oculto');
      botonDerivar.classList.remove('oculto');
    }

    // JEFE: decisión sobre la simulación derivada por el Oficial
    if (!esOficial && r.estado === 'EN_REVISION_JEFE' && detalle.simulacion) {
      const sim = detalle.simulacion;
      document.getElementById('resultado-jefe').innerHTML = renderSimulacion(sim, capacidad);
      document.getElementById('observacion-jefe').value = '';
      const favorable = r.recomendacion === 'FAVORABLE';
      const excede = sim.capital_reprogramado > detalle.limite_aprobacion;
      document.getElementById('aviso-recomendacion').classList.toggle('oculto', favorable);
      const avisoLimite = document.getElementById('aviso-limite-jefe');
      avisoLimite.classList.toggle('oculto', !excede);
      avisoLimite.innerHTML = `<div><strong>RN04:</strong> El capital a reprogramar supera su límite de aprobación (${App.moneda(detalle.limite_aprobacion)}).</div>`;
      botonAprobar.disabled = !favorable || excede;
      document.getElementById('panel-jefe').classList.remove('oculto');
      botonAprobar.classList.remove('oculto');
      botonRechazar.classList.remove('oculto');
    }
  });

  /* ---------------- Simulador (Oficial) ---------------- */
  const simular = App.retrasar(async () => {
    if (!detalle) return;
    const plazo = Number(formulario.elements.plazo.value);
    const tasa = Number(formulario.elements.tasa.value);
    const destino = document.getElementById('resultado-simulacion');
    simulacionValida = false;
    if (!formulario.elements.plazo.checkValidity() || !formulario.elements.tasa.checkValidity() || !plazo) {
      destino.innerHTML = '<div class="aviso alerta"><div>Ingrese un plazo y una tasa válidos para simular.</div></div>';
      return;
    }
    try {
      const sim = await App.api.post(`/api/reprogramaciones/${detalle.reprogramacion.id_reprogramacion}/simular`, { plazo, tasa });
      destino.innerHTML = renderSimulacion(sim, detalle.cliente.ingresos_mensuales - detalle.cliente.gastos_mensuales);
      simulacionValida = true;
    } catch (error) {
      destino.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  });
  formulario.elements.plazo.addEventListener('input', simular);
  formulario.elements.tasa.addEventListener('input', simular);

  /* ---------------- Derivar al Jefe (Oficial) ---------------- */
  botonDerivar.addEventListener('click', async () => {
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    if (datos.dictamen.length < 20) { App.notificar('alerta', 'El dictamen debe tener al menos 20 caracteres.'); return; }
    if (!simulacionValida) { App.notificar('alerta', 'Corrija el plazo o la tasa: la simulación no es válida.'); return; }
    const ok = await App.confirmar({
      titulo: 'Derivar al Jefe de Crédito',
      mensaje: `Se enviará la simulación (${datos.plazo} meses al ${datos.tasa} %) con dictamen ${datos.recomendacion === 'FAVORABLE' ? 'FAVORABLE' : 'NO FAVORABLE'}. Ya no podrá modificarla.`,
      textoConfirmar: 'Derivar'
    });
    if (!ok) return;
    App.cargando(botonDerivar, true);
    try {
      const r = await App.api.post(`/api/reprogramaciones/${detalle.reprogramacion.id_reprogramacion}/derivar`, datos);
      App.cerrarModal('modal-reprogramacion');
      App.notificar('exito', r.mensaje);
      cargar();
    } catch (error) {
      App.notificar('error', error.message, 7000);
    } finally {
      App.cargando(botonDerivar, false);
    }
  });

  /* ---------------- Aprobar (Jefe) ---------------- */
  botonAprobar.addEventListener('click', async () => {
    const { reprogramacion: rep, simulacion: sim } = detalle;
    const ok = await App.confirmar({
      titulo: 'Aprobar reprogramación',
      mensaje: `Se reemplazarán las cuotas pendientes del crédito ${rep.numero_credito} por ${sim.plazo} cuotas de ${App.moneda(sim.cuota)}. El crédito quedará al día y se generará la Adenda al contrato.`,
      textoConfirmar: 'Aprobar'
    });
    if (!ok) return;
    App.cargando(botonAprobar, true);
    try {
      const r = await App.api.post(`/api/reprogramaciones/${rep.id_reprogramacion}/aprobar`, { observacion: document.getElementById('observacion-jefe').value.trim() });
      App.cerrarModal('modal-reprogramacion');
      App.crearDialogo(`
        <div class="modal-cuerpo exito-aprobacion">
          <h4>¡Reprogramación aprobada!</h4>
          <p class="texto-suave">${App.esc(r.mensaje)}</p>
          <p class="mt-1">Nueva cuota: <strong>${App.moneda(r.nueva_cuota)}</strong> · ${r.nuevo_plazo} meses</p>
          <div class="documentos-generados">
            <a class="documento" href="/app/adenda?id=${r.id_reprogramacion}" target="_blank" rel="noopener"><div><strong>Adenda ${App.esc(r.numero_adenda)}</strong><small>Ver e imprimir</small></div></a>
            <a class="documento" href="/app/cronograma?id=${r.id_credito}" target="_blank" rel="noopener"><div><strong>Nuevo cronograma</strong><small>Plan de pagos vigente</small></div></a>
          </div>
        </div>
        <div class="modal-pie"><button type="button" class="boton boton-primario" data-cerrar-modal>Continuar</button></div>`, { clase: '' });
      cargar();
    } catch (error) {
      App.notificar('error', error.message, 7000);
    } finally {
      App.cargando(botonAprobar, false);
    }
  });

  /* ---------------- Rechazar (Jefe) ---------------- */
  botonRechazar.addEventListener('click', async () => {
    const rep = detalle.reprogramacion;
    const motivo = await App.pedirTexto({
      titulo: `Rechazar ${rep.codigo}`,
      mensaje: 'El motivo es obligatorio y el cliente podrá verlo en su portal. El crédito conservará su situación actual.',
      etiqueta: 'Motivo del rechazo', minimo: 10, textoConfirmar: 'Rechazar solicitud', peligro: true
    });
    if (!motivo) return;
    App.cargando(botonRechazar, true);
    try {
      const r = await App.api.post(`/api/reprogramaciones/${rep.id_reprogramacion}/rechazar`, { motivo });
      App.cerrarModal('modal-reprogramacion');
      App.notificar('exito', r.mensaje);
      cargar();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(botonRechazar, false);
    }
  });

  cargar();
});

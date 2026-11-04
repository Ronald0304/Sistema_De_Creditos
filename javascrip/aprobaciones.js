/* JEFE DE CRÉDITO - BANDEJA DE APROBACIÓN  (CU07 - CU08 - RN03 - RN04)
   ----------------------------------------------------------------------------
   Al aprobar, el servidor genera automáticamente el crédito, el contrato y
   el cronograma de pagos; aquí se ofrecen los enlaces para imprimirlos. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const tabla = document.getElementById('tabla-bandeja');
  const formulario = document.getElementById('formulario-aprobacion');
  const botonAprobar = document.getElementById('boton-aprobar');
  const botonRechazar = document.getElementById('boton-rechazar');
  let solicitudes = [];
  let limiteAprobacion = 0;
  let actual = null;

  /* ---------------- Bandeja ---------------- */
  async function cargarBandeja() {
    tabla.innerHTML = App.filaCargando(8);
    try {
      const { metricas, solicitudes: lista } = await App.api.get('/api/aprobaciones/bandeja');
      solicitudes = lista;
      limiteAprobacion = metricas.limite_aprobacion;
      App.animarNumero(document.getElementById('kpi-pendientes'), metricas.pendientes);
      document.getElementById('kpi-analisis').textContent = `${metricas.en_analisis} más en análisis`;
      App.animarNumero(document.getElementById('kpi-aprobadas'), metricas.aprobadas_hoy);
      App.animarNumero(document.getElementById('kpi-rechazadas'), metricas.rechazadas_hoy);
      App.animarNumero(document.getElementById('kpi-monto'), metricas.monto_aprobado_mes, App.moneda);
      document.getElementById('kpi-limite').textContent = `Su límite por operación: ${App.moneda(limiteAprobacion)}`;

      tabla.innerHTML = solicitudes.length
        ? solicitudes.map((s) => `
          <tr>
            <td><strong>${App.esc(s.codigo)}</strong><span class="secundario">${App.esc(s.producto)}</span></td>
            <td>${App.esc(s.cliente)}<span class="secundario">CI ${App.esc(s.ci)} ${s.calificacion ? `· Calif. ${App.esc(s.calificacion)}` : ''}</span></td>
            <td class="num"><strong>${App.moneda(s.monto_solicitado)}</strong><span class="secundario">${s.plazo_meses} meses ${s.monto_solicitado > limiteAprobacion ? '· <b class="texto-peligro">Excede su límite</b>' : ''}</span></td>
            <td>${App.insignia(s.dictamen)}</td>
            <td>${App.insignia(s.nivel_riesgo)}</td>
            <td class="num">${App.porcentaje(s.relacion_cuota_ingreso)}<span class="secundario">Cobertura ${App.porcentaje(s.cobertura_garantia, 0)}</span></td>
            <td>${App.esc(s.analista)}<span class="secundario">${App.fechaHora(s.fecha_evaluacion)}</span></td>
            <td class="num"><button type="button" class="boton boton-primario boton-sm" data-revisar="${s.id_solicitud}">Revisar</button></td>
          </tr>`).join('')
        : App.filaVacia(8, 'No hay solicitudes pendientes de resolución.');
    } catch (error) {
      tabla.innerHTML = App.filaVacia(8, error.message);
    }
  }

  /* ---------------- Revisión ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-revisar]');
    if (!boton) return;
    actual = solicitudes.find((s) => s.id_solicitud === Number(boton.dataset.revisar));
    const contenedor = document.getElementById('contenido-expediente');
    contenedor.innerHTML = '<div class="cargador">Cargando expediente...</div>';
    document.getElementById('titulo-resolucion').innerHTML = `Resolución · ${App.esc(actual.codigo)}`;
    formulario.reset();
    formulario.elements.monto_aprobado.value = actual.monto_solicitado;
    formulario.elements.monto_aprobado.max = actual.monto_solicitado;
    formulario.elements.tasa_interes.value = actual.tasa_interes;
    document.getElementById('ayuda-monto').textContent = `Máximo: ${App.moneda(actual.monto_solicitado)} (monto solicitado)`;

    const favorable = actual.dictamen === 'FAVORABLE';
    document.getElementById('aviso-dictamen').classList.toggle('oculto', favorable);
    [...formulario.elements].forEach((c) => { if (c.id !== 'cuota-resultante') c.disabled = !favorable; });
    botonAprobar.disabled = !favorable;
    calcularCuota();
    App.abrirModal('modal-resolucion');

    try {
      const detalle = await App.api.get(`/api/solicitudes/${actual.id_solicitud}`);
      contenedor.innerHTML = window.DetalleSolicitud.renderExpediente(detalle);
    } catch (error) {
      contenedor.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  });

  /** Cuota fija (sistema ) con el monto y la tasa propuestos */
  function calcularCuota() {
    if (!actual) return;
    const monto = Number(formulario.elements.monto_aprobado.value);
    const tasa = Number(formulario.elements.tasa_interes.value);
    const n = actual.plazo_meses;
    const i = tasa / 100 / 12;
    const cuota = monto > 0 && tasa > 0 ? (monto * i) / (1 - Math.pow(1 + i, -n)) : 0;
    document.getElementById('cuota-resultante').value = cuota ? `${App.moneda(cuota)} × ${n} meses` : '—';
    const avisoLimite = document.getElementById('aviso-limite');
    const excede = monto > limiteAprobacion;
    avisoLimite.classList.toggle('oculto', !excede);
    avisoLimite.innerHTML = `<div><strong>RN04:</strong> El monto supera su límite de aprobación (${App.moneda(limiteAprobacion)}). Reduzca el monto o eleve la solicitud a Gerencia.</div>`;
  }
  formulario.elements.monto_aprobado.addEventListener('input', calcularCuota);
  formulario.elements.tasa_interes.addEventListener('input', calcularCuota);

  /* ---------------- Aprobar ---------------- */
  botonAprobar.addEventListener('click', async () => {
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    const ok = await App.confirmar({
      titulo: 'Aprobar crédito',
      mensaje: `Se aprobará ${App.moneda(datos.monto_aprobado)} al ${datos.tasa_interes}% anual para ${actual.cliente}. Se generarán el contrato y el cronograma de pagos.`,
      textoConfirmar: 'Aprobar'
    });
    if (!ok) return;
    App.cargando(botonAprobar, true);
    try {
      const r = await App.api.post(`/api/aprobaciones/${actual.id_solicitud}/aprobar`, datos);
      App.cerrarModal('modal-resolucion');
      App.crearDialogo(`
        <div class="modal-cuerpo exito-aprobacion">
          <h4>¡Crédito aprobado!</h4>
          <p class="texto-suave">${App.esc(r.mensaje)}</p>
          <p class="mt-1">Cuota mensual: <strong>${App.moneda(r.cuota_mensual)}</strong></p>
          <div class="documentos-generados">
            <a class="documento" href="/app/contrato?id=${r.id_credito}" target="_blank" rel="noopener"><div><strong>Contrato ${App.esc(r.numero_contrato)}</strong><small>Ver e imprimir</small></div></a>
            <a class="documento" href="/app/cronograma?id=${r.id_credito}" target="_blank" rel="noopener"><div><strong>Cronograma de pagos</strong><small>Plan de amortización</small></div></a>
          </div>
        </div>
        <div class="modal-pie"><button type="button" class="boton boton-primario" data-cerrar-modal>Continuar</button></div>`, { clase: '' });
      cargarBandeja();
    } catch (error) {
      App.notificar('error', error.message, 7000);
    } finally {
      App.cargando(botonAprobar, false);
      botonAprobar.disabled = actual?.dictamen !== 'FAVORABLE';
    }
  });

  /* ---------------- Rechazar ---------------- */
  botonRechazar.addEventListener('click', async () => {
    const motivo = await App.pedirTexto({
      titulo: `Rechazar ${actual.codigo}`,
      mensaje: 'El motivo es obligatorio (RN11) y el cliente podrá verlo en su portal.',
      etiqueta: 'Motivo del rechazo', minimo: 10, textoConfirmar: 'Rechazar solicitud', peligro: true
    });
    if (!motivo) return;
    App.cargando(botonRechazar, true);
    try {
      const r = await App.api.post(`/api/aprobaciones/${actual.id_solicitud}/rechazar`, { motivo });
      App.cerrarModal('modal-resolucion');
      App.notificar('exito', r.mensaje);
      cargarBandeja();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(botonRechazar, false);
    }
  });

  cargarBandeja();
});

/* ANALISTA DE CRÉDITO - EXPEDIENTE DE EVALUACIÓN  (CU03 - CU04 - CU05)
   ----------------------------------------------------------------------------
   1. Muestra el expediente (solicitud, cliente, garantías, créditos previos)
   2. Consulta y ENLAZA el historial crediticio único del cliente (Core Bancario)
   3. Calcula en vivo la capacidad de pago y sugiere un nivel de riesgo
   4. Emite el dictamen FAVORABLE / NO FAVORABLE y lo remite al Jefe */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const idSolicitud = Number(App.parametroUrl('id'));
  const formulario = document.getElementById('formulario-dictamen');
  const contenidoCore = document.getElementById('contenido-core');
  let expediente = null;
  let historial = null;
  let eleccionManual = false;

  // Políticas (deben coincidir con utils/parametros.js del servidor)
  const RCI_BAJO = 0.40;
  const RCI_MEDIO = 0.70;
  const AJUSTE_CALIFICACION = { A: 20, B: 10, C: 0, D: -15, E: -25, F: -40 };

  if (!idSolicitud) { window.location.href = '/app/evaluaciones'; return; }

  /* ---------------- Carga del expediente ---------------- */
  try {
    expediente = await App.api.get(`/api/evaluaciones/solicitud/${idSolicitud}`);
  } catch (error) {
    document.getElementById('cargando-expediente').innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    return;
  }
  historial = expediente.historial;
  pintarExpediente();
  pintarCore();
  precargarFormulario();
  document.getElementById('cargando-expediente').classList.add('oculto');
  document.getElementById('contenedor-evaluacion').classList.remove('oculto');

  function pintarExpediente() {
    const { solicitud: s, cliente: c, garantias, creditos_anteriores: anteriores } = expediente;
    document.getElementById('miga-codigo').textContent = s.codigo;
    document.getElementById('titulo-expediente').textContent = `Evaluación ${s.codigo}`;
    document.getElementById('subtitulo-expediente').textContent = `${c.nombres} ${c.apellidos} · CI ${c.ci} ${c.extension} · Registrada por ${s.oficial}`;
    document.getElementById('estado-solicitud').innerHTML = App.insignia(s.estado);

    document.getElementById('bloque-solicitud').innerHTML = `
      <div class="resumen-expediente">
        <div><span>Producto</span><strong>${App.esc(s.producto)}</strong></div>
        <div><span>Monto solicitado</span><strong>${App.moneda(s.monto_solicitado)}</strong></div>
        <div><span>Plazo</span><strong>${s.plazo_meses} meses</strong></div>
        <div><span>Tasa anual</span><strong>${App.porcentaje(s.tasa_interes, 2)}</strong></div>
      </div>
      <p class="texto-chico texto-suave mt-1"><strong>Destino:</strong> ${App.esc(s.destino)}${s.descripcion ? ` — ${App.esc(s.descripcion)}` : ''}</p>
      <div class="lista-datos mt-2">
        <div class="dato"><span>Cliente</span><strong>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</strong></div>
        <div class="dato"><span>Ocupación</span><strong>${App.esc(c.ocupacion || '—')}</strong></div>
        <div class="dato"><span>Ingresos declarados</span><strong>${App.moneda(c.ingresos_mensuales)}</strong></div>
        <div class="dato"><span>Gastos declarados</span><strong>${App.moneda(c.gastos_mensuales)}</strong></div>
        <div class="dato"><span>Teléfono</span><strong>${App.esc(c.telefono || '—')}</strong></div>
        <div class="dato"><span>Cliente desde</span><strong>${App.fecha(c.fecha_registro)}</strong></div>
      </div>`;

    const cobertura = (expediente.valor_garantias / s.monto_solicitado) * 100;
    document.getElementById('cobertura-garantias').innerHTML = `<span class="insignia ${cobertura >= 100 ? 'verde' : cobertura >= 50 ? 'naranja' : 'rojo'}">Cobertura ${App.porcentaje(cobertura)}</span>`;
    document.getElementById('tabla-garantias').innerHTML = garantias.length
      ? garantias.map((g) => `<tr><td>${App.esc(g.tipo_nombre)}</td><td>${App.esc(g.descripcion)}</td><td class="num">${App.moneda(g.valor_comercial)}</td></tr>`).join('')
      : App.filaVacia(3, 'Sin garantías registradas por el oficial.');

    document.getElementById('tabla-anteriores').innerHTML = anteriores.length
      ? anteriores.map((a) => `<tr><td><strong>${App.esc(a.numero_credito)}</strong><span class="secundario">${App.fecha(a.fecha_desembolso)}</span></td><td class="num">${App.moneda(a.monto_aprobado)}</td><td>${App.insignia(a.estado)}</td><td class="num">${App.moneda(a.saldo_capital)}</td><td class="centro">${a.max_atraso ? `<span class="insignia ${a.max_atraso > 30 ? 'rojo' : 'naranja'}">${a.max_atraso} días</span>` : '<span class="insignia verde">0</span>'}</td></tr>`).join('')
      : App.filaVacia(5, 'Primer crédito del cliente en la entidad.');
  }

  /* ---------------- Core Bancario ---------------- */
  function pintarCore() {
    const editable = expediente.solicitud.estado === 'EN_EVALUACION';
    if (!historial) {
      contenidoCore.innerHTML = `
        <div class="core-vacio">
          <p>El historial crediticio de este cliente aún no fue enlazado.</p>
          ${editable ? `<button type="button" class="boton boton-hero boton-primario mt-2" id="boton-consultar-core">Consultar Core Bancario</button>` : ''}
        </div>`;
    } else {
      const posicion = Math.max(0, Math.min(100, ((historial.puntaje - 300) / 550) * 100));
      contenidoCore.innerHTML = `
        <div class="core-resultado">
          <div class="calificacion-grande ${App.esc(historial.calificacion)}">${App.esc(historial.calificacion)}</div>
          <div>
            <span class="texto-chico">Puntaje crediticio</span>
            <div style="font-family:var(--fuente-titulos);font-size:28px;font-weight:800;color:#fff">${historial.puntaje}</div>
            <div class="medidor-puntaje"><span style="left:0" data-posicion="${posicion}"></span></div>
            <div class="escala-puntaje"><span>300</span><span>850</span></div>
          </div>
        </div>
        <div class="datos-core">
          <div><span>Referencia</span><strong class="mono">${App.esc(historial.codigo_referencia)}</strong></div>
          <div><span>Entidades acreedoras</span><strong>${historial.entidades_acreedoras}</strong></div>
          <div><span>Deuda vigente total</span><strong>${App.moneda(historial.deuda_externa_total)}</strong></div>
          <div><span>Cuotas mensuales</span><strong>${App.moneda(historial.cuota_mensual_externa)}</strong></div>
          <div><span>Créditos previos</span><strong>${historial.creditos_previos} (${historial.creditos_internos} internos)</strong></div>
          <div><span>Máximo atraso</span><strong>${historial.dias_mora_max} días</strong></div>
          <div style="grid-column:1/-1"><span>Mora vigente</span><strong style="color:${historial.en_mora_actual ? '#fca5a5' : '#86efac'}">${historial.en_mora_actual ? 'SÍ — Cliente con mora activa' : 'NO — Sin mora a la fecha'}</strong></div>
        </div>
        <p class="texto-chico mt-2">${App.esc(historial.observaciones || '')}</p>
        <div class="flex entre mt-2" style="position:relative;z-index:1">
          <span class="texto-chico">Consultado: ${App.fechaHora(historial.fecha_consulta)}</span>
          ${editable ? `<button type="button" class="boton boton-secundario boton-sm" id="boton-consultar-core">Actualizar</button>` : ''}
        </div>`;
      requestAnimationFrame(() => setTimeout(() => {
        const marcador = contenidoCore.querySelector('[data-posicion]');
        if (marcador) marcador.style.left = `calc(${marcador.dataset.posicion}% - 2px)`;
      }, 100));
    }
    document.getElementById('boton-consultar-core')?.addEventListener('click', consultarCore);
  }

  async function consultarCore(evento) {
    const boton = evento.currentTarget;
    App.cargando(boton, true);
    try {
      const r = await App.api.post(`/api/evaluaciones/solicitud/${idSolicitud}/historial`);
      historial = r.historial;
      formulario.elements.deudas_mensuales.value = historial.cuota_mensual_externa;
      App.notificar('exito', r.mensaje);
      pintarCore();
      recalcular();
    } catch (error) {
      App.cargando(boton, false);
      App.notificar('error', error.message);
    }
  }

  /* ---------------- Capacidad de pago (cálculo en vivo) ---------------- */
  function precargarFormulario() {
    const pre = expediente.pre_calculo;
    formulario.elements.ingresos.value = pre.ingresos;
    formulario.elements.gastos.value = pre.gastos;
    formulario.elements.deudas_mensuales.value = pre.deudas_mensuales;
    if (expediente.solicitud.estado !== 'EN_EVALUACION') {
      [...formulario.elements].forEach((campo) => { campo.disabled = true; });
      formulario.insertAdjacentHTML('afterbegin', `<div class="aviso info mb-2"><div>Esta solicitud ya no está en evaluación (estado: <strong>${App.esc(App.etiquetaEstado(expediente.solicitud.estado))}</strong>).</div></div>`);
      if (expediente.evaluacion) {
        formulario.elements.nivel_riesgo.value = expediente.evaluacion.nivel_riesgo;
        formulario.elements.observaciones.value = expediente.evaluacion.observaciones;
        const radio = formulario.querySelector(`input[name="dictamen"][value="${expediente.evaluacion.dictamen}"]`);
        if (radio) radio.checked = true;
      }
    }
    recalcular();
  }

  function recalcular() {
    const s = expediente.solicitud;
    const ingresos = Number(formulario.elements.ingresos.value) || 0;
    const gastos = Number(formulario.elements.gastos.value) || 0;
    const deudas = Number(formulario.elements.deudas_mensuales.value) || 0;
    const cuota = expediente.pre_calculo.cuota_estimada;
    const capacidad = ingresos - gastos - deudas;
    const rci = capacidad > 0 ? cuota / capacidad : Infinity;
    const cobertura = (expediente.valor_garantias / s.monto_solicitado) * 100;

    // Puntaje interno (misma lógica que utils/finanzas.js -> evaluarCapacidad)
    let puntaje = 50;
    if (rci <= RCI_BAJO) puntaje += 20; else if (rci <= RCI_MEDIO) puntaje += 5; else puntaje -= 30;
    if (historial) {
      puntaje += AJUSTE_CALIFICACION[historial.calificacion] ?? 0;
      if (historial.en_mora_actual) puntaje -= 25;
      if (historial.dias_mora_max > 90) puntaje -= 10;
    }
    if (cobertura >= 100) puntaje += 10; else if (cobertura >= 50) puntaje += 5; else puntaje -= 5;
    puntaje = Math.max(0, Math.min(100, puntaje));
    const riesgo = puntaje >= 70 ? 'BAJO' : puntaje >= 45 ? 'MEDIO' : 'ALTO';
    const dictamen = riesgo !== 'ALTO' && capacidad > 0 && rci <= RCI_MEDIO ? 'FAVORABLE' : 'NO_FAVORABLE';

    const claseRci = rci <= RCI_BAJO ? 'bueno' : rci <= RCI_MEDIO ? 'medio' : 'malo';
    document.getElementById('indicadores-capacidad').innerHTML = `
      <div class="indicador ${capacidad > cuota ? 'bueno' : 'malo'}"><span>Capacidad de pago</span><strong>${App.moneda(capacidad)}</strong></div>
      <div class="indicador"><span>Cuota estimada</span><strong>${App.moneda(cuota)}</strong></div>
      <div class="indicador ${claseRci}"><span>Cuota / capacidad</span><strong>${Number.isFinite(rci) ? App.porcentaje(rci * 100) : '∞'}</strong></div>
      <div class="indicador ${cobertura >= 100 ? 'bueno' : cobertura >= 50 ? 'medio' : 'malo'}"><span>Cobertura garantías</span><strong>${App.porcentaje(cobertura)}</strong></div>`;

    document.getElementById('sugerencia-sistema').innerHTML = `<div><strong>Sugerencia del sistema:</strong> riesgo ${App.esc(App.etiquetaEstado(riesgo).replace('Riesgo ', ''))}, dictamen ${App.esc(App.etiquetaEstado(dictamen).toLowerCase())} (puntaje interno ${puntaje}/100).
      ${historial ? '' : '<br><strong>Consulte el Core Bancario</strong> para considerar el historial crediticio.'} La decisión final corresponde al analista.</div>`;

    // Preselección de la sugerencia mientras el analista no elija manualmente
    if (!eleccionManual && expediente.solicitud.estado === 'EN_EVALUACION') {
      formulario.elements.nivel_riesgo.value = riesgo;
      const radio = formulario.querySelector(`input[name="dictamen"][value="${dictamen}"]`);
      if (radio) radio.checked = true;
    }
  }
  ['ingresos', 'gastos', 'deudas_mensuales'].forEach((n) => formulario.elements[n].addEventListener('input', recalcular));
  formulario.elements.nivel_riesgo.addEventListener('change', () => { eleccionManual = true; });
  formulario.querySelectorAll('input[name="dictamen"]').forEach((r) => r.addEventListener('change', () => { eleccionManual = true; }));

  /* ---------------- Emitir dictamen ---------------- */
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!historial) { App.notificar('alerta', 'Primero consulte el historial crediticio en el Core Bancario.'); return; }
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    datos.dictamen = formulario.querySelector('input[name="dictamen"]:checked')?.value;
    if (!datos.dictamen) { App.notificar('alerta', 'Seleccione el dictamen.'); return; }

    const favorable = datos.dictamen === 'FAVORABLE';
    const ok = await App.confirmar({
      titulo: `Dictamen ${favorable ? 'FAVORABLE' : 'NO FAVORABLE'}`,
      mensaje: `Se remitirá la solicitud ${expediente.solicitud.codigo} al Jefe de Crédito con riesgo ${datos.nivel_riesgo}. Esta acción no se puede deshacer.`,
      textoConfirmar: 'Emitir dictamen', peligro: !favorable
    });
    if (!ok) return;
    const boton = document.getElementById('boton-dictamen');
    App.cargando(boton, true);
    try {
      const r = await App.api.post(`/api/evaluaciones/solicitud/${idSolicitud}/dictamen`, datos);
      App.notificar('exito', r.mensaje);
      setTimeout(() => { window.location.href = '/app/evaluaciones'; }, 1200);
    } catch (error) {
      App.cargando(boton, false);
      App.notificar('error', error.message);
    }
  });
});

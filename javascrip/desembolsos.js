/* OFICIAL DE CRÉDITO - DESEMBOLSOS  (CU11 - RF12) */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const lista = document.getElementById('lista-pendientes');
  const tablaHistorial = document.getElementById('tabla-desembolsados');
  const formulario = document.getElementById('formulario-desembolso');
  const campoCuenta = document.getElementById('campo-cuenta');
  let pendientes = [];
  let seleccionado = null;
  const NOMBRE_MEDIO = { ABONO_CUENTA: 'Abono en cuenta', CHEQUE: 'Cheque', EFECTIVO: 'Efectivo' };

  /* ---------------- Créditos pendientes ---------------- */
  async function cargarPendientes() {
    lista.innerHTML = '<div class="cargador">Cargando...</div>';
    try {
      pendientes = await App.api.get('/api/creditos/pendientes-desembolso');
      document.getElementById('contador-pendientes').textContent = pendientes.length;
      lista.innerHTML = pendientes.length
        ? pendientes.map((p, i) => `
          <article class="tarjeta-desembolso animar" style="--i:${i}">
            <div class="flex entre"><strong>${App.esc(p.numero_credito)}</strong>${App.insignia('PENDIENTE_DESEMBOLSO')}</div>
            <div><div class="monto">${App.moneda(p.monto_aprobado)}</div><span class="texto-chico texto-suave">${App.esc(p.producto)} · ${p.plazo_meses} meses al ${App.numero(p.tasa_interes, 2)}%</span></div>
            <div>
              <div class="fila"><span>Cliente</span><b>${App.esc(p.cliente)}</b></div>
              <div class="fila"><span>CI</span><b>${App.esc(p.ci)}</b></div>
              <div class="fila"><span>Cuota mensual</span><b>${App.moneda(p.cuota_mensual)}</b></div>
              <div class="fila"><span>Aprobado por</span><b>${App.esc(p.jefe || '—')} · ${App.fecha(p.fecha_aprobacion)}</b></div>
              <div class="fila"><span>Garantías</span><b class="${p.garantias ? 'texto-exito' : 'texto-peligro'}">${p.garantias ? `${p.garantias} · ${App.moneda(p.valor_garantias)}` : 'Sin garantías'}</b></div>
            </div>
            <div class="flex envolver">
              <a class="boton boton-secundario boton-sm" href="/app/contrato?id=${p.id_credito}" target="_blank" rel="noopener">Contrato</a>
              <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${p.id_credito}" target="_blank" rel="noopener">Cronograma</a>
              ${p.garantias
                ? `<button type="button" class="boton boton-exito boton-sm" data-desembolsar="${p.id_credito}" style="margin-left:auto">Desembolsar</button>`
                : `<a class="boton boton-primario boton-sm" href="/app/garantias?solicitud=${p.id_solicitud}" style="margin-left:auto">Registrar garantía</a>`}
            </div>
          </article>`).join('')
        : `<div class="tarjeta estado-vacio" style="grid-column:1/-1"><strong>Sin desembolsos pendientes</strong>Los créditos aprobados por el Jefe de Crédito aparecerán aquí.</div>`;
    } catch (error) {
      lista.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  }

  /* ---------------- Historial ---------------- */
  async function cargarHistorial() {
    tablaHistorial.innerHTML = App.filaCargando(8);
    try {
      const filas = await App.api.get('/api/creditos/desembolsados');
      tablaHistorial.innerHTML = filas.length
        ? filas.map((d) => `
          <tr>
            <td><strong>${App.esc(d.numero_credito)}</strong><span class="secundario">${App.esc(d.numero_contrato)}</span></td>
            <td>${App.esc(d.cliente)}<span class="secundario">CI ${App.esc(d.ci)}</span></td>
            <td class="num">${App.moneda(d.monto_aprobado)}</td>
            <td>${App.fechaHora(d.fecha_desembolso)}<span class="secundario">${App.esc(d.oficial || '')}</span></td>
            <td>${App.esc(NOMBRE_MEDIO[d.medio_desembolso] || '—')}</td>
            <td class="mono">${App.esc(d.codigo_transaccion || '—')}</td>
            <td>${App.insignia(d.estado)}</td>
            <td class="num"><div class="grupo-acciones" style="justify-content:flex-end">
              <a class="boton boton-secundario boton-sm" href="/app/contrato?id=${d.id_credito}" target="_blank" rel="noopener" title="Contrato">Contrato</a>
              <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${d.id_credito}" target="_blank" rel="noopener" title="Cronograma">Cronograma</a>
            </div></td>
          </tr>`).join('')
        : App.filaVacia(8, 'Aún no se registraron desembolsos.');
    } catch (error) {
      tablaHistorial.innerHTML = App.filaVacia(8, error.message);
    }
  }

  /* ---------------- Ejecutar desembolso ---------------- */
  lista.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-desembolsar]');
    if (!boton) return;
    seleccionado = pendientes.find((p) => p.id_credito === Number(boton.dataset.desembolsar));
    formulario.reset();
    actualizarMedio();
    document.getElementById('resumen-desembolso').innerHTML = `
      <div class="resumen-solicitud">
        <div class="dato"><span>Crédito</span><strong>${App.esc(seleccionado.numero_credito)}</strong></div>
        <div class="dato"><span>Cliente</span><strong>${App.esc(seleccionado.cliente)}</strong></div>
        <div class="dato"><span>Monto a desembolsar</span><strong class="texto-exito">${App.moneda(seleccionado.monto_aprobado)}</strong></div>
        <div class="dato"><span>Cuota mensual</span><strong>${App.moneda(seleccionado.cuota_mensual)} × ${seleccionado.plazo_meses}</strong></div>
      </div>`;
    App.abrirModal('modal-desembolso');
  });

  function actualizarMedio() {
    const medio = formulario.elements.medio_desembolso.value;
    campoCuenta.classList.toggle('oculto', medio === 'EFECTIVO');
    document.getElementById('etiqueta-cuenta').innerHTML = `${medio === 'CHEQUE' ? 'Número de cheque' : 'Número de cuenta de destino'} <span class="obligatorio">*</span>`;
  }
  formulario.querySelectorAll('input[name="medio_desembolso"]').forEach((r) => r.addEventListener('change', actualizarMedio));

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = App.datosFormulario(formulario);
    datos.medio_desembolso = formulario.elements.medio_desembolso.value;
    if (datos.medio_desembolso !== 'EFECTIVO' && !datos.cuenta_destino) {
      App.notificar('alerta', 'Ingrese el número de cuenta o de cheque.');
      return;
    }
    const boton = document.getElementById('boton-confirmar-desembolso');
    App.cargando(boton, true);
    try {
      const r = await App.api.post(`/api/creditos/${seleccionado.id_credito}/desembolsar`, datos);
      App.cerrarModal('modal-desembolso');
      App.crearDialogo(`
        <div class="modal-cuerpo">
          <div class="texto-dialogo"><h4>Desembolso ejecutado</h4><p>${App.esc(r.mensaje)}</p></div>
        </div>
        <div class="modal-pie">
          <a class="boton boton-secundario" href="/app/cronograma?id=${r.id_credito}" target="_blank" rel="noopener">Cronograma</a>
          <a class="boton boton-primario" href="/app/contrato?id=${r.id_credito}" target="_blank" rel="noopener">Imprimir contrato</a>
        </div>`);
      cargarPendientes();
      cargarHistorial();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(boton, false);
    }
  });

  document.getElementById('boton-refrescar').addEventListener('click', () => { cargarPendientes(); cargarHistorial(); });
  cargarPendientes();
  cargarHistorial();
});

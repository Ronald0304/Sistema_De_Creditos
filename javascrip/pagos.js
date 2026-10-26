/* CAJERO - CAJA, COBRANZAS Y CONTROL DE MORA  (CU12 - CU13)
   ----------------------------------------------------------------------------
   - Búsqueda rápida de créditos (CI, N° de crédito o nombre)
   - Estado de cuenta con recargo por mora calculado a la fecha
   - Pago de N cuotas (siempre las más antiguas primero) o cancelación total
   - Exoneración controlada del recargo (con motivo auditado)
   - Voucher imprimible, cartera en mora y arqueo diario */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const campoBusqueda = document.getElementById('campo-busqueda');
  const resultados = document.getElementById('resultados-busqueda');
  const estadoCuenta = document.getElementById('estado-cuenta');
  const tablaCuotas = document.getElementById('tabla-cuotas');
  const campoCantidad = document.getElementById('cantidad-cuotas');
  const casillaExonerar = document.getElementById('exonerar-recargo');
  const motivoExoneracion = document.getElementById('motivo-exoneracion');
  const formaPago = document.getElementById('forma-pago');
  const montoRecibido = document.getElementById('monto-recibido');
  const botonCobrar = document.getElementById('boton-cobrar');
  let cuenta = null;      // respuesta de /api/pagos/credito/:id
  let modo = 'cuotas';    // 'cuotas' | 'cancelacion'
  let totalActual = 0;

  /* ---------------- Indicadores ---------------- */
  async function cargarIndicadores() {
    try {
      const [{ totales }, mora] = await Promise.all([App.api.get('/api/pagos/del-dia'), App.api.get('/api/pagos/mora')]);
      App.animarNumero(document.getElementById('kpi-recaudado'), totales.total, App.moneda);
      App.animarNumero(document.getElementById('kpi-operaciones'), totales.cantidad);
      App.animarNumero(document.getElementById('kpi-recargos'), totales.recargos, App.moneda);
      App.animarNumero(document.getElementById('kpi-mora'), mora.length);
    } catch (error) { /* no crítico */ }
  }

  /* ---------------- Búsqueda ---------------- */
  async function buscar() {
    const criterio = campoBusqueda.value.trim();
    if (criterio.length < 3) { App.notificar('alerta', 'Ingrese al menos 3 caracteres.'); return; }
    resultados.innerHTML = '<div class="cargador">Buscando...</div>';
    try {
      const creditos = await App.api.get(`/api/pagos/buscar?criterio=${encodeURIComponent(criterio)}`);
      resultados.innerHTML = creditos.map((c, i) => `
        <button type="button" class="resultado" data-credito="${c.id_credito}" style="animation-delay:${i * 50}ms">
          <div class="avatar">${App.esc(App.iniciales(c.cliente))}</div>
          <div class="info"><strong>${App.esc(c.cliente)}</strong><span>CI ${App.esc(c.ci)} · ${App.esc(c.numero_credito)} · ${c.cuotas_pagadas}/${c.plazo_meses} cuotas pagadas</span></div>
          <div class="montos">${App.insignia(c.estado)}<b>${App.moneda(c.saldo_capital)}</b>saldo capital</div>
        </button>`).join('');
      if (creditos.length === 1) seleccionarCredito(creditos[0].id_credito);
    } catch (error) {
      resultados.innerHTML = `<div class="aviso alerta"><div>${App.esc(error.message)}</div></div>`;
    }
  }
  document.getElementById('boton-buscar').addEventListener('click', buscar);
  campoBusqueda.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });
  resultados.addEventListener('click', (e) => {
    const r = e.target.closest('[data-credito]');
    if (r) seleccionarCredito(Number(r.dataset.credito));
  });

  /* ---------------- Estado de cuenta ---------------- */
  async function seleccionarCredito(idCredito) {
    resultados.querySelectorAll('.resultado').forEach((r) => r.classList.toggle('seleccionado', Number(r.dataset.credito) === idCredito));
    try {
      cuenta = await App.api.get(`/api/pagos/credito/${idCredito}`);
    } catch (error) { App.notificar('error', error.message); return; }
    estadoCuenta.classList.remove('oculto');
    const c = cuenta.credito;
    const pendientes = cuenta.cuotas.filter((q) => q.estado !== 'PAGADA');
    const claseEstado = c.estado === 'EN_MORA' ? 'mora' : c.estado === 'CANCELADO' ? 'cancelado' : '';

    document.getElementById('cabecera-credito').className = `cabecera-credito ${claseEstado}`;
    document.getElementById('cabecera-credito').innerHTML = `
      <div class="avatar">${App.esc(App.iniciales(c.cliente))}</div>
      <div><h3>${App.esc(c.cliente)}</h3><span>CI ${App.esc(c.ci)} ${App.esc(c.extension || '')} · ${App.esc(c.numero_credito)} · Tel. ${App.esc(c.telefono || '—')}</span><div class="mt-1">${App.insignia(c.estado)}</div></div>
      <div class="cifras">
        <div><span>Monto otorgado</span><b>${App.moneda(c.monto_aprobado)}</b></div>
        <div><span>Saldo capital</span><b>${App.moneda(c.saldo_capital)}</b></div>
        <div><span>Cuotas pagadas</span><b>${c.cuotas_pagadas} / ${c.plazo_meses}</b></div>
        <div><span>Vencido</span><b>${App.moneda(c.monto_vencido)}</b></div>
      </div>`;
    document.getElementById('enlace-cronograma').href = `/app/cronograma?id=${c.id_credito}`;
    document.getElementById('politica-mora').textContent = `Recargo: ${cuenta.politica_mora.tasa_diaria}% diario sobre la cuota vencida (tope ${cuenta.politica_mora.tope}%).`;

    // Panel de cobro
    const panel = document.getElementById('panel-cobro');
    panel.classList.toggle('oculto', !pendientes.length);
    campoCantidad.max = pendientes.length;
    campoCantidad.value = Math.max(1, pendientes.filter((q) => q.estado === 'VENCIDA').length || 1);
    casillaExonerar.checked = false;
    motivoExoneracion.value = '';
    motivoExoneracion.classList.add('oculto');
    montoRecibido.value = '';
    cambiarModo('cuotas');

    // Historial de pagos del crédito
    document.getElementById('tabla-pagos-credito').innerHTML = cuenta.pagos.length
      ? cuenta.pagos.map((p) => `
        <tr><td class="mono">${App.esc(p.numero_recibo)}</td><td>${App.fechaHora(p.fecha_pago)}</td><td>${App.insignia(p.tipo)}</td>
          <td>${App.esc(p.cuotas_pagadas)}</td><td class="num">${App.moneda(p.monto_recargo)}</td><td class="num"><strong>${App.moneda(p.monto_total)}</strong></td>
          <td>${App.esc(p.cajero)}</td><td class="num"><a class="boton boton-secundario boton-sm" href="/app/voucher?id=${p.id_pago}" target="_blank" rel="noopener" title="Voucher">Voucher</a></td></tr>`).join('')
      : App.filaVacia(8, 'Aún no se registraron pagos para este crédito.');
    estadoCuenta.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function pintarCuotas() {
    const pendientes = cuenta.cuotas.filter((q) => q.estado !== 'PAGADA');
    const cantidad = modo === 'cancelacion' ? pendientes.length : Number(campoCantidad.value) || 0;
    const marcadas = new Set(pendientes.slice(0, cantidad).map((q) => q.id_cuota));
    tablaCuotas.innerHTML = cuenta.cuotas.map((q) => {
      const clase = q.estado === 'PAGADA' ? 'cuota-pagada' : marcadas.has(q.id_cuota) ? 'por-pagar' : '';
      const recargo = q.estado === 'PAGADA' ? q.recargo_mora : q.recargo_hoy;
      return `
        <tr class="${clase}">
          <td class="centro"><strong>${q.numero}</strong></td>
          <td>${App.fecha(q.fecha_vencimiento)}${q.fecha_pago ? `<span class="secundario">Pagada ${App.fecha(q.fecha_pago)}</span>` : ''}</td>
          <td class="num">${App.numero(q.capital)}</td>
          <td class="num">${App.numero(q.interes)}</td>
          <td class="num"><strong>${App.numero(q.monto)}</strong></td>
          <td class="centro">${q.dias_atraso ? `<span class="insignia ${q.estado === 'PAGADA' ? 'gris' : 'rojo'}">${q.dias_atraso} d</span>` : '—'}</td>
          <td class="num ${recargo ? 'texto-alerta' : ''}">${recargo ? App.numero(recargo) : '—'}</td>
          <td>${App.insignia(q.estado)}</td>
        </tr>`;
    }).join('');
  }

  /* ---------------- Cálculo del cobro ---------------- */
  function calcularCobro() {
    if (!cuenta) return;
    const pendientes = cuenta.cuotas.filter((q) => q.estado !== 'PAGADA');
    let capital = 0; let interes = 0; let recargo = 0; let etiqueta = '';
    if (modo === 'cancelacion' && cuenta.cancelacion) {
      ({ capital, interes, recargo } = cuenta.cancelacion);
      etiqueta = `Cancelación total (${pendientes.length} cuotas)`;
    } else {
      const cantidad = Math.min(Math.max(1, Number(campoCantidad.value) || 1), pendientes.length);
      campoCantidad.value = cantidad;
      pendientes.slice(0, cantidad).forEach((q) => { capital += q.capital; interes += q.interes; recargo += q.recargo_hoy; });
      etiqueta = `${cantidad} cuota(s): N° ${pendientes.slice(0, cantidad).map((q) => q.numero).join(', ')}`;
    }
    const exonerar = casillaExonerar.checked;
    totalActual = Math.round((capital + interes + (exonerar ? 0 : recargo)) * 100) / 100;
    document.getElementById('bloque-exoneracion').classList.toggle('oculto', recargo <= 0);
    document.getElementById('desglose').innerHTML = `
      <div class="texto-chico texto-suave">${App.esc(etiqueta)}</div>
      <div><span>Capital</span><b>${App.moneda(capital)}</b></div>
      <div><span>Interés</span><b>${App.moneda(interes)}</b></div>
      <div class="recargo"><span>Recargo por mora</span><b class="${exonerar ? 'tachado' : ''}">${App.moneda(recargo)}</b></div>
      <div class="total"><span>Total a cobrar</span><span>${App.moneda(totalActual)}</span></div>`;
    pintarCuotas();
    calcularCambio();
  }

  function calcularCambio() {
    const efectivo = formaPago.value === 'EFECTIVO';
    document.getElementById('bloque-recibido').classList.toggle('oculto', !efectivo);
    const caja = document.getElementById('caja-cambio');
    caja.classList.toggle('oculto', !efectivo);
    if (!efectivo) return;
    const recibido = Number(montoRecibido.value) || 0;
    const cambio = recibido - totalActual;
    caja.classList.toggle('insuficiente', recibido > 0 && cambio < 0);
    caja.querySelector('span').textContent = cambio < 0 && recibido > 0 ? 'Monto insuficiente, faltan' : 'Cambio a devolver';
    document.getElementById('monto-cambio').textContent = App.moneda(Math.abs(recibido ? cambio : 0));
  }

  function cambiarModo(nuevo) {
    modo = nuevo;
    document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === modo));
    document.getElementById('bloque-cantidad').classList.toggle('oculto', modo === 'cancelacion');
    document.getElementById('aviso-cancelacion').classList.toggle('oculto', modo !== 'cancelacion');
    botonCobrar.innerHTML = `${modo === 'cancelacion' ? 'Cancelar crédito' : 'Cobrar cuotas'}`;
    calcularCobro();
  }
  document.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => cambiarModo(b.dataset.modo)));
  document.getElementById('cuotas-menos').addEventListener('click', () => { campoCantidad.value = Math.max(1, Number(campoCantidad.value) - 1); calcularCobro(); });
  document.getElementById('cuotas-mas').addEventListener('click', () => { campoCantidad.value = Number(campoCantidad.value) + 1; calcularCobro(); });
  campoCantidad.addEventListener('input', calcularCobro);
  casillaExonerar.addEventListener('change', () => { motivoExoneracion.classList.toggle('oculto', !casillaExonerar.checked); calcularCobro(); });
  formaPago.addEventListener('change', calcularCambio);
  montoRecibido.addEventListener('input', calcularCambio);

  /* ---------------- Registrar el cobro ---------------- */
  botonCobrar.addEventListener('click', async () => {
    if (!cuenta) return;
    const efectivo = formaPago.value === 'EFECTIVO';
    const recibido = efectivo ? Number(montoRecibido.value) : totalActual;
    if (efectivo && (!recibido || recibido < totalActual)) { App.notificar('alerta', `Ingrese un monto recibido igual o mayor a ${App.moneda(totalActual)}.`); montoRecibido.focus(); return; }
    if (casillaExonerar.checked && motivoExoneracion.value.trim().length < 10) { App.notificar('alerta', 'Indique el motivo de la exoneración (mínimo 10 caracteres).'); motivoExoneracion.focus(); return; }

    const ok = await App.confirmar({
      titulo: modo === 'cancelacion' ? 'Confirmar cancelación total' : 'Confirmar cobro',
      mensaje: `Se registrará el cobro de ${App.moneda(totalActual)} (${formaPago.options[formaPago.selectedIndex].text}) para ${cuenta.credito.cliente}.`,
      textoConfirmar: 'Registrar cobro'
    });
    if (!ok) return;

    const cuerpo = {
      id_credito: cuenta.credito.id_credito,
      monto_recibido: recibido,
      forma_pago: formaPago.value,
      exonerar_recargo: casillaExonerar.checked,
      motivo_exoneracion: motivoExoneracion.value.trim()
    };
    if (modo === 'cuotas') cuerpo.cantidad_cuotas = Number(campoCantidad.value);
    App.cargando(botonCobrar, true);
    try {
      const r = await App.api.post(modo === 'cancelacion' ? '/api/pagos/cancelar' : '/api/pagos/registrar', cuerpo);
      App.crearDialogo(`
        <div class="modal-cuerpo">
          <div class="texto-dialogo"><h4>${App.esc(r.mensaje)}</h4><p>Recibo <strong>${App.esc(r.numero_recibo)}</strong></p></div>
          <div class="credenciales"><div><span>Total cobrado</span><strong>${App.moneda(r.total)}</strong></div>${r.cambio > 0 ? `<div><span>Cambio</span><strong>${App.moneda(r.cambio)}</strong></div>` : ''}</div>
        </div>
        <div class="modal-pie">
          <button type="button" class="boton boton-secundario" data-cerrar-modal>Cerrar</button>
          <a class="boton boton-primario" href="/app/voucher?id=${r.id_pago}" target="_blank" rel="noopener">Imprimir voucher</a>
        </div>`);
      seleccionarCredito(cuenta.credito.id_credito);
      cargarIndicadores();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(botonCobrar, false);
    }
  });

  /* ---------------- Cartera en mora ---------------- */
  async function cargarMora() {
    const tabla = document.getElementById('tabla-mora');
    tabla.innerHTML = App.filaCargando(8);
    try {
      const filas = await App.api.get('/api/pagos/mora');
      tabla.innerHTML = filas.length
        ? filas.map((m) => `
          <tr class="${m.dias_mora > 30 ? 'fila-alerta' : ''}">
            <td><strong>${App.esc(m.numero_credito)}</strong><span class="secundario">Desde ${App.fecha(m.primera_vencida)}</span></td>
            <td>${App.esc(m.cliente)}<span class="secundario">CI ${App.esc(m.ci)}</span></td>
            <td>${App.esc(m.telefono || '—')}</td>
            <td class="centro"><strong>${m.cuotas_vencidas}</strong></td>
            <td class="centro"><span class="insignia ${m.dias_mora > 60 ? 'rojo' : m.dias_mora > 30 ? 'naranja' : 'gris'}">${m.dias_mora} días</span></td>
            <td class="num">${App.moneda(m.monto_vencido)}</td>
            <td class="num texto-alerta">${App.moneda(m.recargo_acumulado)}</td>
            <td class="num"><button type="button" class="boton boton-primario boton-sm" data-cobrar="${m.id_credito}">Cobrar</button></td>
          </tr>`).join('')
        : App.filaVacia(8, '¡Excelente! No hay créditos en mora.');
    } catch (error) { tabla.innerHTML = App.filaVacia(8, error.message); }
  }
  document.getElementById('tabla-mora').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cobrar]');
    if (!b) return;
    document.querySelector('[data-pestana="cobranza"]').click();
    resultados.innerHTML = '';
    seleccionarCredito(Number(b.dataset.cobrar));
  });

  /* ---------------- Arqueo del día ---------------- */
  async function cargarArqueo() {
    const tabla = document.getElementById('tabla-arqueo');
    tabla.innerHTML = App.filaCargando(7);
    try {
      const { pagos, totales } = await App.api.get('/api/pagos/del-dia');
      tabla.innerHTML = pagos.length
        ? pagos.map((p) => `
          <tr><td>${App.esc(p.fecha_pago.slice(11, 16))}</td><td class="mono">${App.esc(p.numero_recibo)}</td>
            <td>${App.esc(p.cliente)}<span class="secundario">${App.esc(p.numero_credito)}</span></td><td>${App.insignia(p.tipo)}</td>
            <td>${App.esc(p.forma_pago)}</td><td class="num"><strong>${App.moneda(p.monto_total)}</strong></td>
            <td class="num"><a class="boton boton-secundario boton-sm" href="/app/voucher?id=${p.id_pago}" target="_blank" rel="noopener" title="Voucher">Voucher</a></td></tr>`).join('')
        : App.filaVacia(7, 'Aún no registró operaciones hoy.');
      const formas = Object.entries(totales.por_forma);
      document.getElementById('resumen-arqueo').innerHTML = `
        <p class="texto-chico texto-suave">${App.esc(App.fechaLarga())}</p>
        ${formas.length ? formas.map(([forma, monto]) => `<div class="fila-forma"><span>${App.esc(forma)}</span><b>${App.moneda(monto)}</b></div>`).join('') : '<p class="texto-suave mt-1">Sin movimientos.</p>'}
        <div class="fila-forma"><span>Recargos por mora</span><b>${App.moneda(totales.recargos)}</b></div>
        <div class="total-arqueo"><span>Total del día</span><span>${App.moneda(totales.total)}</span></div>`;
    } catch (error) { tabla.innerHTML = App.filaVacia(7, error.message); }
  }
  document.getElementById('boton-imprimir-arqueo').addEventListener('click', () => window.print());

  App.activarPestanas(document, (panel) => {
    if (panel === 'mora') cargarMora();
    if (panel === 'arqueo') cargarArqueo();
  });
  cargarIndicadores();
  campoBusqueda.focus();
});

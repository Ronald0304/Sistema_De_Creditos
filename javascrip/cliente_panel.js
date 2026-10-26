/* PORTAL DEL CLIENTE (solo consulta)
   ----------------------------------------------------------------------------
   El cliente puede ver: su perfil, el estado de su cuenta (AL DÍA, EN MORA o
   CANCELADO), el resultado de sus solicitudes (aprobada / rechazada y motivo),
   su cronograma, sus pagos y vouchers. No puede registrarse ni pagar en línea. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const MENSAJES = {
    AL_DIA: ['¡Está al día!', 'Sus pagos se encuentran en orden. Gracias por su puntualidad.', 'al-dia'],
    EN_MORA: ['Crédito en mora', 'Tiene cuotas vencidas. Acérquese a caja para regularizar su situación y evitar mayores recargos.', 'mora'],
    CANCELADO: ['Crédito cancelado', 'Felicidades: todos sus créditos fueron pagados en su totalidad.', 'cancelado'],
    PENDIENTE_DESEMBOLSO: ['Crédito aprobado', 'Su crédito fue aprobado y está pendiente de desembolso. Su oficial de crédito se comunicará con usted.', 'al-dia'],
    SIN_CREDITOS: ['Bienvenido(a)', 'Aún no tiene créditos activos. Revise el estado de sus solicitudes en la pestaña correspondiente.', '']
  };

  let datos;
  try {
    datos = await App.api.get('/api/clientesp/resumen');
  } catch (error) {
    App.notificar('error', error.message);
    return;
  }
  const { perfil, estado_cuenta: cuenta, solicitudes, creditos, pagos } = datos;

  /* ---------------- Estado general ---------------- */
  const [titulo, mensaje, clase] = MENSAJES[cuenta.estado] || MENSAJES.SIN_CREDITOS;
  const hero = document.getElementById('hero-cliente');
  if (clase) hero.classList.add(clase);
  document.getElementById('estado-general').textContent = titulo;
  document.getElementById('mensaje-estado').textContent = mensaje;
  App.animarNumero(document.getElementById('cifra-saldo'), cuenta.saldo_total, App.moneda);
  App.animarNumero(document.getElementById('cifra-vencido'), cuenta.monto_vencido, App.moneda);
  App.animarNumero(document.getElementById('cifra-pagado'), cuenta.total_pagado, App.moneda);
  document.getElementById('nombre-oficial').textContent = perfil.oficial || 'su agencia';

  /* ---------------- Créditos ---------------- */
  const contenedorCreditos = document.getElementById('lista-creditos');
  contenedorCreditos.innerHTML = creditos.length
    ? creditos.map((c, i) => {
      const avance = (c.cuotas_pagadas / c.plazo_meses) * 100;
      const proxima = c.proxima_cuota;
      const insigniaSituacion = c.estado === 'VIGENTE' ? App.insignia('AL_DIA') : App.insignia(c.estado);
      return `
        <article class="tarjeta credito-cliente animar" style="--i:${i}">
          <div class="cabecera">
            <div><h3>${App.esc(c.producto)}</h3><span class="texto-chico texto-suave">Crédito ${App.esc(c.numero_credito)} · Contrato ${App.esc(c.numero_contrato)}</span></div>
            ${insigniaSituacion}
          </div>
          <div class="cifras">
            <div class="dato"><span>Monto otorgado</span><strong>${App.moneda(c.monto_aprobado)}</strong></div>
            <div class="dato"><span>Saldo capital</span><strong>${App.moneda(c.saldo_capital)}</strong></div>
            <div class="dato"><span>Cuota mensual</span><strong>${App.moneda(c.cuota_mensual)}</strong></div>
            <div class="dato"><span>Tasa anual</span><strong>${App.porcentaje(c.tasa_interes, 2)}</strong></div>
            <div class="dato"><span>Desembolso</span><strong>${App.fecha(c.fecha_desembolso)}</strong></div>
          </div>
          <div class="avance">
            <div class="flex entre"><span>Avance de pago</span><span>${c.cuotas_pagadas} de ${c.plazo_meses} cuotas</span></div>
            <div class="progreso ${c.estado === 'EN_MORA' ? 'rojo' : ''}"><div style="width:0" data-ancho="${avance}"></div></div>
          </div>
          ${proxima ? `
            <div class="proxima-cuota ${proxima.estado === 'VENCIDA' ? 'vencida' : ''}">
              <div><span class="texto-chico">${proxima.estado === 'VENCIDA' ? `${c.cuotas_vencidas} cuota(s) vencida(s) · desde el` : 'Próxima cuota el'} ${App.fecha(proxima.fecha_vencimiento)}</span><br>
              <b>${App.moneda(proxima.estado === 'VENCIDA' ? c.monto_vencido : proxima.monto)}</b> ${proxima.estado === 'VENCIDA' ? '<span class="texto-chico texto-peligro">(incluye recargo por mora a la fecha)</span>' : ''}</div>
            </div>` : ''}
          <details>
            <summary>Ver cronograma de pagos</summary>
            <div class="tabla-contenedor"><table class="tabla">
              <thead><tr><th class="centro">N°</th><th>Vencimiento</th><th class="num">Capital</th><th class="num">Interés</th><th class="num">Cuota</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
              <tbody>${c.cuotas.map((q) => `<tr><td class="centro">${q.numero}</td><td>${App.fecha(q.fecha_vencimiento)}</td><td class="num">${App.numero(q.capital)}</td><td class="num">${App.numero(q.interes)}</td><td class="num"><strong>${App.numero(q.monto)}</strong></td><td class="num">${App.numero(q.saldo_capital)}</td><td>${App.insignia(q.estado)}${q.recargo_hoy ? `<span class="secundario texto-peligro">Recargo ${App.moneda(q.recargo_hoy)}</span>` : ''}</td></tr>`).join('')}</tbody>
            </table></div>
          </details>
          <div class="acciones">
            <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${c.id_credito}" target="_blank" rel="noopener">Imprimir cronograma</a>
            <a class="boton boton-secundario boton-sm" href="/app/contrato?id=${c.id_credito}" target="_blank" rel="noopener">Ver contrato</a>
          </div>
        </article>`;
    }).join('')
    : `<div class="tarjeta estado-vacio"><strong>No tiene créditos</strong>Cuando una solicitud sea aprobada, su crédito aparecerá aquí.</div>`;
  requestAnimationFrame(() => setTimeout(() => contenedorCreditos.querySelectorAll('[data-ancho]').forEach((b) => { b.style.width = `${b.dataset.ancho}%`; }), 150));

  /* ---------------- Solicitudes ---------------- */
  document.getElementById('lista-solicitudes').innerHTML = solicitudes.length
    ? solicitudes.map((s) => {
      let resultado = '';
      if (s.estado === 'RECHAZADA') resultado = `<div class="aviso peligro mt-2"><div><strong>Solicitud rechazada</strong> el ${App.fecha(s.fecha_resolucion)}.<br>Motivo: ${App.esc(s.observacion_resolucion || '—')}</div></div>`;
      if (s.estado === 'APROBADA' || s.estado === 'DESEMBOLSADA') resultado = `<div class="aviso exito mt-2"><div><strong>¡Solicitud aprobada!</strong> el ${App.fecha(s.fecha_resolucion)}. ${s.estado === 'DESEMBOLSADA' ? 'El crédito ya fue desembolsado.' : 'Pendiente de desembolso.'}</div></div>`;
      if (['REGISTRADA', 'EN_EVALUACION', 'EVALUADA'].includes(s.estado)) resultado = `<div class="aviso info mt-2"><div>Su solicitud está en proceso. Le informaremos el resultado.</div></div>`;
      if (s.estado === 'ANULADA') resultado = `<div class="aviso alerta mt-2"><div>Solicitud anulada.</div></div>`;
      return `
        <article class="tarjeta solicitud-cliente animar">
          <div class="cabecera">
            <div><h3>${App.esc(s.producto)} · ${App.moneda(s.monto_solicitado)}</h3><span class="texto-chico texto-suave">${App.esc(s.codigo)} · ${s.plazo_meses} meses · ${App.esc(s.destino)} · ${App.fecha(s.fecha_solicitud)}</span></div>
            ${App.insignia(s.estado)}
          </div>
          ${App.lineaTiempoSolicitud(s.estado)}
          ${resultado}
        </article>`;
    }).join('')
    : `<div class="tarjeta estado-vacio"><strong>Sin solicitudes</strong>Acérquese a su Oficial de Crédito para solicitar un crédito.</div>`;

  /* ---------------- Pagos ---------------- */
  document.getElementById('tabla-pagos').innerHTML = pagos.length
    ? pagos.map((p) => `
      <tr><td class="mono">${App.esc(p.numero_recibo)}</td><td>${App.fechaHora(p.fecha_pago)}</td><td>${App.esc(p.numero_credito)}</td>
        <td>${App.insignia(p.tipo)}</td><td>${App.esc(p.cuotas_pagadas)}</td><td class="num"><strong>${App.moneda(p.monto_total)}</strong>${p.monto_recargo ? `<span class="secundario">Recargo ${App.moneda(p.monto_recargo)}</span>` : ''}</td>
        <td class="num"><a class="boton boton-secundario boton-sm" href="/app/voucher?id=${p.id_pago}" target="_blank" rel="noopener" title="Ver voucher">Voucher</a></td></tr>`).join('')
    : App.filaVacia(7, 'Aún no registra pagos.');

  /* ---------------- Perfil ---------------- */
  document.getElementById('datos-perfil').innerHTML = [
    ['Nombre completo', `${perfil.nombres} ${perfil.apellidos}`],
    ['Cédula de identidad', `${perfil.ci} ${perfil.extension}`],
    ['Teléfono', perfil.telefono || '—'],
    ['Correo', perfil.correo || '—'],
    ['Dirección', perfil.direccion || '—'],
    ['Ocupación', perfil.ocupacion || '—'],
    ['Cliente desde', App.fecha(perfil.fecha_registro)],
    ['Oficial de crédito', perfil.oficial || '—']
  ].map(([e, v]) => `<div class="dato"><span>${App.esc(e)}</span><strong>${App.esc(v)}</strong></div>`).join('');

  App.activarPestanas(document);
  // Acceso directo por ancla (#solicitudes, #pagos...)
  const ancla = window.location.hash.replace('#', '');
  if (ancla) document.querySelector(`[data-pestana="${ancla}"]`)?.click();
});

/* DOCUMENTO: VOUCHER / COMPROBANTE DE PAGO 
   Uso: /app/voucher?id=ID_PAGO */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciarDocumento();
  const documento = document.getElementById('documento');
  const id = Number(App.parametroUrl('id'));
  const FORMAS = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', DEBITO_CUENTA: 'Débito en cuenta', CHEQUE: 'Cheque' };

  try {
    const { entidad, pago: p, cuotas, cuotas_pendientes: pendientes } = await App.api.get(`/api/pagos/recibo/${id}`);
    document.title = `Voucher ${p.numero_recibo} | CrediManager`;
    documento.innerHTML = `
      <div class="centro">
        <div class="logo-ticket">CM</div>
        <h2>${App.esc(entidad.nombre)}</h2>
        <div class="sub">NIT ${App.esc(entidad.nit)}<br>${App.esc(entidad.direccion)}</div>
        <div class="separador-t"></div>
        <strong>COMPROBANTE DE PAGO</strong><br>
        <span class="sub">${p.tipo === 'CANCELACION_TOTAL' ? 'CANCELACIÓN TOTAL DEL CRÉDITO' : 'PAGO DE CUOTA(S)'}</span>
      </div>
      <div class="separador-t"></div>
      <div class="fila-t"><span>N° recibo</span><b>${App.esc(p.numero_recibo)}</b></div>
      <div class="fila-t"><span>Fecha y hora</span><b>${App.fechaHora(p.fecha_pago)}</b></div>
      <div class="fila-t"><span>Cliente</span><b>${App.esc(p.cliente)}</b></div>
      <div class="fila-t"><span>C.I.</span><b>${App.esc(p.ci)} ${App.esc(p.extension)}</b></div>
      <div class="fila-t"><span>Crédito</span><b>${App.esc(p.numero_credito)}</b></div>
      <div class="separador-t"></div>
      <table>
        <thead><tr><th>Cuota</th><th>Venc.</th><th>Atraso</th><th>Monto</th></tr></thead>
        <tbody>${cuotas.map((q) => `<tr><td>N° ${q.numero}</td><td>${App.fecha(q.fecha_vencimiento)}</td><td>${q.dias_atraso ? `${q.dias_atraso} d` : '—'}</td><td>${App.numero(q.monto)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="separador-t"></div>
      <div class="fila-t"><span>Capital</span><b>${App.moneda(p.monto_capital)}</b></div>
      <div class="fila-t"><span>Interés</span><b>${App.moneda(p.monto_interes)}</b></div>
      <div class="fila-t"><span>Recargo por mora</span><b>${App.moneda(p.monto_recargo)}</b></div>
      ${p.recargo_exonerado ? `<div class="fila-t"><span>Recargo exonerado</span><b>- ${App.moneda(p.recargo_exonerado)}</b></div>` : ''}
      <div class="separador-t"></div>
      <div class="total-t"><span>TOTAL PAGADO</span><span>${App.moneda(p.monto_total)}</span></div>
      <div class="fila-t"><span>Forma de pago</span><b>${App.esc(FORMAS[p.forma_pago] || p.forma_pago)}</b></div>
      <div class="fila-t"><span>Monto recibido</span><b>${App.moneda(p.monto_recibido)}</b></div>
      <div class="fila-t"><span>Cambio</span><b>${App.moneda(p.cambio)}</b></div>
      <div class="separador-t"></div>
      <div class="fila-t"><span>Saldo capital actual</span><b>${App.moneda(p.saldo_capital)}</b></div>
      <div class="fila-t"><span>Cuotas pendientes</span><b>${pendientes} de ${p.plazo_meses}</b></div>
      <div class="fila-t"><span>Estado del crédito</span><b>${App.esc(App.etiquetaEstado(p.estado_credito)).toUpperCase()}</b></div>
      <div class="separador-t"></div>
      <div class="fila-t"><span>Cajero</span><b>${App.esc(p.cajero)}</b></div>
      <div class="codigo-barras"></div>
      <div class="centro sub">${App.esc(p.numero_recibo)}<br>Gracias por su puntualidad.<br>Conserve este comprobante.</div>`;
  } catch (error) {
    documento.innerHTML = `<p class="cargando-doc" style="color:#dc2626">${App.esc(error.message)}</p>`;
  }
});

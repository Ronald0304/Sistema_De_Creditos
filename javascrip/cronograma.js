/* DOCUMENTO: CRONOGRAMA DE PAGOS (CU10 - RF11)
   Uso: /app/cronograma?id=ID  */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciarDocumento();
  const documento = document.getElementById('documento');
  const id = Number(App.parametroUrl('id'));
  const SELLOS = { VIGENTE: ['AL DÍA', 'verde'], EN_MORA: ['EN MORA', 'rojo'], CANCELADO: ['CANCELADO', 'azul'], PENDIENTE_DESEMBOLSO: ['POR DESEMBOLSAR', 'naranja'] };

  try {
    const { entidad, credito: cr, cliente: c, cuotas, totales } = await App.api.get(`/api/creditos/${id}`);
    document.title = `Cronograma ${cr.numero_credito} | CrediManager`;
    const [textoSello, colorSello] = SELLOS[cr.estado] || [cr.estado, 'azul'];
    documento.innerHTML = `
      <header class="membrete">
        <div class="logo"><span>CM</span><div><h2>${App.esc(entidad.nombre)}</h2><p>NIT ${App.esc(entidad.nit)} · ${App.esc(entidad.direccion)}</p></div></div>
        <div class="doc"><h1>Cronograma de pagos</h1><strong>${App.esc(cr.numero_credito)}</strong><p>Contrato ${App.esc(cr.numero_contrato)}</p></div>
      </header>
      <div class="cuadro-datos">
        <div><span>Cliente:</span> <b>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</b></div>
        <div><span>C.I.:</span> <b>${App.esc(c.ci)} ${App.esc(c.extension)}</b></div>
        <div><span>Producto:</span> <b>${App.esc(cr.producto)}</b></div>
        <div><span>Estado:</span> <span class="sello-estado ${colorSello}">${textoSello}</span></div>
        <div><span>Fecha de desembolso:</span> <b>${cr.fecha_desembolso ? App.fecha(cr.fecha_desembolso) : 'Pendiente (fechas referenciales)'}</b></div>
        <div><span>Sistema:</span> <b>Francés · cuota fija</b></div>
      </div>
      <div class="resumen-doc">
        <div>Monto<b>${App.moneda(cr.monto_aprobado)}</b></div>
        <div>Tasa anual<b>${App.numero(cr.tasa_interes, 2)} %</b></div>
        <div>Plazo<b>${cr.plazo_meses} meses</b></div>
        <div>Cuota<b>${App.moneda(cr.cuota_mensual)}</b></div>
      </div>
      <table class="tabla-doc">
        <thead><tr><th>N°</th><th>Vencimiento</th><th>Capital</th><th>Interés</th><th>Cuota</th><th>Saldo capital</th><th>Estado</th><th>Fecha pago</th></tr></thead>
        <tbody>${cuotas.map((q) => `<tr><td>${q.numero}</td><td class="izq">${App.fecha(q.fecha_vencimiento)}</td><td>${App.numero(q.capital)}</td><td>${App.numero(q.interes)}</td><td><b>${App.numero(q.monto)}</b></td><td>${App.numero(q.saldo_capital)}</td><td class="izq"><span class="estado-doc ${q.estado}">${q.estado}</span></td><td class="izq">${q.fecha_pago ? App.fecha(q.fecha_pago) : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">TOTALES</td><td>${App.numero(totales.capital)}</td><td>${App.numero(totales.interes)}</td><td>${App.numero(totales.total)}</td><td colspan="3" class="izq">Pagado: ${App.moneda(totales.pagado)} · Vencido: ${App.moneda(totales.vencido)}</td></tr></tfoot>
      </table>
      <p style="margin-top:12px">Las cuotas deben pagarse hasta su fecha de vencimiento en las cajas de la entidad. El atraso genera un recargo por mora del 0,10 % diario sobre la cuota vencida. Este cronograma forma parte indivisible del contrato ${App.esc(cr.numero_contrato)}.</p>
      <div class="pie-doc"><span>Generado por CrediManager · ${App.esc(App.fechaLarga())}</span><span>${App.esc(entidad.telefono)}</span></div>`;
  } catch (error) {
    documento.innerHTML = `<p class="cargando-doc" style="color:#dc2626">${App.esc(error.message)}</p>`;
  }
});

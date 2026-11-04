/* DOCUMENTO: ADENDA AL CONTRATO POR REPROGRAMACIÓN DE CRÉDITO
   Uso: /app/adenda?id=ID_REPROGRAMACION
   Usa los datos guardados al aprobar (condiciones anteriores y nuevo
   cronograma), de modo que la Adenda siempre se reimprime igual. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciarDocumento();
  const documento = document.getElementById('documento');
  const id = Number(App.parametroUrl('id'));

  try {
    const { entidad, reprogramacion: r, cliente: c, credito: cr, condiciones_anteriores: antes, cronograma_nuevo: plan } =
      await App.api.get(`/api/reprogramaciones/${id}/adenda`);
    document.title = `Adenda ${r.numero_adenda} | CrediManager`;

    const totalInteres = plan.reduce((s, q) => s + q.interes, 0);
    const totalPagar = plan.reduce((s, q) => s + q.monto, 0);
    const fila = (concepto, anterior, nuevo) => `<tr><td class="izq">${concepto}</td><td>${anterior}</td><td><b>${nuevo}</b></td></tr>`;

    documento.innerHTML = `
      <header class="membrete">
        <div class="logo"><span>CM</span><div><h2>${App.esc(entidad.nombre)}</h2><p>NIT ${App.esc(entidad.nit)} · ${App.esc(entidad.direccion)}<br>Telf. ${App.esc(entidad.telefono)}</p></div></div>
        <div class="doc"><h1>Adenda al contrato de préstamo</h1><strong>N° ${App.esc(r.numero_adenda)}</strong><p>Contrato ${App.esc(cr.numero_contrato)} · Crédito ${App.esc(cr.numero_credito)}</p></div>
      </header>

      <p>Conste por la presente <b>adenda de reprogramación</b>, que forma parte indivisible del contrato de préstamo de dinero N° ${App.esc(cr.numero_contrato)}, suscrita entre <b>${App.esc(entidad.nombre)}</b>, en adelante <b>LA ENTIDAD</b>, y <b>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</b>, con C.I. ${App.esc(c.ci)} ${App.esc(c.extension)}, en adelante <b>EL PRESTATARIO</b>, al tenor de las siguientes cláusulas:</p>

      <h3>Primera.- (Antecedentes)</h3>
      <p>LA ENTIDAD otorgó a EL PRESTATARIO un <b>${App.esc(cr.producto)}</b> por <b>${App.moneda(cr.monto_aprobado)}</b>, desembolsado el ${App.fecha(cr.fecha_desembolso)}. A la fecha de la reprogramación, el crédito registraba <b>${antes.cuotas_vencidas} cuota(s) vencida(s)</b> con <b>${antes.dias_mora} días de mora</b>. EL PRESTATARIO solicitó la reprogramación mediante la solicitud ${App.esc(r.codigo)} de fecha ${App.fecha(r.fecha_solicitud)}, invocando el siguiente motivo: <i>"${App.esc(r.motivo)}"</i>.</p>

      <h3>Segunda.- (Objeto)</h3>
      <p>Por la presente adenda, y conforme a la evaluación del Oficial de Crédito ${App.esc(r.oficial || '')} y a la aprobación del Jefe de Crédito ${App.esc(r.jefe || '')} en fecha ${App.fecha(r.fecha_resolucion)}, las partes acuerdan <b>reprogramar el saldo adeudado</b> del crédito, sustituyendo las ${antes.cuotas_pendientes.length} cuota(s) pendiente(s) del cronograma anterior por el nuevo plan de pagos detallado en la cláusula quinta.</p>

      <h3>Tercera.- (Capitalización de intereses)</h3>
      <p>El nuevo capital del crédito resulta de sumar al saldo de capital pendiente los intereses corrientes vencidos y los intereses moratorios devengados a la fecha de aprobación:</p>
      <table class="tabla-doc">
        <thead><tr><th class="izq">Concepto</th><th>Importe (Bs)</th></tr></thead>
        <tbody>
          <tr><td class="izq">Saldo de capital pendiente</td><td>${App.numero(r.saldo_capital_anterior)}</td></tr>
          <tr><td class="izq">(+) Intereses corrientes vencidos</td><td>${App.numero(r.interes_vencido)}</td></tr>
          <tr><td class="izq">(+) Intereses moratorios (recargos por mora)</td><td>${App.numero(r.interes_moratorio)}</td></tr>
        </tbody>
        <tfoot><tr><td class="izq">CAPITAL REPROGRAMADO</td><td>${App.numero(r.capital_reprogramado)}</td></tr></tfoot>
      </table>

      <h3>Cuarta.- (Nuevas condiciones financieras)</h3>
      <table class="tabla-doc">
        <thead><tr><th class="izq">Condición</th><th>Anterior</th><th>Nueva</th></tr></thead>
        <tbody>
          ${fila('Situación del crédito', antes.estado === 'EN_MORA' ? 'En mora' : 'Vigente', 'Al día (reprogramado)')}
          ${fila('Tasa de interés nominal anual (fija)', `${App.numero(antes.tasa_interes, 2)} %`, `${App.numero(r.nueva_tasa, 2)} %`)}
          ${fila('Cuota mensual', App.moneda(antes.cuota_mensual), App.moneda(r.nueva_cuota))}
          ${fila('Cuotas por pagar', antes.cuotas_pendientes.length, plan.length)}
          ${fila('Saldo adeudado', App.moneda(antes.saldo_capital), App.moneda(r.capital_reprogramado))}
          ${fila('Plazo total del crédito (cuotas)', antes.plazo_meses, antes.cuotas_pagadas + plan.length)}
          ${fila('Primer vencimiento', App.fecha(antes.cuotas_pendientes[0]?.fecha_vencimiento), App.fecha(plan[0]?.fecha_vencimiento))}
          ${fila('Último vencimiento', App.fecha(antes.cuotas_pendientes[antes.cuotas_pendientes.length - 1]?.fecha_vencimiento), App.fecha(plan[plan.length - 1]?.fecha_vencimiento))}
        </tbody>
      </table>
      <p>Sistema de amortización: <b>francés (cuota fija)</b>. Las ${antes.cuotas_pagadas} cuota(s) ya pagadas conservan su validez y sus comprobantes.</p>

      <h3>Quinta.- (Nuevo cronograma de pagos)</h3>
      <table class="tabla-doc">
        <thead><tr><th>N°</th><th>Vencimiento</th><th>Capital</th><th>Interés</th><th>Cuota</th><th>Saldo capital</th></tr></thead>
        <tbody>${plan.map((q) => `<tr><td>${q.numero}</td><td class="izq">${App.fecha(q.fecha_vencimiento)}</td><td>${App.numero(q.capital)}</td><td>${App.numero(q.interes)}</td><td><b>${App.numero(q.monto)}</b></td><td>${App.numero(q.saldo_capital)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="2">TOTALES</td><td>${App.numero(r.capital_reprogramado)}</td><td>${App.numero(totalInteres)}</td><td>${App.numero(totalPagar)}</td><td></td></tr></tfoot>
      </table>

      <h3>Sexta.- (Subsistencia del contrato y garantías)</h3>
      <p>Todas las demás cláusulas del contrato N° ${App.esc(cr.numero_contrato)} que no hayan sido modificadas por la presente adenda mantienen plena vigencia, incluidas las garantías constituidas y el régimen de mora (recargo del 0,10 % diario sobre la cuota vencida). El incumplimiento del nuevo cronograma dará lugar a las acciones previstas en el contrato original.</p>

      <h3>Séptima.- (Conformidad)</h3>
      <p>Ambas partes declaran su plena conformidad con la presente adenda, firmando en la ciudad de ${App.esc(entidad.ciudad)}, en fecha ${App.esc(App.fechaLarga(r.fecha_resolucion))}.${r.observacion_resolucion ? ` Observación de la resolución: ${App.esc(r.observacion_resolucion)}` : ''}</p>

      <div class="firmas">
        <div class="firma"><b>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</b>C.I. ${App.esc(c.ci)} ${App.esc(c.extension)}<br>EL PRESTATARIO</div>
        <div class="firma"><b>${App.esc(r.jefe || 'Jefe de Crédito')}</b>Jefe de Crédito<br>p. ${App.esc(entidad.nombre)}</div>
      </div>
      <div class="pie-doc"><span>Adenda ${App.esc(r.numero_adenda)} · generada por CrediManager · ${App.esc(App.fechaLarga())}</span><span>Oficial: ${App.esc(r.oficial || '—')}</span></div>`;
  } catch (error) {
    documento.innerHTML = `<p class="cargando-doc" style="color:#dc2626">${App.esc(error.message)}</p>`;
  }
});

/* DOCUMENTO: CONTRATO DE CRÉDITO (CU09 - RF10)
   Se genera con los datos del crédito aprobado. Uso: /app/contrato?id=ID */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciarDocumento();
  const documento = document.getElementById('documento');
  const id = Number(App.parametroUrl('id'));

  /** Convierte un número a letras (para montos en contratos) */
  function numeroALetras(valor) {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    const decenas = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const menorMil = (n) => {
      if (n === 0) return '';
      if (n === 100) return 'cien';
      const c = Math.floor(n / 100); const r = n % 100;
      let texto = centenas[c];
      if (r) texto += `${texto ? ' ' : ''}${r < 30 ? unidades[r] : decenas[Math.floor(r / 10)] + (r % 10 ? ` y ${unidades[r % 10]}` : '')}`;
      return texto;
    };
    const entero = Math.floor(valor);
    const centavos = Math.round((valor - entero) * 100);
    const millones = Math.floor(entero / 1e6);
    const miles = Math.floor((entero % 1e6) / 1000);
    const resto = entero % 1000;
    const partes = [];
    if (millones) partes.push(millones === 1 ? 'un millón' : `${menorMil(millones)} millones`);
    if (miles) partes.push(miles === 1 ? 'mil' : `${menorMil(miles)} mil`);
    if (resto) partes.push(menorMil(resto));
    const texto = (partes.join(' ') || 'cero').replace(/uno mil/g, 'un mil').replace(/uno millones/g, 'un millones');
    return `${texto.charAt(0).toUpperCase()}${texto.slice(1)} ${String(centavos).padStart(2, '0')}/100 Bolivianos`;
  }

  try {
    const { entidad, credito: cr, cliente: c, cuotas, garantias, totales } = await App.api.get(`/api/creditos/${id}`);
    document.title = `Contrato ${cr.numero_contrato} | CrediManager`;
    const fechaContrato = cr.fecha_desembolso || cr.fecha_aprobacion;
    const ultima = cuotas[cuotas.length - 1];
    documento.innerHTML = `
      <header class="membrete">
        <div class="logo"><span>CM</span><div><h2>${App.esc(entidad.nombre)}</h2><p>NIT ${App.esc(entidad.nit)} · ${App.esc(entidad.direccion)}<br>Telf. ${App.esc(entidad.telefono)}</p></div></div>
        <div class="doc"><h1>Contrato de préstamo de dinero</h1><strong>N° ${App.esc(cr.numero_contrato)}</strong><p>Crédito ${App.esc(cr.numero_credito)}</p></div>
      </header>

      <p>Conste por el presente documento privado de préstamo de dinero, que con el solo reconocimiento de firmas podrá ser elevado a instrumento público, suscrito al tenor de las siguientes cláusulas:</p>

      <h3>Primera.- (Partes)</h3>
      <p>Intervienen en la celebración del presente contrato: <b>${App.esc(entidad.nombre)}</b>, entidad de intermediación financiera, en adelante <b>LA ENTIDAD</b>; y por otra parte:</p>
      <div class="cuadro-datos">
        <div><span>Prestatario:</span> <b>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</b></div>
        <div><span>C.I.:</span> <b>${App.esc(c.ci)} ${App.esc(c.extension)}</b></div>
        <div><span>Domicilio:</span> <b>${App.esc(c.direccion || '—')}</b></div>
        <div><span>Teléfono:</span> <b>${App.esc(c.telefono || '—')}</b></div>
        <div><span>Ocupación:</span> <b>${App.esc(c.ocupacion || '—')}</b></div>
        <div><span>Correo:</span> <b>${App.esc(c.correo || '—')}</b></div>
      </div>
      <p>mayor de edad y hábil por derecho, en adelante <b>EL PRESTATARIO</b>.</p>

      <h3>Segunda.- (Objeto y monto)</h3>
      <p>LA ENTIDAD otorga a favor de EL PRESTATARIO un <b>${App.esc(cr.producto)}</b> por la suma de <b>${App.moneda(cr.monto_aprobado)} (${App.esc(numeroALetras(cr.monto_aprobado))})</b>, destinado exclusivamente a: <i>${App.esc(cr.destino)}</i>, conforme a la solicitud ${App.esc(cr.codigo_solicitud)} aprobada por el Jefe de Crédito ${App.esc(cr.jefe || '')} en fecha ${App.fecha(cr.fecha_aprobacion)}.</p>

      <h3>Tercera.- (Condiciones financieras)</h3>
      <div class="cuadro-datos">
        <div><span>Tasa de interés nominal anual (fija):</span> <b>${App.numero(cr.tasa_interes, 2)} %</b></div>
        <div><span>Plazo:</span> <b>${cr.plazo_meses} meses</b></div>
        <div><span>Sistema de amortización:</span> <b>Francés (cuota fija)</b></div>
        <div><span>Cuota mensual:</span> <b>${App.moneda(cr.cuota_mensual)}</b></div>
        <div><span>Total intereses:</span> <b>${App.moneda(totales.interes)}</b></div>
        <div><span>Total a pagar:</span> <b>${App.moneda(totales.total)}</b></div>
        <div><span>Primer vencimiento:</span> <b>${App.fecha(cuotas[0]?.fecha_vencimiento)}</b></div>
        <div><span>Último vencimiento:</span> <b>${App.fecha(ultima?.fecha_vencimiento)}</b></div>
      </div>

      <h3>Cuarta.- (Forma de pago)</h3>
      <p>EL PRESTATARIO se obliga a pagar el préstamo en ${cr.plazo_meses} cuotas mensuales y consecutivas, de acuerdo al cronograma de pagos que forma parte indivisible del presente contrato. Los pagos se efectuarán en las ventanillas de caja de LA ENTIDAD, que emitirá el comprobante (voucher) correspondiente.</p>

      <h3>Quinta.- (Mora y recargos)</h3>
      <p>El incumplimiento en el pago de cualquier cuota en la fecha establecida constituirá automáticamente en mora a EL PRESTATARIO, sin necesidad de requerimiento judicial o extrajudicial alguno, generándose un recargo por mora del <b>0,10 % diario</b> sobre el monto de la cuota vencida (con un tope del 25 % de la cuota), además de su reporte a la central de riesgo crediticio.</p>

      <h3>Sexta.- (Garantías)</h3>
      <p>En respaldo del cumplimiento de las obligaciones asumidas, EL PRESTATARIO constituye las siguientes garantías:</p>
      ${garantias.length ? `<table class="tabla-doc"><thead><tr><th>Tipo</th><th>Descripción</th><th>Documento</th><th>Valor (Bs)</th></tr></thead><tbody>
        ${garantias.map((g) => `<tr><td class="izq">${App.esc(g.tipo_nombre)}</td><td class="izq" style="text-align:left">${App.esc(g.descripcion)}</td><td class="izq">${App.esc(g.documento_respaldo || '—')}</td><td>${App.numero(g.valor_comercial)}</td></tr>`).join('')}
      </tbody></table>` : '<p><i>Garantías pendientes de registro antes del desembolso.</i></p>'}

      <h3>Séptima.- (Pago anticipado)</h3>
      <p>EL PRESTATARIO podrá realizar la cancelación total anticipada del crédito en cualquier momento, pagando el capital pendiente, los intereses devengados del periodo en curso y los recargos que correspondan, sin penalidad alguna. Los intereses futuros no devengados serán condonados.</p>

      <h3>Octava.- (Desembolso)</h3>
      <p>${cr.fecha_desembolso ? `El desembolso fue efectuado el ${App.fechaHora(cr.fecha_desembolso)} mediante <b>${App.esc({ ABONO_CUENTA: 'abono en cuenta', CHEQUE: 'cheque', EFECTIVO: 'efectivo' }[cr.medio_desembolso] || '')}</b>${cr.cuenta_destino ? ` N° ${App.esc(cr.cuenta_destino)}` : ''}, operación Core Bancario ${App.esc(cr.codigo_transaccion || '')}.` : 'El desembolso se efectuará una vez suscrito el presente contrato y constituidas las garantías.'}</p>

      <h3>Novena.- (Conformidad)</h3>
      <p>Ambas partes declaran su plena conformidad con todas y cada una de las cláusulas del presente contrato, firmando en la ciudad de ${App.esc(entidad.ciudad)}, en fecha ${App.esc(App.fechaLarga(fechaContrato))}.</p>

      <div class="firmas">
        <div class="firma"><b>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</b>C.I. ${App.esc(c.ci)} ${App.esc(c.extension)}<br>EL PRESTATARIO</div>
        <div class="firma"><b>${App.esc(cr.jefe || 'Jefe de Crédito')}</b>Jefe de Crédito<br>p. ${App.esc(entidad.nombre)}</div>
      </div>
      <div class="pie-doc"><span>Documento generado por CrediManager · ${App.esc(App.fechaLarga())}</span><span>Oficial: ${App.esc(cr.oficial)}</span></div>`;
  } catch (error) {
    documento.innerHTML = `<p class="cargando-doc" style="color:#dc2626">${App.esc(error.message)}</p>`;
  }
});

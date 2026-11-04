/* GERENTE - TABLERO DE REPORTES EJECUTIVOS  (CU14 - RF15)
   ----------------------------------------------------------------------------
   Gráficos dibujados con SVG propio (sin librerías externas):
     - Barras agrupadas: desembolsos vs. recaudación por mes (con tooltip)
     - Dona: cartera vigente por producto
     - Barras de antigüedad de la mora (escala secuencial de un solo tono)
     - Embudo de solicitudes por estado
   Cada gráfico tiene su leyenda/etiquetas y una tabla de datos equivalente.*/
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const SERIES = ['#2563eb', '#14b8a6', '#c9a227', '#7c3aed', '#e11d48']; // orden fijo (validado)
  const SVG = 'http://www.w3.org/2000/svg';
  const selectorAnio = document.getElementById('selector-anio');
  const tooltip = document.getElementById('tooltip-grafico');

  /** Formato compacto para ejes: 125000 -> "125 mil" */
  const compacto = (v) => (v >= 1e6 ? `${App.numero(v / 1e6, 1)} M` : v >= 1e3 ? `${App.numero(v / 1e3, 0)} mil` : App.numero(v, 0));

  /* ---------------- Tooltip ---------------- */
  function mostrarTooltip(evento, html) {
    tooltip.innerHTML = html;
    tooltip.classList.remove('oculto');
    const x = Math.min(evento.clientX + 14, window.innerWidth - tooltip.offsetWidth - 10);
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${evento.clientY + 14}px`;
  }
  const ocultarTooltip = () => tooltip.classList.add('oculto');

  /** Trayectoria de una barra con esquinas superiores redondeadas (4px) apoyada en la base */
  function trayectoBarra(x, y, ancho, alto, radio = 4) {
    if (alto <= 0) return '';
    const r = Math.min(radio, ancho / 2, alto);
    return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`;
  }

  /* ---------------- Barras agrupadas mensuales ---------------- */
  function graficoMensual(serie) {
    const contenedor = document.getElementById('grafico-mensual');
    const ancho = Math.max(contenedor.clientWidth, 480);
    const alto = 300;
    const margen = { arriba: 16, derecha: 8, abajo: 28, izquierda: 64 };
    const anchoUtil = ancho - margen.izquierda - margen.derecha;
    const altoUtil = alto - margen.arriba - margen.abajo;
    const maximo = Math.max(1, ...serie.map((m) => Math.max(m.desembolsos, m.recaudacion)));
    // Escala "redonda" para la rejilla
    const paso = Math.pow(10, Math.floor(Math.log10(maximo)));
    const tope = Math.ceil(maximo / paso) * paso;
    const y = (v) => margen.arriba + altoUtil - (v / tope) * altoUtil;
    const anchoGrupo = anchoUtil / 12;
    const anchoBarra = Math.min(18, (anchoGrupo - 10) / 2);

    let html = `<svg viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Desembolsos y recaudación por mes"><g class="rejilla eje">`;
    for (let i = 0; i <= 4; i += 1) {
      const valor = (tope / 4) * i;
      html += `<line x1="${margen.izquierda}" x2="${ancho - margen.derecha}" y1="${y(valor)}" y2="${y(valor)}"/><text x="${margen.izquierda - 8}" y="${y(valor) + 4}" text-anchor="end">${compacto(valor)}</text>`;
    }
    html += '</g>';
    serie.forEach((m, i) => {
      const x0 = margen.izquierda + i * anchoGrupo + (anchoGrupo - (anchoBarra * 2 + 2)) / 2;
      const altoD = altoUtil * (m.desembolsos / tope);
      const altoR = altoUtil * (m.recaudacion / tope);
      html += `<g class="grupo" data-mes="${i}">
        <rect class="zona" x="${margen.izquierda + i * anchoGrupo}" y="${margen.arriba}" width="${anchoGrupo}" height="${altoUtil}"/>
        <path class="barra" fill="${SERIES[0]}" d="${trayectoBarra(x0, y(m.desembolsos), anchoBarra, altoD)}"/>
        <path class="barra" fill="${SERIES[1]}" d="${trayectoBarra(x0 + anchoBarra + 2, y(m.recaudacion), anchoBarra, altoR)}"/>
        <text class="eje" x="${margen.izquierda + i * anchoGrupo + anchoGrupo / 2}" y="${alto - 8}" text-anchor="middle" style="font-size:11px;fill:var(--texto-suave)">${MESES[i]}</text>
      </g>`;
    });
    html += `<line x1="${margen.izquierda}" x2="${ancho - margen.derecha}" y1="${y(0)}" y2="${y(0)}" stroke="#cdd5e1"/></svg>`;
    contenedor.innerHTML = html;

    contenedor.querySelectorAll('.grupo').forEach((grupo) => {
      const m = serie[Number(grupo.dataset.mes)];
      grupo.addEventListener('mousemove', (e) => mostrarTooltip(e, `<b>${MESES[m.mes - 1]}</b>
        <div><span><i style="background:${SERIES[0]}"></i>Desembolsos (${m.cantidad_desembolsos})</span><span>${App.moneda(m.desembolsos)}</span></div>
        <div><span><i style="background:${SERIES[1]}"></i>Recaudación (${m.cantidad_pagos})</span><span>${App.moneda(m.recaudacion)}</span></div>`));
      grupo.addEventListener('mouseleave', ocultarTooltip);
    });

    document.getElementById('tabla-mensual').innerHTML = serie.map((m) => `<tr><td>${MESES[m.mes - 1]}</td><td class="num">${App.moneda(m.desembolsos)}</td><td class="num">${m.cantidad_desembolsos}</td><td class="num">${App.moneda(m.recaudacion)}</td><td class="num">${m.cantidad_pagos}</td></tr>`).join('');
  }

  /* ---------------- Dona de cartera por producto ---------------- */
  function graficoProductos(productos) {
    const contenedor = document.getElementById('grafico-productos');
    const total = productos.reduce((s, p) => s + p.saldo, 0);
    if (!total) { contenedor.innerHTML = `<div class="estado-vacio"><strong>Sin cartera vigente</strong></div>`; return; }
    const radio = 80; const grosor = 26; const centro = 100;
    const circunferencia = 2 * Math.PI * radio;
    let acumulado = 0;
    const segmentos = productos.map((p, i) => {
      const fraccion = p.saldo / total;
      const largo = Math.max(0, fraccion * circunferencia - (productos.length > 1 ? 2 : 0)); // 2px de separación
      const segmento = `<circle class="segmento" data-i="${i}" r="${radio}" cx="${centro}" cy="${centro}" fill="none" stroke="${SERIES[i % SERIES.length]}" stroke-width="${grosor}"
        stroke-dasharray="${largo} ${circunferencia - largo}" stroke-dashoffset="${-acumulado * circunferencia}" transform="rotate(-90 ${centro} ${centro})"/>`;
      acumulado += fraccion;
      return segmento;
    }).join('');
    contenedor.innerHTML = `
      <svg viewBox="0 0 200 200" role="img" aria-label="Cartera por producto">
        ${segmentos}
        <text x="100" y="94" text-anchor="middle" style="font-size:11px">Cartera vigente</text>
        <text x="100" y="116" text-anchor="middle" style="font-size:17px;font-weight:800;fill:var(--texto)">${compacto(total)}</text>
      </svg>
      <div class="lista-leyenda">${productos.map((p, i) => `<div><i style="background:${SERIES[i % SERIES.length]}"></i><span>${App.esc(p.producto)} (${p.creditos})</span><b>${App.moneda(p.saldo)}</b><span class="pct">${App.porcentaje((p.saldo / total) * 100)}</span></div>`).join('')}</div>`;
    contenedor.querySelectorAll('.segmento').forEach((s) => {
      const p = productos[Number(s.dataset.i)];
      s.addEventListener('mousemove', (e) => mostrarTooltip(e, `<b>${App.esc(p.producto)}</b><div><span>Saldo</span><span>${App.moneda(p.saldo)}</span></div><div><span>En mora</span><span>${App.moneda(p.saldo_mora)}</span></div><div><span>Créditos</span><span>${p.creditos}</span></div>`));
      s.addEventListener('mouseleave', ocultarTooltip);
    });
  }

  /* ---------------- Antigüedad de la mora (escala secuencial) ---------------- */
  function graficoAging(a) {
    const tramos = [
      ['1 - 30 días', a.r1_30, a.c1_30, '#fca5a5'],
      ['31 - 60 días', a.r31_60, a.c31_60, '#f87171'],
      ['61 - 90 días', a.r61_90, a.c61_90, '#dc2626'],
      ['Más de 90', a.r90_mas, a.c90_mas, '#991b1b']
    ];
    const maximo = Math.max(1, ...tramos.map((t) => t[1]));
    const contenedor = document.getElementById('grafico-aging');
    contenedor.innerHTML = tramos.map(([nombre, monto, cantidad, color]) => `
      <div class="tramo"><span>${nombre}</span><div class="pista"><div class="relleno" style="background:${color}" data-ancho="${(monto / maximo) * 100}"></div></div><b>${App.moneda(monto)}<small>${cantidad} crédito(s)</small></b></div>`).join('');
    requestAnimationFrame(() => contenedor.querySelectorAll('.relleno').forEach((r) => { r.style.width = `${r.dataset.ancho}%`; }));
  }

  /* ---------------- Embudo de solicitudes ---------------- */
  function embudo(estados) {
    const orden = ['REGISTRADA', 'EN_EVALUACION', 'EVALUADA', 'APROBADA', 'DESEMBOLSADA', 'RECHAZADA', 'ANULADA'];
    const mapa = Object.fromEntries(estados.map((e) => [e.estado, e.total]));
    const maximo = Math.max(1, ...estados.map((e) => e.total));
    const contenedor = document.getElementById('embudo-solicitudes');
    contenedor.innerHTML = orden.map((estado) => `
      <div class="etapa-embudo"><span>${App.esc(App.etiquetaEstado(estado))}</span><div class="pista"><div class="relleno" data-ancho="${((mapa[estado] || 0) / maximo) * 100}"></div></div><b>${mapa[estado] || 0}</b></div>`).join('');
    requestAnimationFrame(() => contenedor.querySelectorAll('.relleno').forEach((r) => { r.style.width = `${r.dataset.ancho}%`; }));
  }

  /* ---------------- Carga principal ---------------- */
  async function cargar() {
    try {
      const r = await App.api.get(`/api/reportes/ejecutivo?anio=${encodeURIComponent(selectorAnio.value || '')}`);
      if (!selectorAnio.options.length) {
        selectorAnio.innerHTML = r.anios_disponibles.map((a) => `<option value="${a}">${a}</option>`).join('');
        selectorAnio.value = r.anio;
      }
      const ind = r.indicadores;
      App.animarNumero(document.getElementById('kpi-cartera'), ind.cartera_total, App.moneda);
      document.getElementById('kpi-cartera-nota').textContent = `${ind.creditos_vigentes + ind.creditos_mora} créditos activos`;
      App.animarNumero(document.getElementById('kpi-mora'), ind.cartera_mora, App.moneda);
      document.getElementById('kpi-mora-nota').textContent = `${ind.creditos_mora} crédito(s) con cuotas vencidas`;
      App.animarNumero(document.getElementById('kpi-desembolsado'), ind.desembolsado_anio, App.moneda);
      document.getElementById('kpi-desembolsado-nota').textContent = `Histórico: ${App.moneda(ind.total_desembolsado)}`;
      App.animarNumero(document.getElementById('kpi-recaudacion'), ind.recaudacion.mes, App.moneda);
      document.getElementById('kpi-recaudacion-nota').textContent = `Hoy: ${App.moneda(ind.recaudacion.hoy)} (${ind.recaudacion.pagos_hoy} pagos)`;

      document.getElementById('indice-mora').textContent = App.porcentaje(ind.indice_mora, 2);
      const estadoMora = ind.indice_mora <= 3 ? ['texto-exito', 'Dentro de la meta'] : ind.indice_mora <= 6 ? ['texto-alerta', 'Requiere atención'] : ['texto-peligro', 'Nivel crítico'];
      const textoMora = document.getElementById('indice-mora-texto');
      textoMora.className = `texto-chico ${estadoMora[0]}`;
      textoMora.textContent = estadoMora[1];
      setTimeout(() => { document.getElementById('indice-mora-barra').style.width = `${Math.min(100, ind.indice_mora * 10)}%`; }, 100);
      document.getElementById('mini-cifras').innerHTML = `
        <div><span>Clientes</span><b>${ind.clientes.total}</b></div>
        <div><span>Intereses cobrados (año)</span><b>${App.moneda(ind.recaudacion.intereses_anio)}</b></div>
        <div><span>Recargos (año)</span><b>${App.moneda(ind.recaudacion.recargos_anio)}</b></div>
        <div><span>Cancelados</span><b>${ind.creditos_cancelados}</b></div>`;

      graficoMensual(r.serie_mensual);
      graficoProductos(r.por_producto);
      graficoAging(r.aging);
      embudo(r.solicitudes_estado);

      document.getElementById('tabla-morosos').innerHTML = r.top_morosos.length
        ? r.top_morosos.map((m) => `<tr><td><strong>${App.esc(m.numero_credito)}</strong></td><td>${App.esc(m.cliente)}<span class="secundario">CI ${App.esc(m.ci)}</span></td><td class="centro">${m.cuotas_vencidas}</td><td class="centro"><span class="insignia ${m.dias_mora > 60 ? 'rojo' : 'naranja'}">${m.dias_mora} días</span></td><td class="num">${App.moneda(m.monto_vencido)}</td><td class="num">${App.moneda(m.saldo_capital)}</td></tr>`).join('')
        : App.filaVacia(6, 'No hay créditos en mora.');

      const { oficiales, analistas, cajeros } = r.rendimiento;
      document.getElementById('tabla-oficiales').innerHTML = oficiales.map((o) => {
        const resueltas = o.aprobadas + o.rechazadas;
        return `<tr><td><strong>${App.esc(o.nombre)}</strong></td><td class="num">${o.clientes}</td><td class="num">${o.solicitudes}</td><td class="num">${o.aprobadas}</td><td class="num">${o.rechazadas}</td><td class="num">${resueltas ? App.porcentaje((o.aprobadas / resueltas) * 100) : '—'}</td><td class="num"><strong>${App.moneda(o.monto_colocado)}</strong></td><td class="num ${o.cartera_mora ? 'texto-peligro' : ''}">${App.moneda(o.cartera_mora)}</td></tr>`;
      }).join('') || App.filaVacia(8, 'Sin oficiales.');
      document.getElementById('tabla-analistas').innerHTML = analistas.map((a) => `<tr><td><strong>${App.esc(a.nombre)}</strong></td><td class="num">${a.evaluaciones}</td><td class="num">${a.favorables || 0}</td><td class="num">${a.no_favorables || 0}</td></tr>`).join('') || App.filaVacia(4, 'Sin analistas.');
      document.getElementById('tabla-cajeros').innerHTML = cajeros.map((c) => `<tr><td><strong>${App.esc(c.nombre)}</strong></td><td class="num">${c.pagos}</td><td class="num">${App.moneda(c.recaudado_mes)}</td><td class="num">${App.moneda(c.recaudado)}</td></tr>`).join('') || App.filaVacia(4, 'Sin cajeros.');
    } catch (error) {
      App.notificar('error', error.message);
    }
  }

  /* ---------------- Recaudación diaria ---------------- */
  const desde = document.getElementById('recaudacion-desde');
  const hasta = document.getElementById('recaudacion-hasta');
  async function cargarRecaudacion() {
    const tabla = document.getElementById('tabla-recaudacion');
    tabla.innerHTML = App.filaCargando(6);
    const parametros = new URLSearchParams();
    if (desde.value) parametros.set('desde', desde.value);
    if (hasta.value) parametros.set('hasta', hasta.value);
    try {
      const filas = await App.api.get(`/api/reportes/recaudacion?${parametros}`);
      const total = filas.reduce((s, f) => s + f.total, 0);
      tabla.innerHTML = filas.length
        ? filas.map((f) => `<tr><td>${App.fecha(f.fecha)}</td><td class="num">${f.pagos}</td><td class="num">${App.moneda(f.capital)}</td><td class="num">${App.moneda(f.interes)}</td><td class="num">${App.moneda(f.recargo)}</td><td class="num"><strong>${App.moneda(f.total)}</strong></td></tr>`).join('') +
          `<tr><td colspan="5"><strong>Total del periodo</strong></td><td class="num"><strong>${App.moneda(total)}</strong></td></tr>`
        : App.filaVacia(6, 'Sin recaudación en el periodo (por defecto: últimos 30 días).');
    } catch (error) { tabla.innerHTML = App.filaVacia(6, error.message); }
  }

  selectorAnio.addEventListener('change', cargar);
  desde.addEventListener('change', cargarRecaudacion);
  hasta.addEventListener('change', cargarRecaudacion);
  document.getElementById('boton-imprimir').addEventListener('click', () => window.print());
  let ultimoAncho = window.innerWidth;
  window.addEventListener('resize', App.retrasar(() => { if (Math.abs(window.innerWidth - ultimoAncho) > 40) { ultimoAncho = window.innerWidth; cargar(); } }, 300));

  await cargar();
  cargarRecaudacion();
});

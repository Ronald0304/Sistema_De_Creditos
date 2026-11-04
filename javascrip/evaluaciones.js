/* ANALISTA DE CRÉDITO - BANDEJA DE EVALUACIÓN  (CU03 - CU04 - CU05) */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const tablaBandeja = document.getElementById('tabla-bandeja');
  const tablaRealizadas = document.getElementById('tabla-realizadas');

  async function cargarBandeja() {
    tablaBandeja.innerHTML = App.filaCargando(8);
    try {
      const { indicadores, solicitudes } = await App.api.get('/api/evaluaciones/bandeja');
      App.animarNumero(document.getElementById('kpi-pendientes'), indicadores.pendientes);
      App.animarNumero(document.getElementById('kpi-hoy'), indicadores.evaluadas_hoy);
      App.animarNumero(document.getElementById('kpi-favorables'), indicadores.favorables);
      App.animarNumero(document.getElementById('kpi-no-favorables'), indicadores.no_favorables);
      tablaBandeja.innerHTML = solicitudes.length
        ? solicitudes.map((s) => `
          <tr>
            <td><strong>${App.esc(s.codigo)}</strong><span class="secundario">Oficial: ${App.esc(s.oficial)}</span></td>
            <td>${App.esc(s.cliente)}<span class="secundario">CI ${App.esc(s.ci)} · Ingresos ${App.moneda(s.ingresos_mensuales)}</span></td>
            <td>${App.esc(s.tipo_credito)}<span class="secundario">${App.esc(s.destino)}</span></td>
            <td class="num"><strong>${App.moneda(s.monto_solicitado)}</strong><span class="secundario">${s.plazo_meses} meses · ${App.numero(s.tasa_interes, 1)}%</span></td>
            <td class="centro">${s.garantias ? `<strong>${s.garantias}</strong>` : '<span class="insignia naranja">0</span>'}</td>
            <td>${s.calificacion ? `<span class="calificacion-mini ${App.esc(s.calificacion)}">${App.esc(s.calificacion)}</span><span class="secundario">${App.fecha(s.fecha_consulta)}</span>` : '<span class="insignia gris">Sin consultar</span>'}</td>
            <td>${s.dias_espera > 2 ? `<span class="insignia rojo">${s.dias_espera} días</span>` : `<span class="insignia gris">${s.dias_espera === 0 ? 'Hoy' : `${s.dias_espera} día(s)`}</span>`}</td>
            <td class="num"><a class="boton boton-primario boton-sm" href="/app/evaluar?id=${s.id_solicitud}">Evaluar</a></td>
          </tr>`).join('')
        : App.filaVacia(8, '¡Excelente! No hay solicitudes pendientes de evaluación.');
    } catch (error) {
      tablaBandeja.innerHTML = App.filaVacia(8, error.message);
    }
  }

  async function cargarRealizadas() {
    tablaRealizadas.innerHTML = App.filaCargando(8);
    try {
      const filas = await App.api.get('/api/evaluaciones/realizadas');
      tablaRealizadas.innerHTML = filas.length
        ? filas.map((e) => `
          <tr>
            <td>${App.fechaHora(e.fecha_evaluacion)}</td>
            <td><strong>${App.esc(e.codigo)}</strong></td>
            <td>${App.esc(e.cliente)}<span class="secundario">CI ${App.esc(e.ci)}</span></td>
            <td class="num">${App.moneda(e.monto_solicitado)}</td>
            <td class="num">${App.moneda(e.capacidad_pago)}<span class="secundario">Cuota/cap.: ${App.porcentaje(e.relacion_cuota_ingreso)}</span></td>
            <td>${App.insignia(e.nivel_riesgo)}</td>
            <td>${App.insignia(e.dictamen)}</td>
            <td>${App.insignia(e.estado)}</td>
          </tr>`).join('')
        : App.filaVacia(8, 'Aún no emitió evaluaciones.');
    } catch (error) {
      tablaRealizadas.innerHTML = App.filaVacia(8, error.message);
    }
  }

  App.activarPestanas(document, (panel) => { if (panel === 'realizadas') cargarRealizadas(); });
  document.getElementById('boton-refrescar').addEventListener('click', () => { cargarBandeja(); cargarRealizadas(); });
  cargarBandeja();
});

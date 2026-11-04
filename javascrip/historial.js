/* HISTORIAL DE DECISIONES DE CRÉDITO (Jefe de Crédito / Gerente)*/
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const tabla = document.getElementById('tabla-historial');
  const filtros = ['buscar', 'resultado', 'desde', 'hasta'].reduce((o, f) => ({ ...o, [f]: document.getElementById(`filtro-${f}`) }), {});

  async function cargar() {
    tabla.innerHTML = App.filaCargando(8);
    const parametros = new URLSearchParams();
    Object.entries(filtros).forEach(([clave, campo]) => { if (campo.value.trim()) parametros.set(clave, campo.value.trim()); });
    try {
      const { resumen, decisiones } = await App.api.get(`/api/aprobaciones/historial?${parametros}`);
      const total = resumen.aprobadas + resumen.rechazadas;
      App.animarNumero(document.getElementById('kpi-aprobadas'), resumen.aprobadas);
      App.animarNumero(document.getElementById('kpi-rechazadas'), resumen.rechazadas);
      document.getElementById('kpi-tasa').textContent = total ? App.porcentaje((resumen.aprobadas / total) * 100) : '—';
      App.animarNumero(document.getElementById('kpi-monto'), resumen.monto_aprobado, App.moneda);

      tabla.innerHTML = decisiones.length
        ? decisiones.map((d) => `
          <tr>
            <td>${App.fechaHora(d.fecha_resolucion)}<span class="secundario">${App.esc(d.jefe || '')}</span></td>
            <td><a href="#" data-ver="${d.id_solicitud}"><strong>${App.esc(d.codigo)}</strong></a><span class="secundario">${App.esc(d.producto)}</span></td>
            <td>${App.esc(d.cliente)}<span class="secundario">CI ${App.esc(d.ci)}</span></td>
            <td class="num">${App.moneda(d.monto_aprobado || d.monto_solicitado)}<span class="secundario">${d.monto_aprobado ? `${App.numero(d.tasa_interes, 2)}% · ${d.plazo_meses} m` : 'Solicitado'}</span></td>
            <td>${d.dictamen ? App.insignia(d.dictamen) : '—'}${d.nivel_riesgo ? `<span class="secundario">${App.esc(App.etiquetaEstado(d.nivel_riesgo))}</span>` : ''}</td>
            <td>${d.estado === 'RECHAZADA' ? App.insignia('RECHAZADA') : App.insignia('APROBADA')}${d.estado_credito ? `<span class="secundario">${App.esc(App.etiquetaEstado(d.estado_credito))}</span>` : ''}</td>
            <td><div class="detalle-texto">${App.esc(d.observacion_resolucion || '—')}</div></td>
            <td class="num">${d.id_credito ? `<div class="grupo-acciones" style="justify-content:flex-end">
              <a class="boton boton-secundario boton-sm" href="/app/contrato?id=${d.id_credito}" target="_blank" rel="noopener" title="Contrato ${App.esc(d.numero_contrato)}">Contrato</a>
              <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${d.id_credito}" target="_blank" rel="noopener" title="Cronograma">Cronograma</a></div>` : '—'}</td>
          </tr>`).join('')
        : App.filaVacia(8, 'No hay decisiones registradas con esos filtros.');
    } catch (error) {
      tabla.innerHTML = App.filaVacia(8, error.message);
    }
  }

  tabla.addEventListener('click', async (evento) => {
    const enlace = evento.target.closest('[data-ver]');
    if (!enlace) return;
    evento.preventDefault();
    const contenedor = document.getElementById('contenido-detalle');
    contenedor.innerHTML = '<div class="cargador">Cargando expediente...</div>';
    App.abrirModal('modal-detalle');
    try {
      const detalle = await App.api.get(`/api/solicitudes/${enlace.dataset.ver}`);
      document.getElementById('titulo-detalle').innerHTML = `Expediente ${App.esc(detalle.solicitud.codigo)}`;
      contenedor.innerHTML = window.DetalleSolicitud.renderExpediente(detalle);
    } catch (error) {
      contenedor.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  });

  filtros.buscar.addEventListener('input', App.retrasar(cargar));
  ['resultado', 'desde', 'hasta'].forEach((f) => filtros[f].addEventListener('change', cargar));
  document.getElementById('boton-imprimir').addEventListener('click', () => window.print());
  cargar();
});

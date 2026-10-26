/* ADMINISTRADOR - AUDITORÍA Y SUPERVISIÓN DEL SISTEMA  (RN12 - RNF06) */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const tabla = document.getElementById('tabla-auditoria');
  const filtros = {
    usuario: document.getElementById('filtro-usuario'),
    operacion: document.getElementById('filtro-operacion'),
    resultado: document.getElementById('filtro-resultado'),
    desde: document.getElementById('filtro-desde'),
    hasta: document.getElementById('filtro-hasta')
  };
  let registros = [];

  /* ---------------- Resumen de supervisión ---------------- */
  async function cargarResumen() {
    try {
      const r = await App.api.get('/api/usuarios/auditoria/resumen');
      App.animarNumero(document.getElementById('kpi-eventos'), r.hoy.eventos || 0);
      App.animarNumero(document.getElementById('kpi-ingresos'), r.hoy.ingresos || 0);
      App.animarNumero(document.getElementById('kpi-fallos'), r.hoy.fallos || 0);

      document.getElementById('tabla-gestion').innerHTML = r.gestionClientes.length
        ? r.gestionClientes.map((g) => `<tr><td><strong>${App.esc(g.oficial)}</strong></td><td class="num">${g.clientes}</td><td class="num">${g.solicitudes}</td><td class="num">${g.desembolsos}</td></tr>`).join('')
        : App.filaVacia(4, 'No hay oficiales registrados.');

      const maximo = Math.max(1, ...r.porUsuario.map((u) => u.total));
      const barras = document.getElementById('barras-actividad');
      barras.innerHTML = r.porUsuario.length
        ? r.porUsuario.map((u) => `<div class="barra-h"><span title="${App.esc(u.rol || '')}">@${App.esc(u.login)}</span><div class="pista"><div class="relleno" data-ancho="${(u.total / maximo) * 100}"></div></div><b>${u.total}</b></div>`).join('')
        : '<p class="texto-suave">Sin actividad reciente.</p>';
      requestAnimationFrame(() => barras.querySelectorAll('.relleno').forEach((b) => { b.style.width = `${b.dataset.ancho}%`; }));

      document.getElementById('estados-solicitudes').innerHTML = r.solicitudesPorEstado
        .map((e) => `<div class="tarjeta" style="padding:14px 18px;min-width:150px"><div>${App.insignia(e.estado)}</div><div class="kpi-valor" style="font-size:24px;font-weight:800;margin-top:6px">${e.total}</div></div>`).join('');
    } catch (error) { App.notificar('error', error.message); }
  }

  /* ---------------- Bitácora ---------------- */
  async function cargarBitacora() {
    tabla.innerHTML = App.filaCargando(7);
    const parametros = new URLSearchParams({ limite: 300 });
    Object.entries(filtros).forEach(([clave, campo]) => { if (campo.value.trim()) parametros.set(clave, campo.value.trim()); });
    try {
      const r = await App.api.get(`/api/usuarios/auditoria?${parametros}`);
      registros = r.registros;
      // Llenar el selector de operaciones solo una vez
      if (filtros.operacion.options.length === 1) {
        filtros.operacion.insertAdjacentHTML('beforeend', r.operaciones.map((o) => `<option value="${App.esc(o)}">${App.esc(o.replace(/_/g, ' '))}</option>`).join(''));
      }
      tabla.innerHTML = registros.length
        ? registros.map((a) => `
          <tr class="${a.resultado === 'FALLO' ? 'fila-alerta' : ''}">
            <td class="mono">${App.fechaHora(a.fecha_hora)}</td>
            <td>${a.login ? `<strong>@${App.esc(a.login)}</strong><span class="secundario">${App.esc(a.rol || '')}</span>` : '<span class="texto-suave">Anónimo</span>'}</td>
            <td><span class="etiqueta-rol">${App.esc(a.operacion.replace(/_/g, ' '))}</span></td>
            <td>${App.esc(a.entidad || '—')}${a.id_entidad ? ` #${a.id_entidad}` : ''}</td>
            <td><div class="detalle-auditoria">${App.esc(a.detalle || '')}</div></td>
            <td class="mono">${App.esc(a.ip || '—')}</td>
            <td>${App.insignia(a.resultado)}</td>
          </tr>`).join('')
        : App.filaVacia(7, 'No hay eventos que coincidan con los filtros.');
      document.getElementById('pie-auditoria').textContent = `${registros.length} evento(s) mostrados (máximo 300 por consulta).`;
    } catch (error) {
      tabla.innerHTML = App.filaVacia(7, error.message);
    }
  }

  /* ---------------- Exportar a CSV ---------------- */
  document.getElementById('boton-exportar').addEventListener('click', () => {
    if (!registros.length) { App.notificar('alerta', 'No hay registros para exportar.'); return; }
    const columnas = ['fecha_hora', 'login', 'rol', 'operacion', 'entidad', 'id_entidad', 'detalle', 'ip', 'resultado'];
    const filas = registros.map((r) => columnas.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'));
    const contenido = `${columnas.join(';')}\n${filas.join('\n')}`;
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `auditoria_${App.hoyISO()}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  });

  document.getElementById('boton-refrescar').addEventListener('click', () => { cargarResumen(); cargarBitacora(); });
  filtros.usuario.addEventListener('input', App.retrasar(cargarBitacora));
  ['operacion', 'resultado', 'desde', 'hasta'].forEach((f) => filtros[f].addEventListener('change', cargarBitacora));

  cargarResumen();
  cargarBitacora();
});

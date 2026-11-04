/* MI PERFIL (personal interno) */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  try {
    const { usuario, estadisticas, actividad } = await App.api.get('/api/auth/perfil');
    document.getElementById('perfil-avatar').textContent = App.iniciales(usuario.nombre_completo);
    document.getElementById('perfil-nombre').textContent = usuario.nombre_completo;
    document.getElementById('perfil-rol').textContent = usuario.rol_nombre;

    const datos = [
      ['Usuario', `@${usuario.login}`],
      ['Correo', usuario.correo || 'No registrado'],
      ['Último acceso', App.fechaHora(usuario.ultimo_acceso)],
      ['Cuenta creada', App.fecha(usuario.fecha_creacion)]
    ];
    if (['JEFE', 'GERENTE'].includes(usuario.rol)) datos.push(['Límite de aprobación', App.moneda(usuario.limite_aprobacion)]);
    document.getElementById('perfil-datos').innerHTML = datos
      .map(([etiqueta, valor]) => `<div class="dato"><span>${App.esc(etiqueta)}</span><strong>${App.esc(valor)}</strong></div>`).join('');

    const colores = ['', 'verde', 'morado', 'naranja'];
    document.getElementById('perfil-estadisticas').innerHTML = estadisticas.map((e, i) => `
      <div class="kpi ${colores[i % 4]} animar" style="--i:${i}">
        <div class="kpi-etiqueta">${App.esc(e.etiqueta)}</div>
        <div class="kpi-valor" data-valor="${e.valor}">0</div>
      </div>`).join('');
    document.querySelectorAll('#perfil-estadisticas [data-valor]').forEach((el) => App.animarNumero(el, Number(el.dataset.valor)));

    const lista = document.getElementById('perfil-actividad');
    lista.innerHTML = actividad.length
      ? actividad.map((a) => `
        <li>
          <span class="punto-actividad ${a.resultado === 'FALLO' ? 'fallo' : ''}"></span>
          <div><strong>${App.esc(a.operacion.replace(/_/g, ' '))}</strong><span>${App.esc(a.detalle || '')} · ${App.fechaHora(a.fecha_hora)}</span></div>
        </li>`).join('')
      : '<li class="texto-suave">Sin actividad registrada.</li>';
  } catch (error) {
    App.notificar('error', error.message);
  }
});

/* OFICIAL DE CRÉDITO - GARANTÍAS  (CU06 - RF07 - RN13) */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  await App.iniciar();

  const selector = document.getElementById('selector-solicitud');
  const resumen = document.getElementById('resumen-solicitud');
  const zona = document.getElementById('zona-garantias');
  const tabla = document.getElementById('tabla-garantias');
  const formulario = document.getElementById('formulario-garantia');
  const botonGuardar = document.getElementById('boton-guardar-garantia');
  const botonCancelar = document.getElementById('boton-cancelar-edicion');
  let solicitudes = [];
  let garantias = [];

  /* ---------------- Carga inicial ---------------- */
  try {
    const [{ tipos_garantia: tipos }, lista] = await Promise.all([
      App.api.get('/api/solicitudes/parametros'),
      App.api.get('/api/solicitudes?estado=REGISTRADA,EN_EVALUACION,EVALUADA,APROBADA')
    ]);
    document.getElementById('campo-tipo').innerHTML = '<option value="">Seleccione...</option>' + tipos.map((t) => `<option value="${t.codigo}">${App.esc(t.nombre)}</option>`).join('');
    solicitudes = lista;
    selector.innerHTML = solicitudes.length
      ? '<option value="">Seleccione una solicitud...</option>' + solicitudes.map((s) => `<option value="${s.id_solicitud}">${App.esc(s.codigo)} · ${App.esc(s.cliente)} · ${App.moneda(s.monto_solicitado)} (${App.esc(App.etiquetaEstado(s.estado))})</option>`).join('')
      : '<option value="">No hay solicitudes que admitan garantías</option>';
  } catch (error) { App.notificar('error', error.message); }

  const solicitudActual = () => solicitudes.find((s) => s.id_solicitud === Number(selector.value));

  /* ---------------- Resumen y listado ---------------- */
  async function cargarGarantias() {
    const s = solicitudActual();
    if (!s) { zona.style.display = 'none'; resumen.innerHTML = ''; return; }
    zona.style.display = '';
    tabla.innerHTML = App.filaCargando(5);
    try {
      garantias = await App.api.get(`/api/solicitudes/${s.id_solicitud}/garantias`);
      const total = garantias.reduce((suma, g) => suma + g.valor_comercial, 0);
      const cobertura = (total / s.monto_solicitado) * 100;
      resumen.innerHTML = `
        <div class="resumen-solicitud">
          <div class="dato"><span>Cliente</span><strong>${App.esc(s.cliente)}</strong></div>
          <div class="dato"><span>Producto</span><strong>${App.esc(s.producto)}</strong></div>
          <div class="dato"><span>Monto solicitado</span><strong>${App.moneda(s.monto_solicitado)}</strong></div>
          <div class="dato"><span>Estado</span><strong>${App.insignia(s.estado)}</strong></div>
          <div class="dato" style="grid-column: span 2"><span>Cobertura de garantías: ${App.porcentaje(cobertura)}</span>
            <div class="cobertura"><div class="progreso ${cobertura < 100 ? 'rojo' : ''}"><div style="width:${Math.min(100, cobertura)}%"></div></div><b>${App.moneda(total)}</b></div></div>
        </div>`;
      document.getElementById('total-garantias').textContent = `${garantias.length} registrada(s)`;
      tabla.innerHTML = garantias.length
        ? garantias.map((g) => `
          <tr>
            <td><strong>${App.esc(g.tipo_nombre)}</strong></td>
            <td>${App.esc(g.descripcion)}${g.documento_respaldo ? `<span class="secundario">${App.esc(g.documento_respaldo)}</span>` : ''}</td>
            <td class="num">${App.moneda(g.valor_comercial)}</td>
            <td>${App.insignia(g.estado)}</td>
            <td class="num"><div class="grupo-acciones" style="justify-content:flex-end">
              <button type="button" class="boton boton-secundario boton-sm" data-accion="editar" data-id="${g.id_garantia}" title="Editar">Editar</button>
              <button type="button" class="boton boton-secundario boton-sm texto-peligro" data-accion="eliminar" data-id="${g.id_garantia}" title="Eliminar">Eliminar</button>
            </div></td>
          </tr>`).join('')
        : App.filaVacia(5, 'Registre la primera garantía con el formulario.');
    } catch (error) {
      tabla.innerHTML = App.filaVacia(5, error.message);
    }
  }
  selector.addEventListener('change', () => { reiniciarFormulario(); cargarGarantias(); });

  /* ---------------- Acciones ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const garantia = garantias.find((g) => g.id_garantia === Number(boton.dataset.id));
    if (boton.dataset.accion === 'editar') {
      App.llenarFormulario(formulario, garantia);
      document.getElementById('titulo-form-garantia').innerHTML = `Editar garantía`;
      botonGuardar.textContent = 'Guardar cambios';
      botonCancelar.classList.remove('oculto');
      formulario.elements.descripcion.focus();
    }
    if (boton.dataset.accion === 'eliminar') {
      const ok = await App.confirmar({ titulo: 'Eliminar garantía', mensaje: `¿Eliminar "${garantia.descripcion}"?`, textoConfirmar: 'Eliminar', peligro: true });
      if (!ok) return;
      try {
        const r = await App.api.del(`/api/solicitudes/garantias/${garantia.id_garantia}`);
        App.notificar('exito', r.mensaje);
        cargarGarantias();
      } catch (error) { App.notificar('error', error.message); }
    }
  });

  function reiniciarFormulario() {
    formulario.reset();
    formulario.elements.id_garantia.value = '';
    document.getElementById('titulo-form-garantia').innerHTML = `Nueva garantía`;
    botonGuardar.textContent = 'Registrar garantía';
    botonCancelar.classList.add('oculto');
  }
  botonCancelar.addEventListener('click', reiniciarFormulario);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    const id = datos.id_garantia;
    delete datos.id_garantia;
    App.cargando(botonGuardar, true);
    try {
      const r = id
        ? await App.api.put(`/api/solicitudes/garantias/${id}`, datos)
        : await App.api.post(`/api/solicitudes/${selector.value}/garantias`, datos);
      App.notificar('exito', r.mensaje);
      reiniciarFormulario();
      cargarGarantias();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(botonGuardar, false);
    }
  });

  // Preselección desde /app/garantias?solicitud=ID
  const inicial = App.parametroUrl('solicitud');
  if (inicial && solicitudes.some((s) => String(s.id_solicitud) === inicial)) {
    selector.value = inicial;
    cargarGarantias();
  }
});

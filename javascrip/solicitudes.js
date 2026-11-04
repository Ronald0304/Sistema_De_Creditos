/* OFICIAL DE CRÉDITO - SOLICITUDES  (CU02 - RF03)
   ----------------------------------------------------------------------------
   - Registrar solicitud (búsqueda del cliente por CI, validación de límites
     del producto y estimación de cuota en vivo)
   - Editar (solo REGISTRADA), enviar a evaluación, anular
   - Ver expediente completo, acceso a garantías, contrato y cronograma*/
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const usuario = await App.iniciar();

  const tabla = document.getElementById('tabla-solicitudes');
  const formulario = document.getElementById('formulario-solicitud');
  const campoProducto = document.getElementById('campo-producto');
  const campoMonto = document.getElementById('campo-monto');
  const campoPlazo = document.getElementById('campo-plazo');
  const buscarCi = document.getElementById('buscar-ci');
  const tarjetaCliente = document.getElementById('tarjeta-cliente');
  const filtroBuscar = document.getElementById('filtro-buscar');
  const filtroMias = document.getElementById('filtro-mias');
  let estadoFiltro = '';
  let solicitudes = [];
  let productos = [];
  let clienteSeleccionado = null;

  /* ---------------- Parámetros de productos ---------------- */
  try {
    ({ productos } = await App.api.get('/api/solicitudes/parametros'));
    campoProducto.innerHTML = '<option value="">Seleccione un producto...</option>' +
      productos.map((p) => `<option value="${p.codigo}">${App.esc(p.nombre)} (${App.numero(p.tasa, 1)}% anual)</option>`).join('');
  } catch (error) { App.notificar('error', error.message); }

  /* ---------------- Listado e indicadores ---------------- */
  async function cargarIndicadores() {
    try {
      const todas = await App.api.get('/api/solicitudes');
      const contar = (...estados) => todas.filter((s) => estados.includes(s.estado)).length;
      App.animarNumero(document.getElementById('kpi-registradas'), contar('REGISTRADA'));
      App.animarNumero(document.getElementById('kpi-evaluacion'), contar('EN_EVALUACION', 'EVALUADA'));
      App.animarNumero(document.getElementById('kpi-aprobadas'), contar('APROBADA'));
      App.animarNumero(document.getElementById('kpi-desembolsadas'), contar('DESEMBOLSADA'));
    } catch (error) { /* los indicadores no son críticos */ }
  }

  async function cargarSolicitudes() {
    tabla.innerHTML = App.filaCargando(7);
    const parametros = new URLSearchParams();
    if (estadoFiltro) parametros.set('estado', estadoFiltro);
    if (filtroBuscar.value.trim()) parametros.set('buscar', filtroBuscar.value.trim());
    if (filtroMias.checked) parametros.set('mias', '1');
    try {
      solicitudes = await App.api.get(`/api/solicitudes?${parametros}`);
      pintarTabla();
    } catch (error) {
      tabla.innerHTML = App.filaVacia(7, error.message);
    }
  }

  function pintarTabla() {
    if (!solicitudes.length) { tabla.innerHTML = App.filaVacia(7, 'No hay solicitudes en esta categoría.'); return; }
    tabla.innerHTML = solicitudes.map((s) => {
      const acciones = [`<button type="button" class="boton boton-secundario boton-sm" data-accion="ver" data-id="${s.id_solicitud}" title="Ver expediente">Ver</button>`];
      if (s.estado === 'REGISTRADA') {
        acciones.push(`<button type="button" class="boton boton-secundario boton-sm" data-accion="editar" data-id="${s.id_solicitud}" title="Editar">Editar</button>`);
      }
      if (['REGISTRADA', 'EN_EVALUACION', 'EVALUADA', 'APROBADA'].includes(s.estado)) {
        acciones.push(`<a class="boton boton-secundario boton-sm" href="/app/garantias?solicitud=${s.id_solicitud}" title="Garantías">Garantías</a>`);
      }
      if (s.estado === 'REGISTRADA') {
        acciones.push(`<button type="button" class="boton boton-primario boton-sm" data-accion="enviar" data-id="${s.id_solicitud}">Enviar</button>`);
      }
      if (['REGISTRADA', 'EN_EVALUACION'].includes(s.estado)) {
        acciones.push(`<button type="button" class="boton boton-secundario boton-sm texto-peligro" data-accion="anular" data-id="${s.id_solicitud}" title="Anular">Anular</button>`);
      }
      if (s.estado === 'APROBADA') {
        acciones.push(`<a class="boton boton-exito boton-sm" href="/app/desembolsos">Desembolsar</a>`);
      }
      return `
        <tr>
          <td><strong>${App.esc(s.codigo)}</strong><span class="secundario">${App.fechaHora(s.fecha_solicitud)}</span></td>
          <td>${App.esc(s.cliente)}<span class="secundario">CI ${App.esc(s.ci)}</span></td>
          <td>${App.esc(s.producto)}<span class="secundario">${App.esc(s.destino)}</span></td>
          <td class="num"><strong>${App.moneda(s.monto_solicitado)}</strong><span class="secundario">${s.plazo_meses} meses · ${App.numero(s.tasa_interes, 1)}%</span></td>
          <td class="centro">${s.garantias ? `<strong>${s.garantias}</strong><span class="secundario">${App.moneda(s.valor_garantias)}</span>` : '<span class="insignia naranja">Sin garantía</span>'}</td>
          <td>${App.insignia(s.estado)}${s.dictamen ? `<span class="secundario">Dictamen: ${App.esc(App.etiquetaEstado(s.dictamen))}</span>` : ''}</td>
          <td class="num"><div class="grupo-acciones" style="justify-content:flex-end">${acciones.join('')}</div></td>
        </tr>`;
    }).join('');
  }

  /* ---------------- Acciones de la tabla ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const solicitud = solicitudes.find((s) => s.id_solicitud === Number(boton.dataset.id));
    if (!solicitud) return;
    const accion = boton.dataset.accion;

    if (accion === 'ver') verDetalle(solicitud.id_solicitud);
    if (accion === 'editar') abrirFormulario(solicitud);

    if (accion === 'enviar') {
      if (!solicitud.garantias) {
        const continuar = await App.confirmar({ titulo: 'Solicitud sin garantías', mensaje: 'Aún no registró garantías. Podrá registrarlas después, pero el analista verá una cobertura de 0%. ¿Enviar de todas formas?', textoConfirmar: 'Enviar igualmente' });
        if (!continuar) return;
      } else {
        const ok = await App.confirmar({ titulo: 'Enviar a evaluación', mensaje: `La solicitud ${solicitud.codigo} pasará a la bandeja del Analista de Crédito y ya no podrá editarse.`, textoConfirmar: 'Enviar' });
        if (!ok) return;
      }
      try {
        const r = await App.api.post(`/api/solicitudes/${solicitud.id_solicitud}/enviar`);
        App.notificar('exito', r.mensaje);
        refrescar();
      } catch (error) { App.notificar('error', error.message); }
    }

    if (accion === 'anular') {
      const motivo = await App.pedirTexto({ titulo: `Anular ${solicitud.codigo}`, mensaje: 'La anulación es definitiva y quedará registrada en auditoría.', etiqueta: 'Motivo de la anulación', textoConfirmar: 'Anular solicitud', peligro: true });
      if (!motivo) return;
      try {
        const r = await App.api.post(`/api/solicitudes/${solicitud.id_solicitud}/anular`, { motivo });
        App.notificar('exito', r.mensaje);
        refrescar();
      } catch (error) { App.notificar('error', error.message); }
    }
  });

  async function verDetalle(idSolicitud) {
    const contenedor = document.getElementById('contenido-detalle');
    contenedor.innerHTML = '<div class="cargador">Cargando expediente...</div>';
    App.abrirModal('modal-detalle');
    try {
      const detalle = await App.api.get(`/api/solicitudes/${idSolicitud}`);
      document.getElementById('titulo-detalle').innerHTML = `Expediente ${App.esc(detalle.solicitud.codigo)}`;
      contenedor.innerHTML = window.DetalleSolicitud.renderExpediente(detalle);
    } catch (error) {
      contenedor.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  }

  /* ---------------- Formulario: cliente ---------------- */
  async function buscarCliente() {
    const ci = buscarCi.value.trim();
    if (ci.length < 5) { App.notificar('alerta', 'Ingrese un CI válido (mínimo 5 dígitos).'); return; }
    const boton = document.getElementById('boton-buscar-cliente');
    App.cargando(boton, true);
    try {
      const cliente = await App.api.get(`/api/clientes/ci/${encodeURIComponent(ci)}`);
      seleccionarCliente(cliente);
    } catch (error) {
      clienteSeleccionado = null;
      formulario.elements.id_cliente.value = '';
      tarjetaCliente.classList.remove('oculto');
      tarjetaCliente.innerHTML = `<div class="aviso alerta" style="flex:1"><div>${App.esc(error.message)} <a href="/app/clientes">Registrar cliente</a></div></div>`;
    } finally {
      App.cargando(boton, false);
    }
  }

  function seleccionarCliente(cliente) {
    clienteSeleccionado = cliente;
    formulario.elements.id_cliente.value = cliente.id_cliente;
    tarjetaCliente.classList.remove('oculto');
    const advertencias = [];
    if (!cliente.activo) advertencias.push('<span class="insignia rojo">Cliente inactivo</span>');
    if (cliente.solicitudes_en_curso > 0) advertencias.push('<span class="insignia naranja">Tiene una solicitud en curso</span>');
    tarjetaCliente.innerHTML = `
      <div class="avatar">${App.esc(App.iniciales(`${cliente.nombres} ${cliente.apellidos}`))}</div>
      <div><strong>${App.esc(cliente.nombres)} ${App.esc(cliente.apellidos)}</strong><span class="texto-chico texto-suave">CI ${App.esc(cliente.ci)} ${App.esc(cliente.extension)}</span> ${advertencias.join(' ')}</div>
      <div class="derecha">Ingresos: <b>${App.moneda(cliente.ingresos_mensuales)}</b><br>Gastos: <b>${App.moneda(cliente.gastos_mensuales)}</b></div>`;
    estimar();
  }
  document.getElementById('boton-buscar-cliente').addEventListener('click', buscarCliente);
  buscarCi.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCliente(); } });

  /* ---------------- Formulario: condiciones y estimación ---------------- */
  function productoActual() { return productos.find((p) => p.codigo === campoProducto.value); }

  campoProducto.addEventListener('change', () => {
    const p = productoActual();
    const ayuda = document.getElementById('ayuda-producto');
    if (!p) { ayuda.textContent = ''; return; }
    campoMonto.min = p.montoMin; campoMonto.max = p.montoMax;
    campoPlazo.min = p.plazoMin; campoPlazo.max = p.plazoMax;
    ayuda.textContent = `Monto: ${App.moneda(p.montoMin)} a ${App.moneda(p.montoMax)} · Plazo: ${p.plazoMin} a ${p.plazoMax} meses`;
    estimar();
  });
  campoMonto.addEventListener('input', estimar);
  campoPlazo.addEventListener('input', estimar);

  /** Estima la cuota con el sistema francés (referencial; el servidor recalcula) */
  function estimar() {
    const p = productoActual();
    const monto = Number(campoMonto.value);
    const plazo = Number(campoPlazo.value);
    const campos = ['est-tasa', 'est-cuota', 'est-interes', 'est-rci'].map((id) => document.getElementById(id));
    if (!p || !monto || !plazo) { campos.forEach((c) => { c.textContent = '—'; }); return; }
    const i = p.tasa / 100 / 12;
    const cuota = (monto * i) / (1 - Math.pow(1 + i, -plazo));
    campos[0].textContent = `${App.numero(p.tasa, 2)} %`;
    campos[1].textContent = App.moneda(cuota);
    campos[2].textContent = App.moneda(cuota * plazo - monto);
    if (clienteSeleccionado) {
      const disponible = clienteSeleccionado.ingresos_mensuales - clienteSeleccionado.gastos_mensuales;
      const rci = disponible > 0 ? (cuota / disponible) * 100 : 999;
      campos[3].textContent = disponible > 0 ? App.porcentaje(rci) : 'Sin capacidad';
      campos[3].style.color = rci > 70 ? '#fca5a5' : rci > 40 ? '#fde68a' : '#86efac';
    } else {
      campos[3].textContent = '—';
    }
  }

  function abrirFormulario(solicitud = null) {
    formulario.reset();
    clienteSeleccionado = null;
    tarjetaCliente.classList.add('oculto');
    formulario.elements.id_solicitud.value = solicitud ? solicitud.id_solicitud : '';
    document.getElementById('bloque-buscar-cliente').classList.toggle('oculto', Boolean(solicitud));
    document.getElementById('titulo-modal-solicitud').innerHTML = `${solicitud ? `Editar ${App.esc(solicitud.codigo)}` : 'Nueva solicitud de crédito'}`;
    document.getElementById('boton-guardar-solicitud').textContent = solicitud ? 'Guardar cambios' : 'Registrar solicitud';
    if (solicitud) {
      formulario.elements.id_cliente.value = solicitud.id_cliente;
      tarjetaCliente.classList.remove('oculto');
      tarjetaCliente.innerHTML = `<div class="avatar">${App.esc(App.iniciales(solicitud.cliente))}</div><div><strong>${App.esc(solicitud.cliente)}</strong><span class="texto-chico texto-suave">CI ${App.esc(solicitud.ci)}</span></div>`;
      App.llenarFormulario(formulario, solicitud);
      campoProducto.dispatchEvent(new Event('change'));
    }
    estimar();
    App.abrirModal('modal-solicitud');
  }
  document.getElementById('boton-nueva-solicitud').addEventListener('click', () => abrirFormulario());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const datos = App.datosFormulario(formulario);
    if (!datos.id_cliente) { App.notificar('alerta', 'Primero busque y seleccione al cliente por su CI.'); buscarCi.focus(); return; }
    if (!formulario.reportValidity()) return;
    const id = datos.id_solicitud;
    delete datos.id_solicitud;
    const boton = document.getElementById('boton-guardar-solicitud');
    App.cargando(boton, true);
    try {
      const r = id ? await App.api.put(`/api/solicitudes/${id}`, datos) : await App.api.post('/api/solicitudes', datos);
      App.cerrarModal('modal-solicitud');
      if (!id) {
        const irGarantias = await App.confirmar({ titulo: 'Solicitud registrada', mensaje: `${r.mensaje} Cuota estimada: ${App.moneda(r.cuota_estimada)}.`, textoConfirmar: 'Registrar garantías ahora' });
        if (irGarantias) { window.location.href = `/app/garantias?solicitud=${r.id_solicitud}`; return; }
      } else {
        App.notificar('exito', r.mensaje);
      }
      refrescar();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(boton, false);
    }
  });

  /* ---------------- Filtros ---------------- */
  document.querySelectorAll('#pestanas-estado [data-estado]').forEach((pestana) => {
    pestana.addEventListener('click', () => {
      document.querySelectorAll('#pestanas-estado [data-estado]').forEach((p) => p.classList.toggle('activa', p === pestana));
      estadoFiltro = pestana.dataset.estado;
      cargarSolicitudes();
    });
  });
  filtroBuscar.addEventListener('input', App.retrasar(cargarSolicitudes));
  filtroMias.addEventListener('change', cargarSolicitudes);

  function refrescar() { cargarSolicitudes(); cargarIndicadores(); }
  refrescar();

  // Acceso directo desde la vista de clientes: /app/solicitudes?cliente=CI
  const ciInicial = App.parametroUrl('cliente');
  if (ciInicial && usuario.rol === 'OFICIAL') {
    abrirFormulario();
    buscarCi.value = ciInicial;
    buscarCliente();
  }
});

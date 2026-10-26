/* GESTIÓN DE CLIENTES  (CU01 - RF01 - RF02)
   ----------------------------------------------------------------------------
   Oficial de Crédito: registra y edita clientes. Al registrar se crea el
   acceso al portal con usuario = CI y contraseña inicial = CI.
   Administrador: supervisa la cartera y puede activar/desactivar clientes. */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const usuario = await App.iniciar();
  const esAdmin = usuario.rol === 'ADMIN';
  const esOficial = usuario.rol === 'OFICIAL';

  const tabla = document.getElementById('tabla-clientes');
  const formulario = document.getElementById('formulario-cliente');
  const filtroBuscar = document.getElementById('filtro-buscar');
  const filtroEstado = document.getElementById('filtro-estado');
  let clientes = [];

  if (esAdmin) {
    document.getElementById('subtitulo-clientes').textContent = 'Supervisión de la cartera de clientes registrada por los oficiales de crédito.';
  }

  /* ---------------- Listado ---------------- */
  async function cargarClientes() {
    tabla.innerHTML = App.filaCargando(7);
    const parametros = new URLSearchParams();
    if (filtroBuscar.value.trim()) parametros.set('buscar', filtroBuscar.value.trim());
    if (filtroEstado.value) parametros.set('estado', filtroEstado.value);
    try {
      clientes = await App.api.get(`/api/clientes?${parametros}`);
      if (!filtroBuscar.value && !filtroEstado.value) actualizarIndicadores();
      pintarTabla();
    } catch (error) {
      tabla.innerHTML = App.filaVacia(7, error.message);
    }
  }

  function actualizarIndicadores() {
    App.animarNumero(document.getElementById('kpi-total'), clientes.length);
    App.animarNumero(document.getElementById('kpi-activos'), clientes.filter((c) => c.creditos_activos > 0).length);
    App.animarNumero(document.getElementById('kpi-mora'), clientes.filter((c) => c.creditos_mora > 0).length);
    App.animarNumero(document.getElementById('kpi-pendientes'), clientes.filter((c) => c.debe_cambiar_clave).length);
  }

  function situacion(c) {
    if (!c.activo) return '<span class="insignia gris">Inactivo</span>';
    if (c.creditos_mora > 0) return App.insignia('EN_MORA');
    if (c.creditos_activos > 0) return App.insignia('AL_DIA', `${c.creditos_activos} crédito(s) al día`);
    return '<span class="insignia gris">Sin crédito activo</span>';
  }

  function pintarTabla() {
    if (!clientes.length) { tabla.innerHTML = App.filaVacia(7, 'No se encontraron clientes.'); return; }
    tabla.innerHTML = clientes.map((c) => `
      <tr>
        <td><div class="celda-cliente"><div class="avatar">${App.esc(App.iniciales(`${c.nombres} ${c.apellidos}`))}</div>
            <div><strong>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</strong><span class="secundario">CI ${App.esc(c.ci)} ${App.esc(c.extension)} · Reg. ${App.fecha(c.fecha_registro)}</span></div></div></td>
        <td>${App.esc(c.telefono || '—')}<span class="secundario">${App.esc(c.correo || 'Sin correo')}</span></td>
        <td>${App.esc(c.ocupacion || '—')}<span class="secundario">${App.moneda(c.ingresos_mensuales)} / mes</span></td>
        <td class="centro"><strong>${c.solicitudes}</strong></td>
        <td>${situacion(c)}</td>
        <td>${c.debe_cambiar_clave ? '<span class="insignia naranja">Pendiente 1er ingreso</span>' : `<span class="insignia verde">Activo</span><span class="secundario">${App.fechaHora(c.ultimo_acceso)}</span>`}</td>
        <td class="num"><div class="grupo-acciones" style="justify-content:flex-end">
          <button type="button" class="boton boton-secundario boton-sm" data-accion="ver" data-id="${c.id_cliente}" title="Ver ficha">Ver</button>
          <button type="button" class="boton boton-secundario boton-sm" data-accion="editar" data-id="${c.id_cliente}" title="Editar">Editar</button>
          ${esOficial && c.activo ? `<a class="boton boton-primario boton-sm" href="/app/solicitudes?cliente=${encodeURIComponent(c.ci)}" title="Nueva solicitud">Solicitud</a>` : ''}
          ${esAdmin ? `<button type="button" class="boton boton-sm ${c.activo ? 'boton-secundario' : 'boton-exito'}" data-accion="estado" data-id="${c.id_cliente}">${c.activo ? 'Desactivar' : 'Activar'}</button>` : ''}
        </div></td>
      </tr>`).join('');
  }

  /* ---------------- Acciones ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const cliente = clientes.find((c) => c.id_cliente === Number(boton.dataset.id));
    if (!cliente) return;
    if (boton.dataset.accion === 'ver') verFicha(cliente.id_cliente);
    if (boton.dataset.accion === 'editar') abrirFormulario(cliente);
    if (boton.dataset.accion === 'estado') {
      const activar = !cliente.activo;
      const ok = await App.confirmar({
        titulo: activar ? 'Activar cliente' : 'Desactivar cliente',
        mensaje: activar ? 'El cliente recuperará el acceso al portal.' : 'El cliente perderá el acceso al portal y no podrá registrar nuevas solicitudes.',
        textoConfirmar: activar ? 'Activar' : 'Desactivar', peligro: !activar
      });
      if (!ok) return;
      try {
        const r = await App.api.patch(`/api/clientes/${cliente.id_cliente}/estado`, { activo: activar });
        App.notificar('exito', r.mensaje);
        cargarClientes();
      } catch (error) { App.notificar('error', error.message); }
    }
  });

  /* ---------------- Ficha del cliente ---------------- */
  async function verFicha(idCliente) {
    const contenedor = document.getElementById('contenido-ficha');
    contenedor.innerHTML = '<div class="cargador">Cargando ficha...</div>';
    App.abrirModal('modal-ficha');
    try {
      const { cliente: c, solicitudes, historial } = await App.api.get(`/api/clientes/${idCliente}`);
      contenedor.innerHTML = `
        <div class="ficha-cabecera">
          <div class="avatar">${App.esc(App.iniciales(`${c.nombres} ${c.apellidos}`))}</div>
          <div><h4>${App.esc(c.nombres)} ${App.esc(c.apellidos)}</h4><span>CI ${App.esc(c.ci)} ${App.esc(c.extension)} · Cliente desde ${App.fecha(c.fecha_registro)}</span></div>
          <div class="derecha">${historial ? `<span>Calificación</span><br><span class="calificacion ${App.esc(historial.calificacion)}">${App.esc(historial.calificacion)}</span>` : '<span>Sin historial consultado</span>'}</div>
        </div>
        <div class="lista-datos">
          <div class="dato"><span>Teléfono</span><strong>${App.esc(c.telefono || '—')}</strong></div>
          <div class="dato"><span>Correo</span><strong>${App.esc(c.correo || '—')}</strong></div>
          <div class="dato"><span>Dirección</span><strong>${App.esc(c.direccion || '—')}</strong></div>
          <div class="dato"><span>Ocupación</span><strong>${App.esc(c.ocupacion || '—')}</strong></div>
          <div class="dato"><span>Ingresos mensuales</span><strong>${App.moneda(c.ingresos_mensuales)}</strong></div>
          <div class="dato"><span>Gastos mensuales</span><strong>${App.moneda(c.gastos_mensuales)}</strong></div>
          <div class="dato"><span>Oficial asignado</span><strong>${App.esc(c.oficial || '—')}</strong></div>
          <div class="dato"><span>Acceso al portal</span><strong>@${App.esc(c.login || '—')} ${c.debe_cambiar_clave ? '(sin primer ingreso)' : ''}</strong></div>
        </div>
        <div class="separador"></div>
        <h4 class="subtitulo-form">Solicitudes y créditos</h4>
        <div class="tabla-contenedor"><table class="tabla">
          <thead><tr><th>Solicitud</th><th>Producto</th><th class="num">Monto</th><th>Estado</th><th>Crédito</th></tr></thead>
          <tbody>${solicitudes.length ? solicitudes.map((s) => `
            <tr><td><strong>${App.esc(s.codigo)}</strong><span class="secundario">${App.fecha(s.fecha_solicitud)}</span></td>
              <td>${App.esc(s.tipo_credito)}<span class="secundario">${s.plazo_meses} meses</span></td>
              <td class="num">${App.moneda(s.monto_solicitado)}</td>
              <td>${App.insignia(s.estado)}</td>
              <td>${s.numero_credito ? `${App.esc(s.numero_credito)} ${App.insignia(s.estado_credito)}<span class="secundario">Saldo: ${App.moneda(s.saldo_capital)}</span>` : '—'}</td></tr>`).join('') : App.filaVacia(5, 'El cliente aún no tiene solicitudes.')}
          </tbody></table></div>`;
    } catch (error) {
      contenedor.innerHTML = `<div class="aviso peligro"><div>${App.esc(error.message)}</div></div>`;
    }
  }

  /* ---------------- Formulario registrar / editar ---------------- */
  function abrirFormulario(cliente = null) {
    formulario.reset();
    formulario.elements.id_cliente.value = cliente ? cliente.id_cliente : '';
    formulario.elements.ci.readOnly = Boolean(cliente);
    document.getElementById('aviso-credenciales').classList.toggle('oculto', Boolean(cliente));
    document.getElementById('titulo-modal-cliente').innerHTML = `${cliente ? 'Editar cliente' : 'Registrar cliente'}`;
    if (cliente) App.llenarFormulario(formulario, cliente);
    App.abrirModal('modal-cliente');
  }
  document.getElementById('boton-nuevo-cliente').addEventListener('click', () => abrirFormulario());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    const id = datos.id_cliente;
    delete datos.id_cliente;
    const boton = document.getElementById('boton-guardar-cliente');
    App.cargando(boton, true);
    try {
      const r = id ? await App.api.put(`/api/clientes/${id}`, datos) : await App.api.post('/api/clientes', datos);
      App.cerrarModal('modal-cliente');
      if (r.credenciales) mostrarCredenciales(r.credenciales, datos);
      else App.notificar('exito', r.mensaje);
      cargarClientes();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(boton, false);
    }
  });

  /** Informa al oficial las credenciales iniciales que debe comunicar al cliente */
  function mostrarCredenciales(credenciales, datos) {
    const modal = App.crearDialogo(`
      <div class="modal-cuerpo">
        <div class="texto-dialogo"><h4>Cliente registrado</h4>
          <p>Informe a <strong>${App.esc(datos.nombres)} ${App.esc(datos.apellidos)}</strong> sus credenciales de acceso al portal. En su primer ingreso deberá cambiar la contraseña.</p></div>
        <div class="credenciales">
          <div><span>Usuario</span><strong>${App.esc(credenciales.usuario)}</strong></div>
          <div><span>Contraseña inicial</span><strong>${App.esc(credenciales.clave)} (su CI)</strong></div>
        </div>
      </div>
      <div class="modal-pie">
        <button type="button" class="boton boton-secundario" data-cerrar-modal>Cerrar</button>
        ${esOficial ? `<a class="boton boton-primario" href="/app/solicitudes?cliente=${encodeURIComponent(datos.ci)}">Crear solicitud</a>` : ''}
      </div>`);
    return modal;
  }

  filtroBuscar.addEventListener('input', App.retrasar(cargarClientes));
  filtroEstado.addEventListener('change', cargarClientes);
  cargarClientes();
});

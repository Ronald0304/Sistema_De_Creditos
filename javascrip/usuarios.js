/* ADMINISTRADOR - GESTIÓN DE USUARIOS Y ROLES  (CU15)
   ----------------------------------------------------------------------------
   - Listado con filtros (personal interno / cuentas de clientes)
   - Crear y editar usuarios, cambiar rol y límite de aprobación
   - Activar / desactivar, restablecer contraseña y eliminar */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const yo = await App.iniciar();

  const tabla = document.getElementById('tabla-usuarios');
  const filtroBuscar = document.getElementById('filtro-buscar');
  const filtroRol = document.getElementById('filtro-rol');
  const filtroEstado = document.getElementById('filtro-estado');
  const formulario = document.getElementById('formulario-usuario');
  const campoRol = formulario.elements.rol;
  let tipoActual = 'internos';
  let usuarios = [];

  /* ---------------- Indicadores ---------------- */
  async function cargarResumen() {
    try {
      const { generales } = await App.api.get('/api/usuarios/resumen');
      App.animarNumero(document.getElementById('kpi-internos'), generales.internos);
      document.getElementById('kpi-internos-nota').textContent = `${generales.internos_activos} activos`;
      App.animarNumero(document.getElementById('kpi-clientes'), generales.clientes);
      App.animarNumero(document.getElementById('kpi-cambio'), generales.cambio_pendiente);
      App.animarNumero(document.getElementById('kpi-bloqueados'), generales.bloqueados);
    } catch (error) { App.notificar('error', error.message); }
  }

  /* ---------------- Listado ---------------- */
  async function cargarUsuarios() {
    tabla.innerHTML = App.filaCargando(6);
    const parametros = new URLSearchParams({ tipo: tipoActual });
    if (filtroBuscar.value.trim()) parametros.set('buscar', filtroBuscar.value.trim());
    if (filtroRol.value && tipoActual === 'internos') parametros.set('rol', filtroRol.value);
    if (filtroEstado.value) parametros.set('estado', filtroEstado.value);
    try {
      usuarios = await App.api.get(`/api/usuarios?${parametros}`);
      pintarTabla();
    } catch (error) {
      tabla.innerHTML = App.filaVacia(6, error.message);
    }
  }

  function pintarTabla() {
    if (!usuarios.length) { tabla.innerHTML = App.filaVacia(6, 'No se encontraron usuarios con los filtros aplicados.'); return; }
    tabla.innerHTML = usuarios.map((u) => {
      const esYo = u.id_usuario === yo.id;
      const esCliente = u.rol === 'CLIENTE';
      const seguridad = [
        u.bloqueado ? App.insignia('FALLO', 'Bloqueado') : '',
        u.debe_cambiar_clave ? '<span class="insignia naranja">Cambio de clave pendiente</span>' : '<span class="insignia verde">Clave personalizada</span>'
      ].join(' ');
      return `
        <tr>
          <td><div class="celda-usuario"><div class="avatar">${App.esc(App.iniciales(u.nombre_completo))}</div>
              <div><strong>${App.esc(u.nombre_completo)} ${esYo ? '<span class="insignia azul">Usted</span>' : ''}</strong><small>@${App.esc(u.login)}${u.correo ? ` · ${App.esc(u.correo)}` : ''}</small></div></div></td>
          <td><span class="etiqueta-rol ${u.rol}">${App.esc(u.rol_nombre)}</span>
              ${u.limite_aprobacion > 0 ? `<span class="secundario">Límite: ${App.moneda(u.limite_aprobacion)}</span>` : ''}</td>
          <td><label class="interruptor" title="${u.activo ? 'Desactivar' : 'Activar'}">
                <input type="checkbox" data-accion="estado" data-id="${u.id_usuario}" ${u.activo ? 'checked' : ''} ${esYo ? 'disabled' : ''}><span></span>
              </label></td>
          <td>${seguridad}</td>
          <td>${App.fechaHora(u.ultimo_acceso)}</td>
          <td class="num"><div class="grupo-acciones" style="justify-content:flex-end">
            ${esCliente ? '' : `<button type="button" class="boton boton-secundario boton-sm" data-accion="editar" data-id="${u.id_usuario}" title="Editar">Editar</button>`}
            <button type="button" class="boton boton-secundario boton-sm" data-accion="clave" data-id="${u.id_usuario}" title="Restablecer contraseña">Clave</button>
            ${esCliente || esYo ? '' : `<button type="button" class="boton boton-secundario boton-sm texto-peligro" data-accion="eliminar" data-id="${u.id_usuario}" title="Eliminar">Eliminar</button>`}
          </div></td>
        </tr>`;
    }).join('');
  }

  /* ---------------- Acciones de la tabla (delegación de eventos) ---------------- */
  tabla.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;
    const usuario = usuarios.find((u) => u.id_usuario === Number(boton.dataset.id));
    if (!usuario) return;

    if (boton.dataset.accion === 'editar') abrirFormulario(usuario);

    if (boton.dataset.accion === 'clave') {
      const esCliente = usuario.rol === 'CLIENTE';
      const ok = await App.confirmar({
        titulo: 'Restablecer contraseña',
        mensaje: esCliente
          ? `La contraseña de ${usuario.nombre_completo} volverá a ser su CI y deberá cambiarla al ingresar. También se desbloqueará la cuenta.`
          : `Se generará una contraseña temporal para ${usuario.nombre_completo}. Deberá cambiarla al ingresar.`,
        textoConfirmar: 'Restablecer'
      });
      if (!ok) return;
      try {
        const r = await App.api.post(`/api/usuarios/${usuario.id_usuario}/restablecer-clave`);
        mostrarCredenciales('Contraseña restablecida', r.credenciales);
        cargarUsuarios(); cargarResumen();
      } catch (error) { App.notificar('error', error.message); }
    }

    if (boton.dataset.accion === 'eliminar') {
      const ok = await App.confirmar({
        titulo: 'Eliminar usuario',
        mensaje: `¿Eliminar definitivamente la cuenta "${usuario.login}"? Si tiene operaciones registradas no podrá eliminarse (deberá desactivarla).`,
        textoConfirmar: 'Eliminar', peligro: true
      });
      if (!ok) return;
      try {
        const r = await App.api.del(`/api/usuarios/${usuario.id_usuario}`);
        App.notificar('exito', r.mensaje);
        cargarUsuarios(); cargarResumen();
      } catch (error) { App.notificar('error', error.message, 7000); }
    }
  });

  // Interruptor activar / desactivar
  tabla.addEventListener('change', async (evento) => {
    const casilla = evento.target.closest('input[data-accion="estado"]');
    if (!casilla) return;
    const usuario = usuarios.find((u) => u.id_usuario === Number(casilla.dataset.id));
    const activar = casilla.checked;
    if (!activar) {
      const ok = await App.confirmar({ titulo: 'Desactivar cuenta', mensaje: `${usuario.nombre_completo} no podrá iniciar sesión hasta que se reactive su cuenta.`, textoConfirmar: 'Desactivar', peligro: true });
      if (!ok) { casilla.checked = true; return; }
    }
    try {
      const r = await App.api.patch(`/api/usuarios/${usuario.id_usuario}/estado`, { activo: activar });
      usuario.activo = activar ? 1 : 0;
      App.notificar('exito', r.mensaje);
      cargarResumen();
    } catch (error) {
      casilla.checked = !activar;
      App.notificar('error', error.message);
    }
  });

  /* ---------------- Formulario crear / editar ---------------- */
  function actualizarCampoLimite() {
    document.getElementById('campo-limite').classList.toggle('oculto', !['JEFE', 'GERENTE'].includes(campoRol.value));
  }
  campoRol.addEventListener('change', actualizarCampoLimite);

  function abrirFormulario(usuario = null) {
    formulario.reset();
    formulario.elements.id_usuario.value = usuario ? usuario.id_usuario : '';
    document.getElementById('titulo-modal-usuario').innerHTML = `${usuario ? 'Editar usuario' : 'Nuevo usuario'}`;
    document.getElementById('campo-clave-temporal').classList.toggle('oculto', Boolean(usuario));
    if (usuario) {
      App.llenarFormulario(formulario, {
        nombre_completo: usuario.nombre_completo, login: usuario.login, correo: usuario.correo || '',
        rol: usuario.rol, limite_aprobacion: usuario.limite_aprobacion
      });
    }
    actualizarCampoLimite();
    App.abrirModal('modal-usuario');
  }
  document.getElementById('boton-nuevo-usuario').addEventListener('click', () => abrirFormulario());

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!formulario.reportValidity()) return;
    const datos = App.datosFormulario(formulario);
    const id = datos.id_usuario;
    delete datos.id_usuario;
    if (!datos.clave_temporal) delete datos.clave_temporal;
    const boton = document.getElementById('boton-guardar-usuario');
    App.cargando(boton, true);
    try {
      const r = id ? await App.api.put(`/api/usuarios/${id}`, datos) : await App.api.post('/api/usuarios', datos);
      App.cerrarModal('modal-usuario');
      if (r.credenciales) mostrarCredenciales('Usuario creado', r.credenciales);
      else App.notificar('exito', r.mensaje);
      cargarUsuarios(); cargarResumen();
    } catch (error) {
      App.notificar('error', error.message);
    } finally {
      App.cargando(boton, false);
    }
  });

  /** Muestra las credenciales generadas para entregarlas al usuario */
  function mostrarCredenciales(titulo, credenciales) {
    App.crearDialogo(`
      <div class="modal-cuerpo">
        <div class="texto-dialogo"><h4>${App.esc(titulo)}</h4><p>Entregue estas credenciales de forma segura. Se solicitará el cambio de contraseña en el primer ingreso.</p></div>
        <div class="credenciales">
          <div><span>Usuario</span><strong>${App.esc(credenciales.usuario)}</strong></div>
          <div><span>Contraseña temporal</span><strong>${App.esc(credenciales.clave_temporal)}</strong></div>
        </div>
      </div>
      <div class="modal-pie"><button type="button" class="boton boton-primario" data-cerrar-modal>Entendido</button></div>`);
  }

  /* ---------------- Filtros y pestañas ---------------- */
  document.querySelectorAll('[data-tipo]').forEach((pestana) => {
    pestana.addEventListener('click', () => {
      document.querySelectorAll('[data-tipo]').forEach((p) => p.classList.toggle('activa', p === pestana));
      tipoActual = pestana.dataset.tipo;
      filtroRol.classList.toggle('oculto', tipoActual === 'clientes');
      cargarUsuarios();
    });
  });
  filtroBuscar.addEventListener('input', App.retrasar(cargarUsuarios));
  filtroRol.addEventListener('change', cargarUsuarios);
  filtroEstado.addEventListener('change', cargarUsuarios);

  cargarResumen();
  cargarUsuarios();
});

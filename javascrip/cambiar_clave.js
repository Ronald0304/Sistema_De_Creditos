/* CAMBIO DE CONTRASEÑA (obligatorio en el primer ingreso de clientes y de
   cuentas creadas/restablecidas por el Administrador)*/
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';
  const usuario = await App.iniciarDocumento();

  const formulario = document.getElementById('formulario-clave');
  const campoActual = document.getElementById('clave-actual');
  const campoNueva = document.getElementById('clave-nueva');
  const campoConfirmacion = document.getElementById('clave-confirmacion');
  const barra = document.getElementById('medidor-barra');
  const textoMedidor = document.getElementById('medidor-texto');
  const botonGuardar = document.getElementById('boton-guardar');

  // Contexto: primer ingreso (obligatorio) o cambio voluntario
  document.getElementById('texto-usuario').textContent = `${usuario.nombre} · ${usuario.rol_nombre} (usuario: ${usuario.login})`;
  if (usuario.debe_cambiar_clave) {
    document.getElementById('aviso-obligatorio').classList.remove('oculto');
    if (usuario.rol === 'CLIENTE') document.getElementById('ayuda-actual').textContent = 'Su contraseña actual es su número de CI.';
  } else {
    document.getElementById('enlace-volver').classList.remove('oculto');
  }
  document.getElementById('boton-salir').addEventListener('click', () => App.cerrarSesion());

  // Evaluación de requisitos y fortaleza en vivo
  const reglas = {
    largo: (c) => c.length >= 8,
    mayuscula: (c) => /[A-ZÁÉÍÓÚÑ]/.test(c),
    minuscula: (c) => /[a-záéíóúñ]/.test(c),
    numero: (c) => /[0-9]/.test(c),
    distinta: (c) => c.length > 0 && c.toLowerCase() !== String(usuario.login).toLowerCase() && c !== campoActual.value
  };
  function evaluar() {
    const clave = campoNueva.value;
    let cumplidas = 0;
    document.querySelectorAll('#requisitos li').forEach((li) => {
      const ok = reglas[li.dataset.regla](clave);
      li.classList.toggle('cumple', ok);
      if (ok) cumplidas += 1;
    });
    const extra = /[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]/.test(clave) && clave.length >= 10 ? 1 : 0;
    const nivel = Math.min(5, cumplidas + extra);
    const niveles = [
      ['0%', '#e2e8f0', 'Ingrese una contraseña segura'],
      ['20%', '#dc2626', 'Muy débil'], ['40%', '#f97316', 'Débil'], ['60%', '#eab308', 'Aceptable'],
      ['80%', '#22c55e', 'Segura'], ['100%', '#059669', 'Muy segura']
    ];
    const [ancho, color, texto] = niveles[clave ? Math.max(1, nivel) : 0];
    barra.style.width = ancho;
    barra.style.background = color;
    textoMedidor.textContent = texto;
    verificarConfirmacion();
    return cumplidas === Object.keys(reglas).length;
  }
  function verificarConfirmacion() {
    const ayuda = document.getElementById('ayuda-confirmacion');
    if (!campoConfirmacion.value) { ayuda.textContent = ''; return false; }
    const coincide = campoConfirmacion.value === campoNueva.value;
    ayuda.textContent = coincide ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden';
    ayuda.style.color = coincide ? 'var(--exito)' : 'var(--peligro)';
    return coincide;
  }
  campoNueva.addEventListener('input', evaluar);
  campoActual.addEventListener('input', evaluar);
  campoConfirmacion.addEventListener('input', verificarConfirmacion);
  document.getElementById('mostrar-claves').addEventListener('change', (e) => {
    [campoActual, campoNueva, campoConfirmacion].forEach((c) => { c.type = e.target.checked ? 'text' : 'password'; });
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!campoActual.value) { App.notificar('alerta', 'Ingrese su contraseña actual.'); campoActual.focus(); return; }
    if (!evaluar()) { App.notificar('alerta', 'La nueva contraseña no cumple todos los requisitos.'); campoNueva.focus(); return; }
    if (!verificarConfirmacion()) { App.notificar('alerta', 'La confirmación no coincide.'); campoConfirmacion.focus(); return; }

    App.cargando(botonGuardar, true);
    try {
      const respuesta = await App.api.post('/api/auth/cambiar-clave', App.datosFormulario(formulario));
      App.notificar('exito', `${respuesta.mensaje} Redirigiendo...`);
      setTimeout(() => { window.location.href = respuesta.destino; }, 1300);
    } catch (error) {
      App.cargando(botonGuardar, false);
      App.notificar('error', error.message);
    }
  });
});

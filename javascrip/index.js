/* LÓGICA DE LA LANDING PAGE
   ----------------------------------------------------------------------------
   1. Navegación (barra compacta al desplazarse, menú móvil, enlace activo)
   2. Animaciones de revelado y contadores
   3. Productos y simulador de cuotas (sistema francés)
   4. Panel de inicio de sesión (validación, Bloq Mayús, recordar usuario,
      detección de sesión activa y cambio rápido de usuario) */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /*  1. NAVEGACIÓN */
  const navegacion = document.getElementById('navegacion');
  const alDesplazar = () => navegacion.classList.toggle('compacta', window.scrollY > 40);
  window.addEventListener('scroll', alDesplazar, { passive: true });
  alDesplazar();

  document.getElementById('nav-hamburguesa').addEventListener('click', () => document.body.classList.toggle('nav-abierta'));
  document.querySelectorAll('.nav-enlaces a').forEach((enlace) => enlace.addEventListener('click', () => document.body.classList.remove('nav-abierta')));

  // Resaltar el enlace de la sección visible
  const enlaces = [...document.querySelectorAll('.nav-enlaces a')];
  const observadorSecciones = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        enlaces.forEach((a) => a.classList.toggle('activo', a.getAttribute('href') === `#${entrada.target.id}`));
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('section[id]').forEach((s) => observadorSecciones.observe(s));

  // Los botones "Acceder" llevan al panel de acceso y enfocan el usuario
  const tarjetaAcceso = document.getElementById('tarjeta-acceso');
  document.querySelectorAll('a[href="#acceso"]').forEach((enlace) => {
    enlace.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('acceso').scrollIntoView({ behavior: 'smooth', block: 'center' });
      tarjetaAcceso.classList.remove('resaltar');
      void tarjetaAcceso.offsetWidth; // reinicia la animación
      tarjetaAcceso.classList.add('resaltar');
      setTimeout(() => document.getElementById('campo-usuario')?.focus({ preventScroll: true }), 600);
    });
  });
  document.getElementById('anio-actual').textContent = new Date().getFullYear();

  /*  2. REVELADO AL DESPLAZARSE Y CONTADORES */
  const observadorRevelado = new IntersectionObserver((entradas, obs) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('visible');
      entrada.target.querySelectorAll('[data-contador]').forEach(animarContador);
      obs.unobserve(entrada.target);
    });
  }, { threshold: 0.15 });
  const observarRevelado = (raiz = document) => raiz.querySelectorAll('.revelar:not(.visible)').forEach((el) => observadorRevelado.observe(el));
  observarRevelado();

  function animarContador(elemento) {
    const final = Number(elemento.dataset.contador);
    const sufijo = elemento.dataset.sufijo || '';
    App.animarNumero(elemento, final, (v) => `${Math.round(v)}${sufijo}`, 1600);
  }

  /*  3. PRODUCTOS Y SIMULADOR */
  const DESCRIPCION = {
    CONSUMO: 'Para tus proyectos personales',
    MICROCREDITO: 'Impulsa tu emprendimiento',
    VEHICULAR: 'Estrena tu vehículo',
    VIVIENDA: 'Compra, construye o amplía',
    PYME: 'Crecimiento empresarial'
  };
  // Valores de respaldo si el servidor no responde
  let productos = [
    { codigo: 'CONSUMO', nombre: 'Crédito de Consumo', tasa: 16, montoMin: 1000, montoMax: 80000, plazoMin: 3, plazoMax: 48 },
    { codigo: 'MICROCREDITO', nombre: 'Microcrédito', tasa: 18, montoMin: 500, montoMax: 50000, plazoMin: 3, plazoMax: 36 },
    { codigo: 'VEHICULAR', nombre: 'Crédito Vehicular', tasa: 12.5, montoMin: 10000, montoMax: 250000, plazoMin: 12, plazoMax: 72 },
    { codigo: 'VIVIENDA', nombre: 'Crédito de Vivienda', tasa: 9, montoMin: 30000, montoMax: 1500000, plazoMin: 24, plazoMax: 240 },
    { codigo: 'PYME', nombre: 'Crédito PyME', tasa: 13.5, montoMin: 5000, montoMax: 500000, plazoMin: 6, plazoMax: 84 }
  ];

  const grilla = document.getElementById('grilla-productos');
  const selectorProducto = document.getElementById('sim-producto');
  const rangoMonto = document.getElementById('sim-monto');
  const rangoPlazo = document.getElementById('sim-plazo');

  function pintarProductos() {
    grilla.innerHTML = productos.map((p, i) => `
      <article class="producto revelar" style="--retraso:${i}">
        <h3>${App.esc(p.nombre)}</h3>
        <div class="tasa">${App.numero(p.tasa, 1)}% <small>anual</small></div>
        <ul>
          <li>${App.esc(DESCRIPCION[p.codigo] || 'Financiamiento a tu medida')}</li>
          <li>Hasta ${App.moneda(p.montoMax).replace(',00', '')}</li>
          <li>Plazo de ${p.plazoMin} a ${p.plazoMax} meses</li>
        </ul>
      </article>`).join('');
    observarRevelado(grilla);

    selectorProducto.innerHTML = productos.map((p) => `<option value="${p.codigo}">${App.esc(p.nombre)} · ${App.numero(p.tasa, 1)}%</option>`).join('');
    configurarRangos();
  }

  /** Ajusta los límites de los controles al producto seleccionado */
  function configurarRangos() {
    const p = productos.find((x) => x.codigo === selectorProducto.value) || productos[0];
    rangoMonto.min = p.montoMin;
    rangoMonto.max = Math.min(p.montoMax, p.codigo === 'VIVIENDA' ? 800000 : p.montoMax);
    rangoMonto.step = p.montoMax > 200000 ? 5000 : 500;
    rangoMonto.value = Math.min(Math.max(Number(rangoMonto.value), p.montoMin), Number(rangoMonto.max));
    rangoPlazo.min = p.plazoMin;
    rangoPlazo.max = p.plazoMax;
    rangoPlazo.value = Math.min(Math.max(Number(rangoPlazo.value), p.plazoMin), p.plazoMax);
    simular();
  }

  /** Cálculo de cuota fija (sistema francés) */
  function simular() {
    const p = productos.find((x) => x.codigo === selectorProducto.value) || productos[0];
    const monto = Number(rangoMonto.value);
    const plazo = Number(rangoPlazo.value);
    const i = p.tasa / 100 / 12;
    const cuota = i === 0 ? monto / plazo : (monto * i) / (1 - Math.pow(1 + i, -plazo));
    const total = cuota * plazo;
    const interes = total - monto;

    document.getElementById('sim-monto-valor').textContent = App.moneda(monto).replace(',00', '');
    document.getElementById('sim-plazo-valor').textContent = `${plazo} meses`;
    document.getElementById('sim-cuota').textContent = App.moneda(cuota);
    document.getElementById('sim-tasa').textContent = `${App.numero(p.tasa, 2)} %`;
    document.getElementById('sim-interes').textContent = App.moneda(interes);
    document.getElementById('sim-total').textContent = App.moneda(total);
    document.getElementById('sim-barra-capital').style.width = `${(monto / total) * 100}%`;
    document.getElementById('sim-barra-interes').style.width = `${(interes / total) * 100}%`;
    [rangoMonto, rangoPlazo].forEach((r) => r.style.setProperty('--progreso', `${((r.value - r.min) / (r.max - r.min)) * 100}%`));
  }

  selectorProducto.addEventListener('change', configurarRangos);
  rangoMonto.addEventListener('input', simular);
  rangoPlazo.addEventListener('input', simular);

  fetch('/api/auth/tasas')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((datos) => { if (Array.isArray(datos) && datos.length) productos = datos; })
    .catch(() => { /* se usan los valores de respaldo */ })
    .finally(pintarProductos);

  /* 4. PANEL DE INICIO DE SESIÓN */
  const formulario = document.getElementById('formulario-login');
  const campoUsuario = document.getElementById('campo-usuario');
  const campoClave = document.getElementById('campo-clave');
  const botonIngresar = document.getElementById('boton-ingresar');
  const cajaError = document.getElementById('error-acceso');
  const casillaRecordar = document.getElementById('recordar-usuario');
  const avisoAcceso = document.getElementById('acceso-aviso');

  // Mensajes según el parámetro de la URL
  const mensajes = {
    expirado: ['Su sesión expiró por inactividad. Ingrese nuevamente.', ''],
    requerido: ['Debe iniciar sesión para acceder a esa sección.', ''],
    deshabilitado: ['Su cuenta fue deshabilitada. Contacte con la entidad.', '']
  };
  const parametros = new URLSearchParams(window.location.search);
  const motivo = parametros.get('acceso');
  if (mensajes[motivo]) mostrarAviso(mensajes[motivo][0]);
  if (parametros.get('sesion') === 'cerrada') mostrarAviso('Sesión cerrada correctamente. ¡Hasta pronto!', 'exito');
  if (motivo || parametros.get('sesion')) {
    // Limpia la URL para que el mensaje no se repita al recargar
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    setTimeout(() => document.getElementById('acceso').scrollIntoView({ block: 'center' }), 300);
  }

  function mostrarAviso(texto, tipo = '') {
    avisoAcceso.textContent = texto;
    avisoAcceso.className = `acceso-aviso ${tipo}`;
  }

  // Recordar usuario (solo el nombre de usuario, nunca la contraseña)
  try {
    const recordado = localStorage.getItem('credimanager_usuario');
    if (recordado) { campoUsuario.value = recordado; casillaRecordar.checked = true; }
  } catch (e) { /* almacenamiento no disponible */ }

  // Mostrar / ocultar contraseña
  const botonVer = document.getElementById('ver-clave');
  botonVer.addEventListener('click', () => {
    const visible = campoClave.type === 'text';
    campoClave.type = visible ? 'password' : 'text';
    botonVer.textContent = visible ? 'Ver' : 'Ocultar';
    botonVer.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    campoClave.focus();
  });

  // Aviso de Bloq Mayús
  const avisoMayus = document.getElementById('aviso-mayus');
  campoClave.addEventListener('keyup', (e) => avisoMayus.classList.toggle('oculto', !e.getModifierState?.('CapsLock')));

  // Accesos de demostración: rellenan el formulario
  document.querySelectorAll('.lista-demo button').forEach((boton) => {
    boton.addEventListener('click', () => {
      campoUsuario.value = boton.dataset.usuario;
      campoClave.value = boton.dataset.clave;
      cajaError.classList.add('oculto');
      botonIngresar.focus();
    });
  });

  function mostrarError(texto) {
    cajaError.textContent = texto;
    cajaError.classList.remove('oculto');
    tarjetaAcceso.classList.remove('sacudir');
    void tarjetaAcceso.offsetWidth;
    tarjetaAcceso.classList.add('sacudir');
  }

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    cajaError.classList.add('oculto');
    const login = campoUsuario.value.trim();
    const clave = campoClave.value;
    if (!login) { mostrarError('Ingrese su usuario o número de CI.'); campoUsuario.focus(); return; }
    if (!clave) { mostrarError('Ingrese su contraseña.'); campoClave.focus(); return; }

    App.cargando(botonIngresar, true);
    try {
      const respuesta = await App.api.post('/api/auth/login', { login, clave });
      try {
        if (casillaRecordar.checked) localStorage.setItem('credimanager_usuario', login);
        else localStorage.removeItem('credimanager_usuario');
      } catch (e) { /* sin almacenamiento */ }

      botonIngresar.classList.remove('cargando');
      botonIngresar.classList.add('exito');
      botonIngresar.innerHTML = `Acceso concedido`;
      App.notificar('exito', respuesta.mensaje);
      setTimeout(() => { window.location.href = respuesta.destino; }, 700);
    } catch (error) {
      App.cargando(botonIngresar, false);
      campoClave.value = '';
      mostrarError(error.message);
      campoClave.focus();
    }
  });

  // Si ya hay una sesión activa, se ofrece continuar o cambiar de usuario
  fetch('/api/auth/estado', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((datos) => {
      if (!datos?.usuario) return;
      const { usuario, destino } = datos;
      formulario.classList.add('oculto');
      document.getElementById('sesion-activa').classList.remove('oculto');
      document.getElementById('sesion-avatar').textContent = App.iniciales(usuario.nombre);
      document.getElementById('sesion-nombre').textContent = usuario.nombre;
      document.getElementById('sesion-rol').textContent = usuario.rol_nombre;
      document.getElementById('sesion-ir').href = destino;
      document.getElementById('boton-nav-acceso').lastChild.textContent = ' Ir a mi panel';
      document.getElementById('boton-nav-acceso').href = destino;
    })
    .catch(() => { /* sin sesión */ });

  document.getElementById('sesion-cambiar').addEventListener('click', async () => {
    try { await App.api.post('/api/auth/logout'); } catch (e) { /* ignorar */ }
    document.getElementById('sesion-activa').classList.add('oculto');
    formulario.classList.remove('oculto');
    campoUsuario.value = '';
    campoUsuario.focus();
    mostrarAviso('Sesión cerrada. Ingrese con otro usuario.', 'exito');
  });
});

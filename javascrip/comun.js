/* NÚCLEO DEL FRONTEND (compartido por todas las vistas)
   ----------------------------------------------------------------------------
   Expone el objeto global `App` con:
     - App.iniciar()        Verifica la sesión y construye la estructura del
                            panel (menú lateral según el ROL, barra superior,
                            sección de cierre de sesión).
     - App.iniciarDocumento() Verifica la sesión para documentos imprimibles.
     - App.api.*            Peticiones JSON al servidor con manejo de errores.
     - Formatos             moneda, fecha, porcentaje, escape de HTML (XSS).
     - Interfaz             notificaciones, confirmaciones, modales, pestañas.
   Nota: por la Política de Seguridad de Contenido (CSP) no se usan
   atributos "onclick" en el HTML; todos los eventos se registran aquí o en
   el script de cada página con addEventListener.*/
(function () {
  'use strict';

  /* MENÚS DE NAVEGACIÓN POR ROL*/
  const MENUS = {
    ADMIN: [
      { titulo: 'Administración' },
      { texto: 'Usuarios y roles', ruta: '/app/usuarios' },
      { texto: 'Auditoría y supervisión', ruta: '/app/auditoria' },
      { texto: 'Gestión de clientes', ruta: '/app/clientes' },
      { texto: 'Reportes ejecutivos', ruta: '/app/reportes' },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    OFICIAL: [
      { titulo: 'Originación' },
      { texto: 'Clientes', ruta: '/app/clientes' },
      { texto: 'Solicitudes de crédito', ruta: '/app/solicitudes' },
      { texto: 'Garantías', ruta: '/app/garantias' },
      { texto: 'Desembolsos', ruta: '/app/desembolsos' },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    ANALISTA: [
      { titulo: 'Riesgo crediticio' },
      { texto: 'Bandeja de evaluación', ruta: '/app/evaluaciones', alias: ['/app/evaluar'] },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    JEFE: [
      { titulo: 'Comité de crédito' },
      { texto: 'Bandeja de aprobación', ruta: '/app/aprobaciones' },
      { texto: 'Historial de decisiones', ruta: '/app/historial' },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    CAJERO: [
      { titulo: 'Operaciones de caja' },
      { texto: 'Caja y cobranzas', ruta: '/app/pagos' },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    GERENTE: [
      { titulo: 'Gerencia' },
      { texto: 'Reportes ejecutivos', ruta: '/app/reportes' },
      { texto: 'Historial de decisiones', ruta: '/app/historial' },
      { titulo: 'Cuenta' },
      { texto: 'Mi perfil', ruta: '/app/perfil' }
    ],
    CLIENTE: [
      { titulo: 'Mi banca' },
      { texto: 'Resumen de mi cuenta', ruta: '/app/portal' },
      { titulo: 'Seguridad' },
      { texto: 'Cambiar contraseña', ruta: '/app/cambiar-clave' }
    ]
  };

  /* FORMATOS */
  const formatoMoneda = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Escapa texto para insertarlo de forma segura en HTML (evita XSS) */
  function esc(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  /** 1234.5 -> "Bs 1.234,50" */
  function moneda(valor) { return `Bs ${formatoMoneda.format(Number(valor) || 0)}`; }
  /** Número con separadores sin símbolo */
  function numero(valor, decimales = 2) {
    return new Intl.NumberFormat('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(Number(valor) || 0);
  }
  /** "2026-10-23" -> "23/10/2026" */
  function fecha(valor) {
    if (!valor) return '—';
    const [a, m, d] = String(valor).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
  /** "2026-10-23 14:05:00" -> "23/10/2026 14:05" */
  function fechaHora(valor) {
    if (!valor) return '—';
    return `${fecha(valor)} ${String(valor).slice(11, 16)}`;
  }
  /** Fecha larga: "viernes, 23 de octubre de 2026" */
  function fechaLarga(valor) {
    const d = valor ? new Date(`${String(valor).slice(0, 10)}T00:00:00`) : new Date();
    return d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function porcentaje(valor, decimales = 1) { return `${numero(valor, decimales)} %`; }
  /** Iniciales para avatares */
  function iniciales(nombre) {
    return String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
  /** Fecha de hoy AAAA-MM-DD (local) */
  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /*  INSIGNIAS DE ESTADO */
  const ESTADOS = {
    // Solicitud
    REGISTRADA: ['Registrada', 'gris'],
    EN_EVALUACION: ['En evaluación', 'celeste'],
    EVALUADA: ['Evaluada', 'morado'],
    APROBADA: ['Aprobada', 'verde'],
    RECHAZADA: ['Rechazada', 'rojo'],
    DESEMBOLSADA: ['Desembolsada', 'turquesa'],
    ANULADA: ['Anulada', 'gris'],
    // Crédito
    PENDIENTE_DESEMBOLSO: ['Pendiente de desembolso', 'naranja'],
    VIGENTE: ['Vigente', 'verde'],
    EN_MORA: ['En mora', 'rojo pulso'],
    CANCELADO: ['Cancelado', 'azul'],
    // Cuota
    PENDIENTE: ['Pendiente', 'gris'],
    VENCIDA: ['Vencida', 'rojo'],
    PAGADA: ['Pagada', 'verde'],
    // Evaluación
    FAVORABLE: ['Favorable', 'verde'],
    NO_FAVORABLE: ['No favorable', 'rojo'],
    BAJO: ['Riesgo bajo', 'verde'],
    MEDIO: ['Riesgo medio', 'naranja'],
    ALTO: ['Riesgo alto', 'rojo'],
    // Garantía
    LIBERADA: ['Liberada', 'azul'],
    // Auditoría
    EXITO: ['Éxito', 'verde'],
    FALLO: ['Fallo', 'rojo'],
    // Cliente (portal)
    AL_DIA: ['Al día', 'verde'],
    SIN_CREDITOS: ['Sin créditos activos', 'gris'],
    // Pagos
    CUOTA: ['Pago de cuota', 'celeste'],
    CANCELACION_TOTAL: ['Cancelación total', 'morado']
  };
  /** Devuelve el HTML de una insignia para un estado */
  function insignia(estado, texto) {
    const [etiqueta, color] = ESTADOS[estado] || [String(estado || '—').replace(/_/g, ' '), 'gris'];
    return `<span class="insignia ${color}">${esc(texto || etiqueta)}</span>`;
  }
  function etiquetaEstado(estado) { return (ESTADOS[estado] || [String(estado || '').replace(/_/g, ' ')])[0]; }

  /**
   * Línea de tiempo del ciclo de una solicitud (RN02).
   * Registrada, En evaluación, Evaluada, Resolución, Desembolsada
   */
  function lineaTiempoSolicitud(estado) {
    const orden = ['REGISTRADA', 'EN_EVALUACION', 'EVALUADA', 'RESOLUCION', 'DESEMBOLSADA'];
    const nombres = { REGISTRADA: 'Registrada', EN_EVALUACION: 'En evaluación', EVALUADA: 'Evaluada', RESOLUCION: 'Aprobación', DESEMBOLSADA: 'Desembolsada' };
    // Índice del paso "actual" (los anteriores se marcan como completados)
    const indice = { REGISTRADA: 0, EN_EVALUACION: 1, EVALUADA: 3, APROBADA: 4, RECHAZADA: 3, DESEMBOLSADA: 5, ANULADA: 1 }[estado] ?? 0;
    return `<div class="linea-tiempo">${orden.map((paso, i) => {
      let clase = '';
      let nombre = nombres[paso];
      if (paso === 'RESOLUCION' && estado === 'RECHAZADA') { clase = 'fallido'; nombre = 'Rechazada'; }
      else if (estado === 'ANULADA' && i === 1) { clase = 'fallido'; nombre = 'Anulada'; }
      else if (i < indice) clase = 'hecho';
      else if (i === indice) { clase = 'actual'; }
      if (paso === 'RESOLUCION' && estado === 'APROBADA') nombre = 'Aprobada';
      return `<div class="paso ${clase}"><div class="punto">${i + 1}</div>${esc(nombre)}</div>`;
    }).join('')}</div>`;
  }

  /* API (peticiones JSON) */
  async function peticion(metodo, url, cuerpo) {
    const opciones = { method: metodo, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (metodo !== 'GET') {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo || {});
    }
    let respuesta;
    try {
      respuesta = await fetch(url, opciones);
    } catch (error) {
      throw new Error('No se pudo conectar con el servidor. Verifique su conexión.');
    }
    let datos = {};
    try { datos = await respuesta.json(); } catch (e) { datos = {}; }

    if (respuesta.status === 401 && datos.codigo === 'SESION_EXPIRADA') {
      notificar('alerta', datos.error || 'Su sesión expiró.');
      setTimeout(() => { window.location.href = '/?acceso=expirado#acceso'; }, 1200);
      throw new Error(datos.error);
    }
    if (respuesta.status === 403 && datos.codigo === 'CAMBIO_CLAVE_REQUERIDO') {
      window.location.href = '/app/cambiar-clave';
      throw new Error(datos.error);
    }
    if (!respuesta.ok) {
      const error = new Error(datos.error || `Error ${respuesta.status}`);
      error.estado = respuesta.status;
      throw error;
    }
    return datos;
  }
  const api = {
    get: (url) => peticion('GET', url),
    post: (url, cuerpo) => peticion('POST', url, cuerpo),
    put: (url, cuerpo) => peticion('PUT', url, cuerpo),
    patch: (url, cuerpo) => peticion('PATCH', url, cuerpo),
    del: (url, cuerpo) => peticion('DELETE', url, cuerpo)
  };

  /* NOTIFICACIONES (toasts) */
  function notificar(tipo, mensaje, duracion = 4500) {
    let contenedor = document.getElementById('contenedor-toasts');
    if (!contenedor) {
      contenedor = document.createElement('div');
      contenedor.id = 'contenedor-toasts';
      document.body.appendChild(contenedor);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<p>${esc(mensaje)}</p>`;
    contenedor.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('saliendo');
      toast.addEventListener('animationend', () => toast.remove());
    }, duracion);
  }

  /* MODALES */
  function abrirModal(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    modal.classList.add('abierto');
    document.body.style.overflow = 'hidden';
    const primerCampo = modal.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    if (primerCampo) setTimeout(() => primerCampo.focus(), 150);
  }
  function cerrarModal(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    modal.classList.remove('abierto');
    if (!document.querySelector('.modal.abierto')) document.body.style.overflow = '';
  }
  // Cierre con botón [data-cerrar-modal], clic en el fondo o tecla Escape
  document.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-cerrar-modal]');
    if (boton) cerrarModal(boton.closest('.modal'));
    else if (evento.target.classList?.contains('modal') && !evento.target.dataset.fijo) cerrarModal(evento.target);
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      const abiertos = [...document.querySelectorAll('.modal.abierto')].filter((m) => !m.dataset.fijo);
      if (abiertos.length) cerrarModal(abiertos[abiertos.length - 1]);
    }
  });

  /** Crea un modal temporal de diálogo y lo elimina al cerrarse */
  function crearDialogo(html, { clase = 'estrecho' } = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-caja ${clase}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => abrirModal(modal));
    const observador = new MutationObserver(() => {
      if (!modal.classList.contains('abierto')) {
        observador.disconnect();
        setTimeout(() => modal.remove(), 300);
      }
    });
    observador.observe(modal, { attributes: true, attributeFilter: ['class'] });
    return modal;
  }

  /** Confirmación con promesa: resuelve true/false */
  function confirmar({ titulo = '¿Está seguro?', mensaje = '', textoConfirmar = 'Confirmar', peligro = false } = {}) {
    return new Promise((resolver) => {
      const modal = crearDialogo(`
        <div class="modal-cuerpo">
          <div class="texto-dialogo"><h4>${esc(titulo)}</h4><p>${esc(mensaje)}</p></div>
        </div>
        <div class="modal-pie">
          <button type="button" class="boton boton-secundario" data-respuesta="no">Cancelar</button>
          <button type="button" class="boton ${peligro ? 'boton-peligro' : 'boton-primario'}" data-respuesta="si">${esc(textoConfirmar)}</button>
        </div>`);
      let respondido = false;
      modal.addEventListener('click', (e) => {
        const b = e.target.closest('[data-respuesta]');
        if (!b) return;
        respondido = true;
        resolver(b.dataset.respuesta === 'si');
        cerrarModal(modal);
      });
      new MutationObserver((_, obs) => {
        if (!modal.classList.contains('abierto')) { obs.disconnect(); if (!respondido) resolver(false); }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /** Solicita un texto (por ejemplo, un motivo). Resuelve el texto o null */
  function pedirTexto({ titulo, mensaje = '', etiqueta = 'Detalle', minimo = 5, textoConfirmar = 'Aceptar', peligro = false } = {}) {
    return new Promise((resolver) => {
      const modal = crearDialogo(`
        <div class="modal-cabecera"><h3>${esc(titulo)}</h3><button type="button" class="modal-cerrar" data-cerrar-modal aria-label="Cerrar">&times;</button></div>
        <div class="modal-cuerpo">
          ${mensaje ? `<p class="texto-suave mb-2">${esc(mensaje)}</p>` : ''}
          <div class="campo"><label>${esc(etiqueta)} <span class="obligatorio">*</span></label><textarea maxlength="500" placeholder="Mínimo ${minimo} caracteres"></textarea></div>
        </div>
        <div class="modal-pie">
          <button type="button" class="boton boton-secundario" data-cerrar-modal>Cancelar</button>
          <button type="button" class="boton ${peligro ? 'boton-peligro' : 'boton-primario'}" data-aceptar>${esc(textoConfirmar)}</button>
        </div>`, { clase: '' });
      let respondido = false;
      const area = modal.querySelector('textarea');
      modal.querySelector('[data-aceptar]').addEventListener('click', () => {
        const valor = area.value.trim();
        if (valor.length < minimo) { notificar('alerta', `Ingrese al menos ${minimo} caracteres.`); area.focus(); return; }
        respondido = true;
        resolver(valor);
        cerrarModal(modal);
      });
      new MutationObserver((_, obs) => {
        if (!modal.classList.contains('abierto')) { obs.disconnect(); if (!respondido) resolver(null); }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* --------------------------------------------------------------------------
   * AYUDANTES DE INTERFAZ
   * ------------------------------------------------------------------------ */
  /** Activa/desactiva el estado "cargando" de un botón */
  function cargando(boton, activo) {
    if (!boton) return;
    boton.disabled = activo;
    boton.classList.toggle('cargando', activo);
  }
  /** Convierte un formulario en objeto (respeta inputs numéricos y checkboxes) */
  function datosFormulario(formulario) {
    const datos = {};
    for (const campo of formulario.elements) {
      if (!campo.name || campo.disabled) continue;
      if (campo.type === 'checkbox') datos[campo.name] = campo.checked;
      else if (campo.type === 'number') datos[campo.name] = campo.value === '' ? '' : Number(campo.value);
      else datos[campo.name] = campo.value.trim();
    }
    return datos;
  }
  /** Llena un formulario con un objeto */
  function llenarFormulario(formulario, datos) {
    for (const campo of formulario.elements) {
      if (!campo.name || !(campo.name in datos)) continue;
      if (campo.type === 'checkbox') campo.checked = Boolean(datos[campo.name]);
      else campo.value = datos[campo.name] ?? '';
    }
  }
  /** Fila de tabla "vacía" con mensaje */
  function filaVacia(columnas, mensaje = 'No hay registros para mostrar.') {
    return `<tr><td colspan="${columnas}"><div class="estado-vacio"><strong>Sin resultados</strong>${esc(mensaje)}</div></td></tr>`;
  }
  /** Fila de tabla "cargando" */
  function filaCargando(columnas) {
    return `<tr><td colspan="${columnas}"><div class="cargador">Cargando información...</div></td></tr>`;
  }
  /** Retrasa la ejecución (para búsquedas mientras se escribe) */
  function retrasar(funcion, espera = 350) {
    let temporizador;
    return (...args) => { clearTimeout(temporizador); temporizador = setTimeout(() => funcion(...args), espera); };
  }
  /** Activa un sistema de pestañas: botones [data-pestana] y paneles [data-panel] */
  function activarPestanas(contenedor = document, alCambiar) {
    contenedor.querySelectorAll('[data-pestana]').forEach((boton) => {
      boton.addEventListener('click', () => {
        const objetivo = boton.dataset.pestana;
        contenedor.querySelectorAll('[data-pestana]').forEach((b) => b.classList.toggle('activa', b === boton));
        contenedor.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('activo', p.dataset.panel === objetivo));
        if (alCambiar) alCambiar(objetivo);
      });
    });
  }
  /** Anima un número desde 0 hasta su valor */
  function animarNumero(elemento, valorFinal, formateador = (v) => numero(v, 0), duracion = 900) {
    if (!elemento) return;
    const inicio = performance.now();
    const paso = (ahora) => {
      const progreso = Math.min(1, (ahora - inicio) / duracion);
      const suavizado = 1 - Math.pow(1 - progreso, 3);
      elemento.textContent = formateador(valorFinal * suavizado);
      if (progreso < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  /** Parámetro de la URL */
  function parametroUrl(nombre) { return new URLSearchParams(window.location.search).get(nombre); }

  /* PLANTILLAS HTML EDITABLES
   * El TEXTO de los documentos vive en el HTML; aquí solo se rellenan datos:
   *   <span data-campo="cliente_nombre"></span>  -> se reemplaza por el valor
   *   <p data-si="desembolsado">...</p>           -> visible solo si el valor es verdadero
   *   <p data-no="desembolsado">...</p>           -> visible solo si el valor es falso
   *   <tbody data-lista="cuotas"><template><tr>...data-campo...</tr></template></tbody>
   *                                               -> repite la fila por cada elemento */
  function rellenarPlantilla(raiz, valores) {
    raiz.querySelectorAll('[data-campo]').forEach((elemento) => {
      if (elemento.closest('template')) return;
      const valor = valores[elemento.dataset.campo];
      elemento.textContent = valor === undefined || valor === null || valor === '' ? '—' : valor;
    });
    raiz.querySelectorAll('[data-si]').forEach((e) => { e.hidden = !valores[e.dataset.si]; });
    raiz.querySelectorAll('[data-no]').forEach((e) => { e.hidden = Boolean(valores[e.dataset.no]); });
    raiz.querySelectorAll('[data-clase]').forEach((e) => {
      const clase = valores[e.dataset.clase];
      if (clase) e.classList.add(...String(clase).split(' '));
    });
  }

  /** Repite la fila <template> de un contenedor [data-lista] por cada elemento */
  function rellenarLista(contenedor, filas) {
    const plantilla = contenedor.querySelector('template');
    contenedor.querySelectorAll(':scope > :not(template)').forEach((e) => e.remove());
    filas.forEach((fila) => {
      const copia = plantilla.content.cloneNode(true);
      const envoltura = document.createElement('div');
      envoltura.appendChild(copia);
      rellenarPlantilla(envoltura, fila);
      contenedor.append(...envoltura.childNodes);
    });
  }

  /*  SESIÓN Y ESTRUCTURA DEL PANEL */
  async function obtenerSesion() {
    try {
      const { usuario } = await api.get('/api/auth/sesion');
      return usuario;
    } catch (error) {
      window.location.href = '/?acceso=requerido#acceso';
      throw error;
    }
  }

  /** Cierra la sesión (con confirmación) y vuelve a la página de inicio */
  async function cerrarSesion(preguntar = true) {
    if (preguntar) {
      const ok = await confirmar({ titulo: 'Cerrar sesión', mensaje: '¿Desea salir del sistema? Podrá ingresar nuevamente con otro usuario.', textoConfirmar: 'Sí, cerrar sesión', peligro: true });
      if (!ok) return;
    }
    try { await api.post('/api/auth/logout'); } catch (e) { /* la sesión podría ya no existir */ }
    window.location.href = '/?sesion=cerrada#acceso';
  }

  /** Construye el menú lateral según el rol */
  function construirLateral(usuario) {
    const lateral = document.getElementById('barra-lateral');
    if (!lateral) return;
    const ruta = window.location.pathname;
    const elementos = (MENUS[usuario.rol] || []).map((item) => {
      if (item.titulo) return `<div class="menu-titulo">${esc(item.titulo)}</div>`;
      const activo = ruta === item.ruta || (item.alias || []).includes(ruta);
      return `<a href="${item.ruta}" class="${activo ? 'activo' : ''}" ${item.id ? `id="${item.id}"` : ''}><span>${esc(item.texto)}</span></a>`;
    }).join('');

    lateral.innerHTML = `
      <div class="marca">
        <div class="marca-logo">CM</div>
        <div class="marca-texto"><strong>CrediManager</strong><span>Core de Créditos</span></div>
      </div>
      <nav class="menu" aria-label="Menú principal">${elementos}</nav>
      <div class="lateral-pie">
        <div class="tarjeta-sesion">
          <div class="avatar">${esc(iniciales(usuario.nombre))}</div>
          <div class="datos"><strong title="${esc(usuario.nombre)}">${esc(usuario.nombre)}</strong><span>${esc(usuario.rol_nombre)}</span></div>
        </div>
        <button type="button" class="boton-salir" id="boton-salir-lateral">Cerrar sesión</button>
      </div>`;
    document.getElementById('boton-salir-lateral').addEventListener('click', () => cerrarSesion());

    if (!document.querySelector('.velo-lateral')) {
      const velo = document.createElement('div');
      velo.className = 'velo-lateral';
      velo.addEventListener('click', () => document.body.classList.remove('menu-abierto'));
      document.body.appendChild(velo);
    }
  }

  /** Construye la barra superior (saludo, rol, reloj y menú de usuario) */
  function construirSuperior(usuario) {
    const barra = document.getElementById('barra-superior');
    if (!barra) return;
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    const primerNombre = esc(String(usuario.nombre).split(' ')[0]);
    const enlacePerfil = usuario.rol === 'CLIENTE'
      ? `<a href="/app/portal">Mi resumen</a>`
      : `<a href="/app/perfil">Mi perfil</a>`;

    barra.innerHTML = `
      <button type="button" class="boton-menu" id="boton-menu" aria-label="Abrir menú">Menú</button>
      <div class="saludo"><strong>${saludo}, ${primerNombre}</strong><span id="fecha-actual">${esc(fechaLarga())}</span></div>
      <div class="derecha">
        <span class="chip-reloj"><span id="reloj">--:--</span></span>
        <span class="chip-rol">${esc(usuario.rol_nombre)}</span>
        <div class="menu-usuario" id="menu-usuario">
          <button type="button" aria-label="Menú de usuario"><div class="avatar">${esc(iniciales(usuario.nombre))}</div></button>
          <div class="desplegable">
            <div class="cabecera"><strong>${esc(usuario.nombre)}</strong><span>@${esc(usuario.login)} · ${esc(usuario.rol_nombre)}</span></div>
            ${enlacePerfil}
            <a href="/app/cambiar-clave">Cambiar contraseña</a>
            <button type="button" class="peligro" id="boton-salir-superior">Cerrar sesión</button>
          </div>
        </div>
      </div>`;

    document.getElementById('boton-menu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));
    const menuUsuario = document.getElementById('menu-usuario');
    menuUsuario.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); menuUsuario.classList.toggle('abierto'); });
    document.addEventListener('click', () => menuUsuario.classList.remove('abierto'));
    document.getElementById('boton-salir-superior').addEventListener('click', () => cerrarSesion());

    const reloj = document.getElementById('reloj');
    const actualizarReloj = () => { reloj.textContent = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }); };
    actualizarReloj();
    setInterval(actualizarReloj, 30000);
  }

  /** Pie de página del panel */
  function construirPie() {
    const principal = document.querySelector('.app-principal');
    if (principal && !principal.querySelector('.pie-panel')) {
      const pie = document.createElement('footer');
      pie.className = 'pie-panel';
      pie.textContent = `© ${new Date().getFullYear()} CrediManager S.A. · Sistema de Gestión de Créditos · Conexión segura`;
      principal.appendChild(pie);
    }
  }

  /* Punto de entrada de cada panel: valida la sesión, dibuja la estructura y
   * devuelve el usuario autenticado.*/
  async function iniciar() {
    const usuario = await obtenerSesion();
    if (usuario.debe_cambiar_clave && window.location.pathname !== '/app/cambiar-clave') {
      window.location.href = '/app/cambiar-clave';
      return new Promise(() => {});
    }
    App.usuario = usuario;
    construirLateral(usuario);
    construirSuperior(usuario);
    construirPie();
    // Protección extra: si el usuario regresa con "Atrás" tras cerrar sesión, se recarga
    window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });
    return usuario;
  }

  /** Para documentos imprimibles: solo valida la sesión */
  async function iniciarDocumento() {
    const usuario = await obtenerSesion();
    App.usuario = usuario;
    document.querySelectorAll('[data-imprimir]').forEach((b) => b.addEventListener('click', () => window.print()));
    document.querySelectorAll('[data-volver]').forEach((b) => b.addEventListener('click', () => {
      if (window.history.length > 1) window.history.back(); else window.close();
    }));
    return usuario;
  }

  /*  API PÚBLICA */
  const App = {
    usuario: null,
    iniciar,
    iniciarDocumento,
    cerrarSesion,
    api,
    esc,
    moneda,
    numero,
    fecha,
    fechaHora,
    fechaLarga,
    porcentaje,
    iniciales,
    hoyISO,
    insignia,
    etiquetaEstado,
    lineaTiempoSolicitud,
    notificar,
    confirmar,
    pedirTexto,
    abrirModal,
    cerrarModal,
    crearDialogo,
    cargando,
    datosFormulario,
    llenarFormulario,
    filaVacia,
    filaCargando,
    retrasar,
    activarPestanas,
    animarNumero,
    parametroUrl,
    rellenarPlantilla,
    rellenarLista
  };
  window.App = App;
})();

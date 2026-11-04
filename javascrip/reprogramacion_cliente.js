/* PORTAL DEL CLIENTE - SOLICITUD DE REPROGRAMACIÓN DE CRÉDITO
   ----------------------------------------------------------------------------
   En cada tarjeta de crédito (contenedor [data-reprogramacion="ID"] que dibuja
   cliente_panel.js) muestra, según la elegibilidad calculada por el servidor:
     - Botón "Solicitar reprogramación"  -> menos de 3 cuotas vencidas y menos de 90 días.
     - Botón deshabilitado + aviso        -> supera el límite: debe acudir a la agencia.
     - Estado de la solicitud en curso, rechazada o aprobada (con su Adenda).
   El modal envía: motivo, propuesta (plazo o cuota máxima) y adjuntos (base64). */
(function () {
  'use strict';

  /** Límites de los adjuntos (el servidor vuelve a validarlos) */
  const MAX_ADJUNTOS = 3;
  const MAX_BYTES = 2 * 1024 * 1024;
  const TIPOS = ['application/pdf', 'image/jpeg', 'image/png'];

  let creditos = [];        // respuesta de /api/reprogramaciones/mis-creditos
  let actual = null;        // crédito del modal abierto
  let archivos = [];        // archivos seleccionados (File)
  let modalListo = false;

  /* ---------------- Estado de cada crédito ---------------- */
  async function iniciar() {
    try {
      creditos = await App.api.get('/api/reprogramaciones/mis-creditos');
    } catch (error) {
      return; // Si falla, el portal sigue funcionando sin la opción de reprogramar
    }
    creditos.forEach(pintarZona);
    if (!modalListo) prepararModal();
  }

  /** Agrega la insignia "Reprogramado" junto a la situación del crédito */
  function marcarReprogramado(tarjeta) {
    const cabecera = tarjeta?.querySelector('.cabecera');
    if (!cabecera || cabecera.querySelector('.grupo-insignias')) return;
    const insigniaActual = cabecera.querySelector(':scope > .insignia');
    if (!insigniaActual) return;
    const grupo = document.createElement('div');
    grupo.className = 'grupo-insignias';
    insigniaActual.replaceWith(grupo);
    grupo.append(insigniaActual);
    grupo.insertAdjacentHTML('beforeend', App.insignia('REPROGRAMADO'));
  }

  function pintarZona(info) {
    const zona = document.querySelector(`[data-reprogramacion="${info.id_credito}"]`);
    if (!zona) return;
    if (info.reprogramado) marcarReprogramado(zona.closest('.credito-cliente'));

    const { elegibilidad: e, en_curso: enCurso, ultima } = info;
    let html = '';
    if (enCurso) {
      html = `
        <div class="aviso info">
          <div><strong>Solicitud de reprogramación ${App.esc(enCurso.codigo)}</strong> ${App.insignia(enCurso.estado)}<br>
          Enviada el ${App.fechaHora(enCurso.fecha_solicitud)}. ${enCurso.estado === 'PENDIENTE_EVALUACION'
            ? 'Su Oficial de Crédito está evaluando su caso.'
            : 'El Jefe de Crédito está revisando la propuesta de su Oficial.'}</div>
        </div>`;
    } else if (e.elegible) {
      const rechazo = ultima?.estado === 'RECHAZADA'
        ? `<br><span class="texto-chico">Su solicitud anterior ${App.esc(ultima.codigo)} fue rechazada: ${App.esc(ultima.observacion_resolucion || '')}</span>` : '';
      html = `
        <div class="aviso alerta">
          <div><strong>¿Tiene dificultades para pagar?</strong> Registra ${e.cuotas_vencidas} cuota(s) vencida(s) (${e.dias_mora} días de mora).
          Puede solicitar la reprogramación de su crédito para ponerse al día.${rechazo}</div>
          <button type="button" class="boton boton-primario boton-sm" data-solicitar-reprogramacion="${info.id_credito}">Solicitar reprogramación</button>
        </div>`;
    } else if (e.codigo === 'EXCEDE_LIMITE') {
      html = `
        <div class="aviso peligro">
          <div><strong>Reprogramación no disponible en línea.</strong> ${App.esc(e.mensaje)}</div>
          <button type="button" class="boton boton-secundario boton-sm" disabled title="Acuda a su agencia">Solicitar reprogramación</button>
        </div>`;
    } else if (ultima?.estado === 'APROBADA') {
      html = `
        <div class="aviso exito">
          <div><strong>Crédito reprogramado</strong> el ${App.fecha(ultima.fecha_resolucion)} (Adenda ${App.esc(ultima.numero_adenda)}).
          Nueva cuota: <strong>${App.moneda(ultima.nueva_cuota)}</strong> en ${ultima.nuevo_plazo} meses.</div>
          <div class="grupo-botones">
            <a class="boton boton-secundario boton-sm" href="/app/adenda?id=${ultima.id_reprogramacion}" target="_blank" rel="noopener">Ver adenda</a>
            <a class="boton boton-secundario boton-sm" href="/app/cronograma?id=${info.id_credito}" target="_blank" rel="noopener">Nuevo cronograma</a>
          </div>
        </div>`;
    }
    zona.innerHTML = html;
    zona.hidden = !html;
  }

  /* ---------------- Modal ---------------- */
  function prepararModal() {
    modalListo = true;
    const formulario = document.getElementById('formulario-reprogramacion');
    const tipo = document.getElementById('tipo-propuesta');
    const motivo = document.getElementById('motivo-reprogramacion');
    const entradaArchivos = document.getElementById('adjuntos-reprogramacion');

    // Abrir desde el botón de cada crédito
    document.getElementById('lista-creditos').addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-solicitar-reprogramacion]');
      if (boton) abrir(Number(boton.dataset.solicitarReprogramacion));
    });

    tipo.addEventListener('change', configurarPropuesta);
    motivo.addEventListener('input', () => {
      const n = motivo.value.trim().length;
      document.getElementById('contador-motivo').textContent = n < 20 ? `Mínimo 20 caracteres (${n}/20).` : `${n}/1000 caracteres.`;
    });

    entradaArchivos.addEventListener('change', () => {
      for (const archivo of entradaArchivos.files) {
        if (archivos.length >= MAX_ADJUNTOS) { App.notificar('alerta', `Puede adjuntar como máximo ${MAX_ADJUNTOS} archivos.`); break; }
        if (!TIPOS.includes(archivo.type)) { App.notificar('alerta', `"${archivo.name}" no es PDF, JPG ni PNG.`); continue; }
        if (archivo.size > MAX_BYTES) { App.notificar('alerta', `"${archivo.name}" supera los 2 MB.`); continue; }
        archivos.push(archivo);
      }
      entradaArchivos.value = '';
      pintarArchivos();
    });
    document.getElementById('lista-adjuntos-cliente').addEventListener('click', (evento) => {
      const quitar = evento.target.closest('[data-quitar]');
      if (!quitar) return;
      archivos.splice(Number(quitar.dataset.quitar), 1);
      pintarArchivos();
    });

    formulario.addEventListener('submit', enviar);
  }

  function abrir(idCredito) {
    actual = creditos.find((c) => c.id_credito === idCredito);
    if (!actual) return;
    const formulario = document.getElementById('formulario-reprogramacion');
    formulario.reset();
    archivos = [];
    pintarArchivos();
    document.getElementById('contador-motivo').textContent = 'Mínimo 20 caracteres.';
    document.getElementById('titulo-reprogramacion').textContent = `Solicitar reprogramación · ${actual.numero_credito}`;
    const e = actual.elegibilidad;
    document.getElementById('resumen-reprogramacion').innerHTML = `
      <div><span>Cuotas vencidas</span><strong class="texto-peligro">${e.cuotas_vencidas}</strong></div>
      <div><span>Días de mora</span><strong>${e.dias_mora}</strong></div>
      <div><span>Monto vencido hoy</span><strong>${App.moneda(e.monto_vencido)}</strong></div>
      <div><span>Saldo de capital</span><strong>${App.moneda(actual.saldo_capital)}</strong></div>
      <div><span>Cuota actual</span><strong>${App.moneda(actual.cuota_mensual)}</strong></div>`;
    configurarPropuesta();
    App.abrirModal('modal-reprogramacion');
  }

  /** Cambia etiqueta y límites del campo según la propuesta elegida */
  function configurarPropuesta() {
    const esPlazo = document.getElementById('tipo-propuesta').value === 'PLAZO';
    const valor = document.getElementById('valor-propuesta');
    document.getElementById('etiqueta-propuesta').innerHTML = `${esPlazo ? 'Plazo propuesto (meses)' : 'Cuota máxima mensual (Bs)'} <span class="obligatorio">*</span>`;
    valor.value = '';
    valor.min = 1;
    valor.step = esPlazo ? 1 : 0.01;
    valor.max = esPlazo ? actual?.plazo_maximo || 120 : '';
    document.getElementById('ayuda-propuesta').textContent = esPlazo
      ? `Entre 1 y ${actual?.plazo_maximo || 120} meses para las cuotas pendientes.`
      : 'Monto que puede pagar cada mes; el Oficial calculará el plazo necesario.';
  }

  function pintarArchivos() {
    const lista = document.getElementById('lista-adjuntos-cliente');
    lista.innerHTML = archivos.map((a, i) => `
      <li><span>${App.esc(a.name)} <small class="texto-suave">(${App.numero(a.size / 1024, 0)} KB)</small></span>
        <button type="button" class="boton boton-fantasma boton-sm" data-quitar="${i}">Quitar</button></li>`).join('');
  }

  /** Lee un archivo como base64 (sin el prefijo data:) */
  function leerBase64(archivo) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result).split(',')[1] || '');
      lector.onerror = () => rechazar(new Error(`No se pudo leer el archivo "${archivo.name}".`));
      lector.readAsDataURL(archivo);
    });
  }

  async function enviar(evento) {
    evento.preventDefault();
    const formulario = evento.target;
    const motivo = formulario.elements.motivo.value.trim();
    if (motivo.length < 20) {
      App.notificar('alerta', 'Explique el motivo de la mora con al menos 20 caracteres.');
      formulario.elements.motivo.focus();
      return;
    }
    if (!formulario.reportValidity()) return;

    const tipo = formulario.elements.tipo_propuesta.value;
    const valor = Number(formulario.elements.valor_propuesta.value);
    const boton = document.getElementById('boton-enviar-reprogramacion');
    App.cargando(boton, true);
    try {
      const adjuntos = await Promise.all(archivos.map(async (a) => ({ nombre: a.name, tipo: a.type, datos: await leerBase64(a) })));
      const r = await App.api.post('/api/reprogramaciones', {
        id_credito: actual.id_credito,
        motivo,
        tipo_propuesta: tipo,
        propuesta_plazo: tipo === 'PLAZO' ? valor : null,
        propuesta_cuota: tipo === 'CUOTA' ? valor : null,
        adjuntos
      });
      App.cerrarModal('modal-reprogramacion');
      App.notificar('exito', r.mensaje, 7000);
      await iniciar();
    } catch (error) {
      App.notificar('error', error.message, 7000);
    } finally {
      App.cargando(boton, false);
    }
  }

  window.ReprogramacionCliente = { iniciar };
})();

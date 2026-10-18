document.addEventListener('DOMContentLoaded', async () => {
    // 1. Obtener el ID de la solicitud desde los parámetros de la URL (ej: ?id=1)
    const urlParams = new URLSearchParams(window.location.search);
    const idSolicitud = urlParams.get('id') || 1;

    // 2. Obtener datos del usuario logueado desde localStorage
    const usuarioLogueado = JSON.parse(localStorage.getItem('usuarioLogueado') || '{}');
    const limiteUsuario = usuarioLogueado.limite_aprobacion ? parseFloat(usuarioLogueado.limite_aprobacion) : 50000.00;

    // Actualizar sidebar si existen datos en la sesión
    if (usuarioLogueado.nombre) {
        const sidebarNombre = document.querySelector('.nombre-usuario');
        const sidebarAvatar = document.querySelector('.avatar-usuario');
        if (sidebarNombre) sidebarNombre.textContent = usuarioLogueado.nombre;
        if (sidebarAvatar) {
            sidebarAvatar.textContent = usuarioLogueado.nombre
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
        }
    }

    // Referencias a contenedores de vistas principales
    const seccionEvaluacionActiva = document.getElementById('seccion-evaluacion-activa');
    const seccionResultadoAprobado = document.getElementById('seccion-resultado-aprobado');
    const seccionResultadoRechazado = document.getElementById('seccion-resultado-rechazado');
    const migaPan = document.getElementById('miga-solicitud');

    const zonaAvisos = document.getElementById('zona-de-avisos');
    const btnAprobar = document.getElementById('btn-accion-aprobar');
    const btnRechazar = document.getElementById('btn-accion-rechazar');

    // Referencias del Modal Flotante de Aprobación
    const modalConfirmacion = document.getElementById('modal-confirmar-aprobacion');
    const modalTextoDesc = document.getElementById('modal-texto-descripcion');
    const modalBtnCancelar = document.getElementById('modal-btn-cancelar');
    const modalBtnConfirmar = document.getElementById('modal-btn-confirmar');

    // Referencias del Modal Flotante de Rechazo
    const modalRechazo = document.getElementById('modal-confirmar-rechazo');
    const modalRechazoTitulo = document.getElementById('modal-rechazo-titulo');
    const textareaMotivo = document.getElementById('textarea-motivo-rechazo');
    const modalRechazoCancelar = document.getElementById('modal-rechazo-btn-cancelar');
    const modalRechazoConfirmar = document.getElementById('modal-rechazo-btn-confirmar');

    let montoActualSolicitud = 0;
    let plazoActualSolicitud = 12;

    try {
        // 3. Consultar los datos de la solicitud y evaluación al servidor
        const respuesta = await fetch(`/api/solicitudes/detalle-evaluacion/${idSolicitud}`);
        const data = await respuesta.json();

        if (!respuesta.ok) {
            alert('No se pudo cargar el detalle de la solicitud.');
            return;
        }

        const estadoActual = (data.estado || 'EN_EVALUACION').toUpperCase();
        montoActualSolicitud = parseFloat(data.monto_solicitado || 0);
        plazoActualSolicitud = parseInt(data.plazo_meses || 12);

        // ======================================================= //
        // CASO A: SOLICITUD APROBADA -> MOSTRAR PANTALLA ÉXITO    //
        // ======================================================= //
        if (estadoActual === 'APROBADA') {
            if (seccionEvaluacionActiva) seccionEvaluacionActiva.style.display = 'none';
            if (seccionResultadoAprobado) seccionResultadoAprobado.style.display = 'block';
            if (seccionResultadoRechazado) seccionResultadoRechazado.style.display = 'none';
            if (migaPan) migaPan.textContent = `Solicitud ${idSolicitud} / Resultado`;

            // Llenar datos de aprobación
            document.getElementById('res-id-solicitud').textContent = idSolicitud;
            const codCredito = data.codigo_credito || `CR-2025-${String(idSolicitud).padStart(4, '0')}`;
            const codContrato = data.codigo_contrato || `CT-2025-${String(idSolicitud).padStart(4, '0')}`;

            document.getElementById('res-cod-credito').textContent = codCredito;
            document.getElementById('res-val-credito').textContent = codCredito;
            document.getElementById('res-val-contrato').textContent = `${codContrato} generado`;

            // Calcular Cronograma de Pagos (Sistema Francés)[cite: 5]
            const tasaAnual = 0.12; // 12% Anual
            const tasaMensual = tasaAnual / 12;
            const cuotaFija = montoActualSolicitud * (tasaMensual * Math.pow(1 + tasaMensual, plazoActualSolicitud)) / (Math.pow(1 + tasaMensual, plazoActualSolicitud) - 1);

            let saldo = montoActualSolicitud;
            const tbodyCronograma = document.getElementById('tabla-cuerpo-cronograma');
            tbodyCronograma.innerHTML = '';

            let fechaBase = new Date(2025, 10, 6); // Fecha base de referencia[cite: 5]

            // Bucle actualizado para mostrar TODAS las cuotas correspondientes al plazo[cite: 5]
            for (let i = 1; i <= plazoActualSolicitud; i++) {
                let interes = saldo * tasaMensual;
                let capital = cuotaFija - interes;
                saldo -= capital;

                let fechaVenc = new Date(fechaBase);
                fechaVenc.setMonth(fechaVenc.getMonth() + i);
                let fechaStr = fechaVenc.toISOString().split('T')[0];

                tbodyCronograma.innerHTML += `
                    <tr>
                        <td style="padding: 0.85rem 1rem;">${i}</td>
                        <td style="padding: 0.85rem 1rem;">${fechaStr}</td>
                        <td style="padding: 0.85rem 1rem;">${capital.toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding: 0.85rem 1rem;">${interes.toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding: 0.85rem 1rem; color: #2563eb; font-weight: 600;">Bs ${cuotaFija.toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td style="padding: 0.85rem 1rem;">${(saldo > 0 ? saldo : 0).toLocaleString('es-BO', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    </tr>
                `;
            }

            document.getElementById('res-texto-cuotas-extra').textContent = `Cronograma completo generado con éxito para los ${plazoActualSolicitud} meses del crédito.`;

            return; 
        }

        // ======================================================= //
        // CASO B: SOLICITUD RECHAZADA -> MOSTRAR PANTALLA RECHAZO //
        // ======================================================= //
        if (estadoActual === 'RECHAZADA') {
            if (seccionEvaluacionActiva) seccionEvaluacionActiva.style.display = 'none';
            if (seccionResultadoAprobado) seccionResultadoAprobado.style.display = 'none';
            if (seccionResultadoRechazado) seccionResultadoRechazado.style.display = 'block';
            if (migaPan) migaPan.textContent = `Solicitud ${idSolicitud} / Resultado`;

            document.getElementById('res-rej-id-solicitud').textContent = idSolicitud;
            document.getElementById('res-val-motivo').textContent = data.motivo_rechazo || 'No se especificó un motivo de rechazo.';
            
            return; 
        }

        // ======================================================= //
        // CASO C: SOLICITUD EN EVALUACIÓN -> VISTA DE TRABAJO     //
        // ======================================================= //
        if (seccionEvaluacionActiva) seccionEvaluacionActiva.style.display = 'block';
        if (seccionResultadoAprobado) seccionResultadoAprobado.style.display = 'none';
        if (seccionResultadoRechazado) seccionResultadoRechazado.style.display = 'none';

        document.getElementById('det-titulo').textContent = `Solicitud N° ${data.id_solicitud || idSolicitud}`;
        document.getElementById('miga-solicitud').textContent = `Solicitud ${data.id_solicitud || idSolicitud}`;
        document.getElementById('det-badge-estado').textContent = estadoActual;
        document.getElementById('det-fechas-info').textContent = `Registrada el ${data.fecha_solicitud || '2026-10-18'} · evaluada el ${data.fecha_evaluacion || '2026-10-18'}`;

        document.getElementById('det-cliente-nombre').textContent = data.cliente_nombre || 'Cliente del Sistema';
        document.getElementById('det-cliente-ci-tel').textContent = `CI ${data.cliente_ci || 'S/N'} · Tel. ${data.cliente_telefono || 'S/N'}`;
        document.getElementById('det-cliente-ingresos').textContent = `Bs ${Number(data.cliente_ingresos || 0).toFixed(2)}`;

        document.getElementById('det-solicitud-monto').textContent = `Bs ${montoActualSolicitud.toLocaleString('es-BO', {minimumFractionDigits: 2})}`;
        document.getElementById('det-solicitud-plazo-destino').textContent = `${plazoActualSolicitud} meses · ${data.destino || 'Capital de trabajo'}`;
        document.getElementById('det-limite-aprobacion').textContent = `Bs ${limiteUsuario.toLocaleString('es-BO', {minimumFractionDigits: 2})}`;

        // Llenar datos técnicos de la evaluación
        document.getElementById('eval-ingresos').textContent = Number(data.eval_ingresos || data.cliente_ingresos || 0).toFixed(2);
        document.getElementById('eval-gastos').textContent = Number(data.eval_gastos || 0).toFixed(2);
        document.getElementById('eval-capacidad').textContent = Number(data.eval_capacidad || 0).toFixed(2);
        document.getElementById('eval-riesgo').textContent = data.eval_riesgo || 'MEDIO';

        const resultadoEvaluacion = (data.eval_resultado || 'FAVORABLE').toUpperCase();
        document.getElementById('eval-resultado').textContent = resultadoEvaluacion;

        // 4. Validar Reglas de Negocio (RN03 y RN04)
        zonaAvisos.innerHTML = '';
        zonaAvisos.className = 'zona-avisos';

        let sePuedeAprobar = true;
        let htmlAlertas = '';

        if (resultadoEvaluacion === 'DESFAVORABLE') {
            sePuedeAprobar = false;
            htmlAlertas += `
                <div class="alerta-desfavorable-box">
                    <span>✕ No se puede aprobar: la evaluación es DESFAVORABLE.</span>
                    <span class="codigo-traza-alerta">RN03 · rama [desfavorable] M6</span>
                </div>
            `;
        }

        if (montoActualSolicitud > limiteUsuario) {
            sePuedeAprobar = false;
            htmlAlertas += `
                <div class="alerta-limite-box">
                    <span>! El monto Bs ${montoActualSolicitud.toLocaleString('es-BO', {minimumFractionDigits: 2})} supera su límite de aprobación.</span>
                    <span class="codigo-traza-alerta">RN04 · rama [sin atribución] M9</span>
                </div>
            `;
        }

        if (!sePuedeAprobar) {
            zonaAvisos.classList.add('tiene-alertas');
            zonaAvisos.innerHTML = htmlAlertas;
            btnAprobar.disabled = true;
            btnAprobar.title = 'No cumple con las condiciones requeridas para ser aprobada.';
        } else {
            zonaAvisos.textContent = 'Zona de avisos: aparece solo si no se puede aprobar';
            btnAprobar.disabled = false;
        }

    } catch (e) {
        console.error('Error al conectar con el servidor:', e);
    }

    // 5. Gestión del Botón Aprobar
    if (btnAprobar) {
        btnAprobar.addEventListener('click', () => {
            const montoFormateado = montoActualSolicitud.toLocaleString('es-BO', {minimumFractionDigits: 2});
            if (modalTextoDesc) {
                modalTextoDesc.innerHTML = `Se aprobará la solicitud <strong>${idSolicitud}</strong> por <strong>Bs ${montoFormateado}</strong> a <strong>${plazoActualSolicitud} meses</strong>. Se crearán el crédito, el contrato y el cronograma de cuotas[cite: 5].`;
            }
            if (modalConfirmacion) modalConfirmacion.style.display = 'flex';
        });
    }

    if (modalBtnCancelar) {
        modalBtnCancelar.addEventListener('click', () => {
            if (modalConfirmacion) modalConfirmacion.style.display = 'none';
        });
    }

    if (modalBtnConfirmar) {
        modalBtnConfirmar.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/solicitudes/cambiar-estado', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_solicitud: parseInt(idSolicitud), nuevo_estado: 'APROBADA' })
                });

                if (res.ok) {
                    modalConfirmacion.style.display = 'none';
                    window.location.href = `detalle_evaluacion.html?id=${idSolicitud}`;
                } else {
                    alert('Error al registrar la aprobación.');
                }
            } catch (err) {
                alert('No se pudo conectar con el servidor.');
            }
        });
    }

    // 6. Gestión del Botón Rechazar
    if (btnRechazar) {
        btnRechazar.addEventListener('click', () => {
            if (modalRechazoTitulo) modalRechazoTitulo.textContent = `Rechazar solicitud ${idSolicitud}`;
            if (textareaMotivo) textareaMotivo.value = '';
            if (modalRechazo) modalRechazo.style.display = 'flex';
        });
    }

    if (modalRechazoCancelar) {
        modalRechazoCancelar.addEventListener('click', () => {
            if (modalRechazo) modalRechazo.style.display = 'none';
        });
    }

    if (modalRechazoConfirmar) {
        modalRechazoConfirmar.addEventListener('click', async () => {
            const motivoTexto = textareaMotivo.value.trim();
            
            if (!motivoTexto) {
                alert('Debe ingresar obligatoriamente el motivo del rechazo.');
                textareaMotivo.focus();
                return;
            }

            try {
                const datosAEnviar = { 
                    id_solicitud: parseInt(idSolicitud), 
                    nuevo_estado: 'RECHAZADA', 
                    motivo_rechazo: motivoTexto 
                };

                const res = await fetch('/api/solicitudes/cambiar-estado', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datosAEnviar)
                });

                if (res.ok) {
                    modalRechazo.style.display = 'none';
                    window.location.href = `detalle_evaluacion.html?id=${idSolicitud}`;
                } else {
                    alert('Error al registrar el rechazo en el servidor.');
                }
            } catch (err) {
                console.error('Error de conexión:', err);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }
});
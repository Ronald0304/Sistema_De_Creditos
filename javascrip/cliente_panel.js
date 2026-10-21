document.addEventListener('DOMContentLoaded', () => {
    // 1. Leer la clave CORRECTA 'usuarioLogueado' desde LocalStorage o SessionStorage
    const usuarioLogueadoStr = localStorage.getItem('usuarioLogueado') || sessionStorage.getItem('usuarioLogueado');
    
    if (!usuarioLogueadoStr) {
        alert('Debe iniciar sesión para acceder al panel de cliente.');
        window.location.href = 'login.html';
        return;
    }

    const usuarioLogueado = JSON.parse(usuarioLogueadoStr);

    // Obtener el ID del cliente de forma segura (sea id_cliente o id)
    const idCliente = usuarioLogueado.id_cliente || usuarioLogueado.id;

    if (!idCliente) {
        alert('No se pudo identificar al cliente en la sesión active.');
        window.location.href = 'login.html';
        return;
    }

    // Si es su primer login (primer_login === 1), forzar modal de cambio de contraseña
    const modalClave = document.getElementById('modal-cambiar-clave');
    if (usuarioLogueado.primer_login === 1 && modalClave) {
        modalClave.style.display = 'flex';
    }

    // Elementos del DOM para el perfil
    const clienteInicialesEl = document.getElementById('cliente-iniciales');
    const clienteNombreMenuEl = document.getElementById('cliente-nombre-menu');
    
    const perfilNombresEl = document.getElementById('perfil-nombres');
    const perfilCiEl = document.getElementById('perfil-ci');
    const perfilTelefonoEl = document.getElementById('perfil-telefono');
    const perfilDireccionEl = document.getElementById('perfil-direccion');
    const perfilIngresosEl = document.getElementById('perfil-ingresos');

    // Tablas del DOM
    const tablaSolicitudesCuerpo = document.getElementById('tabla-solicitudes-cuerpo');
    const tablaPagosCuerpo = document.getElementById('tabla-pagos-cuerpo');

    // ==========================================
    // 2. NAVEGACIÓN INTERACTIVA DEL MENÚ LATERAL
    // ==========================================
    const navItems = document.querySelectorAll('.nav-item');
    const secciones = document.querySelectorAll('.seccion-panel');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            navItems.forEach(nav => nav.classList.remove('activo'));
            secciones.forEach(sec => sec.style.display = 'none');

            item.classList.add('activo');
            const idSeccion = item.getAttribute('data-seccion');
            const seccionMostrar = document.getElementById(idSeccion);
            if (seccionMostrar) {
                seccionMostrar.style.display = 'block';
            }
        });
    });

    // ==========================================
    // 3. GESTIÓN DE SESIÓN Y CONTRASEÑA
    // ==========================================
    const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            sessionStorage.clear();
            localStorage.clear();
            window.location.href = 'login.html';
        });
    }

    const btnAbrirModalClave = document.getElementById('btn-abrir-modal-clave');
    const modalClaveCerrar = document.getElementById('modal-clave-cerrar');
    const modalClaveCancelar = document.getElementById('modal-clave-cancelar');
    const formCambiarClave = document.getElementById('form-cambiar-clave');

    if (btnAbrirModalClave) {
        btnAbrirModalClave.addEventListener('click', () => {
            if (modalClave) modalClave.style.display = 'flex';
        });
    }

    const cerrarModalSeguridad = () => {
        if (usuarioLogueado.primer_login !== 1) {
            if (modalClave) modalClave.style.display = 'none';
        } else {
            alert('Debes cambiar tu contraseña predeterminada para continuar.');
        }
    };

    if (modalClaveCerrar) modalClaveCerrar.addEventListener('click', cerrarModalSeguridad);
    if (modalClaveCancelar) modalClaveCancelar.addEventListener('click', cerrarModalSeguridad);

    if (formCambiarClave) {
        formCambiarClave.addEventListener('submit', async (e) => {
            e.preventDefault();
            const clave_actual = document.getElementById('clave-actual').value;
            const clave_nueva = document.getElementById('clave-nueva').value;

            try {
                const respuesta = await fetch('/api/clientesp/cambiar-clave', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_cliente: idCliente, clave_actual, clave_nueva })
                });
                const data = await respuesta.json();

                if (!respuesta.ok) {
                    alert(data.error || 'Error al cambiar la contraseña');
                    return;
                }

                alert('¡Contraseña actualizada con éxito! Por seguridad, vuelve a iniciar sesión con tu nueva clave.');
                sessionStorage.clear();
                localStorage.clear();
                window.location.href = 'login.html';

            } catch (error) {
                console.error('Error:', error);
                alert('Error de conexión con el servidor.');
            }
        });
    }

    // ==========================================
    // 4. CARGAR DATOS PERSONALES DEL CLIENTE
    // ==========================================
    async function cargarDatosPersonales() {
        try {
            const respuesta = await fetch(`/api/clientesp/perfil/${idCliente}`);
            if (!respuesta.ok) throw new Error('No se pudo obtener la información del cliente.');
            
            const cliente = await respuesta.json();

            // Formatear Iniciales y Nombre
            const iniciales = ((cliente.nombres ? cliente.nombres[0] : '') + (cliente.apellidos ? cliente.apellidos[0] : '')).toUpperCase();
            if (clienteInicialesEl) clienteInicialesEl.textContent = iniciales || 'CL';
            if (clienteNombreMenuEl) clienteNombreMenuEl.textContent = `${cliente.nombres} ${cliente.apellidos}`;

            // Llenar datos de perfil en pantalla
            if (perfilNombresEl) perfilNombresEl.textContent = `${cliente.nombres} ${cliente.apellidos}`;
            if (perfilCiEl) perfilCiEl.textContent = cliente.ci || '---';
            if (perfilTelefonoEl) perfilTelefonoEl.textContent = cliente.telefono || 'Sin registrar';
            if (perfilDireccionEl) perfilDireccionEl.textContent = cliente.direccion || 'Sin registrar';
            if (perfilIngresosEl) {
                const montoFormat = Number(cliente.ingresos_mensuales || 0).toLocaleString('es-BO', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                perfilIngresosEl.textContent = `Bs. ${montoFormat}`;
            }

        } catch (error) {
            console.error('Error al cargar perfil:', error);
        }
    }

    // ==========================================
    // 5. CARGAR SOLICITUDES DE CRÉDITO
    // ==========================================
    async function cargarMisSolicitudes() {
        try {
            const respuesta = await fetch(`/api/clientesp/solicitudes/${idCliente}`);
            const solicitudes = await respuesta.json();

            if (!respuesta.ok || !solicitudes || solicitudes.length === 0) {
                if (tablaSolicitudesCuerpo) {
                    tablaSolicitudesCuerpo.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">
                                No tienes solicitudes de crédito registradas actualmente.
                            </td>
                        </tr>
                    `;
                }
                return;
            }

            if (!tablaSolicitudesCuerpo) return;
            tablaSolicitudesCuerpo.innerHTML = '';

            solicitudes.forEach(sol => {
                const tr = document.createElement('tr');

                const montoFormateado = Number(sol.monto_solicitado).toLocaleString('es-BO', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

                let badgeClase = 'badge-registrada';
                let estadoTexto = sol.estado;

                switch (sol.estado) {
                    case 'REGISTRADA':
                        badgeClase = 'badge-registrada';
                        break;
                    case 'EN_EVALUACION':
                        badgeClase = 'badge-evaluacion';
                        estadoTexto = 'EN EVALUACIÓN';
                        break;
                    case 'APROBADA':
                        badgeClase = 'badge-aprobada';
                        break;
                    case 'RECHAZADA':
                        badgeClase = 'badge-rechazada';
                        break;
                    case 'DESEMBOLSADO':
                        badgeClase = 'badge-desembolsado';
                        break;
                }

                tr.innerHTML = `
                    <td><strong>#${sol.id_solicitud}</strong></td>
                    <td>${sol.destino || 'Crédito de Consumo'}</td>
                    <td><strong>Bs. ${montoFormateado}</strong></td>
                    <td>${sol.plazo_meses} meses</td>
                    <td>${sol.fecha_solicitud || '---'}</td>
                    <td><span class="badge ${badgeClase}">${estadoTexto}</span></td>
                `;

                tablaSolicitudesCuerpo.appendChild(tr);
            });

        } catch (error) {
            console.error('Error al cargar solicitudes:', error);
        }
    }

    // ==========================================
    // 6. CARGAR PAGOS, CUOTAS Y MORA
    // ==========================================
    async function cargarMisPagos() {
        try {
            const respuesta = await fetch(`/api/clientesp/cuotas/${idCliente}`);
            const cuotas = await respuesta.json();

            if (!respuesta.ok || !cuotas || cuotas.length === 0) {
                if (tablaPagosCuerpo) {
                    tablaPagosCuerpo.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center; color: #64748b; padding: 20px;">
                                No posees créditos activos ni cuotas pendientes de pago.
                            </td>
                        </tr>
                    `;
                }
                return;
            }

            if (!tablaPagosCuerpo) return;
            tablaPagosCuerpo.innerHTML = '';
            const hoy = new Date();

            cuotas.forEach(cuota => {
                const tr = document.createElement('tr');

                const montoCuota = Number(cuota.monto).toLocaleString('es-BO', { minimumFractionDigits: 2 });
                const saldoPendiente = Number(cuota.saldo).toLocaleString('es-BO', { minimumFractionDigits: 2 });

                const fechaVenc = new Date(cuota.fecha_vencimiento);
                let badgeClase = 'badge-pendiente';
                let estadoTexto = cuota.estado;

                if (cuota.estado === 'PAGADA') {
                    badgeClase = 'badge-vigente';
                    estadoTexto = 'PAGADA';
                } else if (fechaVenc < hoy && cuota.saldo > 0) {
                    badgeClase = 'badge-mora';
                    const diferenciaTiempo = Math.abs(hoy - fechaVenc);
                    const diasRetraso = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));
                    estadoTexto = `EN MORA (${diasRetraso} días de retraso)`;
                } else {
                    badgeClase = 'badge-pendiente';
                    estadoTexto = 'PENDIENTE';
                }

                tr.innerHTML = `
                    <td><strong>${cuota.numero_credito || 'CR-001'}</strong></td>
                    <td>Cuota #${cuota.numero}</td>
                    <td>${cuota.fecha_vencimiento}</td>
                    <td>Bs. ${montoCuota}</td>
                    <td><strong>Bs. ${saldoPendiente}</strong></td>
                    <td><span class="badge ${badgeClase}">${estadoTexto}</span></td>
                `;

                tablaPagosCuerpo.appendChild(tr);
            });

        } catch (error) {
            console.error('Error al cargar cronograma de pagos:', error);
        }
    }

    // Inicializar la carga de datos del panel
    cargarDatosPersonales();
    cargarMisSolicitudes();
    cargarMisPagos();
});
document.addEventListener('DOMContentLoaded', () => {
  // 1. Cargar datos del usuario logueado en la barra lateral
  const usuarioGuardado = localStorage.getItem('usuarioLogueado');
  let idUsuarioLogueado = 3; // Valor por defecto (Cajero de prueba)

  if (usuarioGuardado) {
    try {
      const usuario = JSON.parse(usuarioGuardado);
      const nombre = usuario.nombre || usuario.nombre_completo || 'Cajero';
      idUsuarioLogueado = usuario.id || usuario.id_usuario || 3;

      const iniciales = nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      
      const avatarEl = document.getElementById('sidebar-avatar');
      const nombreEl = document.getElementById('sidebar-nombre');
      const rolEl = document.getElementById('sidebar-rol');

      if (avatarEl) avatarEl.textContent = iniciales;
      if (nombreEl) nombreEl.textContent = nombre;
      if (rolEl) rolEl.textContent = 'Cajero'; // Mantiene su rol correcto
    } catch (e) {
      console.error('Error al leer sesión:', e);
    }
  }

  const btnBuscar = document.getElementById('btn-buscar-credito');
  const inputBuscar = document.getElementById('buscar_credito');
  const seccionDetalle = document.getElementById('seccion-detalle-pago');
  
  const infoCliente = document.getElementById('info-cliente');
  const infoMonto = document.getElementById('info-monto');
  const infoEstado = document.getElementById('info-estado');
  const tbodyCuotas = document.getElementById('tbody-cuotas');

  let cuotaActual = null;

  // 2. Buscar Crédito
  btnBuscar.addEventListener('click', async () => {
    const criterio = inputBuscar.value.trim();
    if (!criterio) {
      alert('Por favor ingrese un Número de Crédito o C.I.');
      return;
    }

    try {
      const res = await fetch(`/api/pagos/buscar?criterio=${encodeURIComponent(criterio)}`);
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'No se encontró información.');
        seccionDetalle.style.display = 'none';
        return;
      }

      // Llenar información general del crédito
      infoCliente.innerText = `${data.cliente.nombre_completo} (CI: ${data.cliente.ci})`;
      infoMonto.innerText = parseFloat(data.credito.monto_aprobado).toFixed(2);
      infoEstado.innerText = data.credito.estado;

      // Llenar tabla de cuotas
      tbodyCuotas.innerHTML = '';
      if (data.cuotas.length === 0) {
        tbodyCuotas.innerHTML = `<tr><td colspan="7" class="texto-vacio">El crédito no tiene cuotas generadas.</td></tr>`;
      } else {
        data.cuotas.forEach(c => {
          const tr = document.createElement('tr');
          const esPagada = c.estado === 'PAGADA';

          tr.innerHTML = `
            <td>Cuota #${c.numero}</td>
            <td>${c.fecha_vencimiento}</td>
            <td>Bs. ${parseFloat(c.capital).toFixed(2)}</td>
            <td>Bs. ${parseFloat(c.interes).toFixed(2)}</td>
            <td><strong>Bs. ${parseFloat(c.monto).toFixed(2)}</strong></td>
            <td><span class="${esPagada ? 'badge-estado-desembolsado' : 'badge-pendiente'}">${c.estado}</span></td>
            <td>
              ${!esPagada 
                ? `<button class="boton-primario" style="background:#28a745;" onclick="abrirModalPago(${c.id_cuota}, ${c.numero},${c.monto})">Registrar Pago</button>` 
                : `<span style="color:gray;">Completado</span>`}
            </td>
          `;
          tbodyCuotas.appendChild(tr);
        });
      }

      seccionDetalle.style.display = 'block';

    } catch (err) {
      console.error(err);
      alert('Error al conectar con el servidor.');
    }
  });

  // 3. Escuchar el input de dinero para calcular el cambio dinámico
  const inputMontoRecibido = document.getElementById('inputMontoRecibido');
  if (inputMontoRecibido) {
    inputMontoRecibido.addEventListener('input', (e) => {
      if (!cuotaActual) return;
      const recibido = parseFloat(e.target.value) || 0;
      const cambio = recibido - cuotaActual.monto;
      document.getElementById('textCambio').innerText = `Bs. ${Math.max(0, cambio).toFixed(2)}`;
    });
  }

  // 4. Confirmar Pago
  const btnConfirmarPago = document.getElementById('btnConfirmarPago');
  if (btnConfirmarPago) {
    btnConfirmarPago.addEventListener('click', async () => {
      const recibido = parseFloat(document.getElementById('inputMontoRecibido').value);
      
      if (!recibido || recibido < cuotaActual.monto) {
        alert(`El monto ingresado debe ser mayor o igual a Bs. ${cuotaActual.monto.toFixed(2)}`);
        return;
      }

      try {
        const res = await fetch('/api/pagos/registrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_cuota: cuotaActual.id_cuota,
            id_usuario: idUsuarioLogueado, // ID real del cajero autenticado
            monto_recibido: recibido,
            forma_pago: 'EFECTIVO'
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        cerrarModalPago();
        mostrarRecibo(data.recibo);
        btnBuscar.click(); // Recargar la tabla y cuotas actualizadas en pantalla

      } catch (err) {
        alert('Error al procesar el pago: ' + err.message);
      }
    });
  }

  // Funciones globales para abrir y cerrar modales desde el HTML
  window.abrirModalPago = (id_cuota, numero, monto) => {
    cuotaActual = { id_cuota, numero, monto: parseFloat(monto) };
    document.getElementById('pagoCuotaNum').innerText = `#${numero}`;
    document.getElementById('pagoMontoTotal').innerText = cuotaActual.monto.toFixed(2);
    document.getElementById('inputMontoRecibido').value = '';
    document.getElementById('textCambio').innerText = 'Bs. 0.00';
    document.getElementById('modalPago').style.display = 'flex';
  };

  window.cerrarModalPago = () => {
    document.getElementById('modalPago').style.display = 'none';
  };

  window.mostrarRecibo = (r) => {
    document.getElementById('recNum').innerText = r.numero_recibo;
    document.getElementById('recFecha').innerText = r.fecha;
    document.getElementById('recCajero').innerText = r.cajero;
    document.getElementById('recCliente').innerText = r.cliente;
    document.getElementById('recCI').innerText = r.ci;
    document.getElementById('recCredito').innerText = r.numero_credito;
    document.getElementById('recCuota').innerText = r.numero_cuota;
    document.getElementById('recCapital').innerText = parseFloat(r.capital).toFixed(2);
    document.getElementById('recInteres').innerText = parseFloat(r.interes).toFixed(2);
    document.getElementById('recTotal').innerText = parseFloat(r.total_pagado).toFixed(2);
    document.getElementById('recRecibido').innerText = parseFloat(r.monto_recibido).toFixed(2);
    document.getElementById('recCambio').innerText = parseFloat(r.cambio).toFixed(2);

    document.getElementById('modalRecibo').style.display = 'flex';
  };

  window.cerrarRecibo = () => {
    document.getElementById('modalRecibo').style.display = 'none';
  };
});
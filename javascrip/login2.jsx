import React, { useState } from 'react';

export default function LoginCrediManager() {
    // --- ESTADOS DEL FORMULARIO (Hooks de React) ---
    const [usuario, setUsuario] = useState('');
    const [contrasena, setContrasena] = useState('');
    const [mostrarContrasena, setMostrarContrasena] = useState(false);

    // Función para alternar la visibilidad de la contraseña (mostrar/ocultar con el icono del ojo)
    const toggleMostrarContrasena = () => {
        setMostrarContrasena(!mostrarContrasena);
    };

    // Función que se ejecuta al enviar el formulario de inicio de sesión
    const manejarEnvio = (e) => {
        e.preventDefault();
        
        // Simulación de datos enviados al sistema o backend
        console.log("Datos de acceso enviados:", {
            usuario,
            contrasena,
            agencia,
            recordarSesion
        });

        alert(`¡Bienvenido! Intentando acceder a la agencia: ${agencia || 'No seleccionada'}`);
    };

    return (
        <>


            {/* Saludo y subtítulo de bienvenida */}
            <div className="bienvenida">
                <h2>Iniciar Sesión</h2>
            </div>

            {/* FORMULARIO DE INICIO DE SESIÓN */}
            <form onSubmit={manejarEnvio} id="formulario-login">

                {/* CAMPO 1: Usuario o Correo electrónico */}
                <div className="grupo-campo">
                    <label htmlFor="campo-usuario">Usuario</label>
                    <div className="campo-con-icono">
                        <span className="icono-campo">👤</span>
                        <input 
                            type="email" 
                            id="campo-usuario" 
                            value={usuario}
                            onChange={(e) => setUsuario(e.target.value)}
                            placeholder="usuario@empresa.com" 
                            required
                        />
                    </div>
                </div>

                {/* CAMPO 2: Contraseña con interactividad del botón del ojo */}
                <div className="grupo-campo">
                    <label htmlFor="campo-contrasena">Contraseña</label>
                    <div className="campo-con-icono">
                        <span className="icono-campo">🔒</span>
                        <input 
                            type={mostrarContrasena ? "text" : "password"} 
                            id="campo-contrasena" 
                            value={contrasena}
                            onChange={(e) => setContrasena(e.target.value)}
                            placeholder="••••••••" 
                            required
                        />
                        <button 
                            type="button" 
                            className="boton-ver-contrasena" 
                            onClick={toggleMostrarContrasena}
                            title={mostrarContrasena ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                            {mostrarContrasena ? "👁️‍🗨️" : ""}
                        </button>
                    </div>
                </div>

                {/* Botón principal de envío */}
                <div className="grupo-boton">
                    <button type="submit" className="boton-ingresar">
                        Iniciar sesión
                    </button>
                </div>

                {/* Insignia de seguridad SSL */}
                <div className="insignia-seguridad">
                    <span> Conexión segura SSL/TLS - Datos protegidos ✅</span>
                </div>

            </form>

            {/* Pie de página del formulario */}
            <footer className="pie-formulario">
                <p>© 2026 CrediManager • <a href="#privacidad" onClick={(e) => e.preventDefault()}>Política de Privacidad</a></p>
            </footer>
        </>
    );
}
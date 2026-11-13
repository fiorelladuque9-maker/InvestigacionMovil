/*
 * Agenda de actividades - Apache Cordova
 * ---------------------------------------
 * Este archivo tiene TODA la lógica de la app. Está dividido en secciones:
 *   1. Estado (datos en memoria)
 *   2. Arranque (evento deviceready = punto de entrada)
 *   3. Navegación entre pantallas
 *   4. Formulario y validación
 *   5. Listado dinámico
 *   6. Almacenamiento (localStorage)
 *   7. Utilidades
 */
'use strict';

/* ==================== 1. ESTADO ==================== */

const CLAVE_STORAGE = 'agenda.actividades'; // nombre con el que se guardan los datos
let actividades = [];        // arreglo con todas las actividades
let filtroActual = 'todas';  // 'todas' | 'pendientes' | 'completadas'
let vistaActual = 'lista';   // 'lista' | 'form'

/* ==================== 2. ARRANQUE ==================== */

/*
 * PUNTO DE ENTRADA.
 * Cordova dispara "deviceready" cuando la parte nativa (Android) ya está lista
 * y se pueden usar sus funciones. Antes de eso no se debe tocar nada de Cordova.
 */
document.addEventListener('deviceready', iniciarApp, false);

function iniciarApp() {
    actividades = cargarActividades();
    conectarEventos();
    mostrarVista('lista');

    // Botón "atrás" físico/gesto de Android (evento propio de Cordova)
    document.addEventListener('backbutton', manejarBotonAtras, false);
}

/* Conecta cada botón/elemento con la función que debe ejecutar (eventos) */
function conectarEventos() {
    document.getElementById('btn-nueva').addEventListener('click', function () {
        mostrarVista('form');
    });

    document.getElementById('btn-volver').addEventListener('click', function () {
        mostrarVista('lista');
    });

    document.getElementById('form-actividad').addEventListener('submit', guardarActividad);

    // Al escribir en un campo con error, se limpia su mensaje
    document.querySelectorAll('#form-actividad input, #form-actividad select').forEach(function (campo) {
        campo.addEventListener('input', function () {
            limpiarError(campo.name);
        });
    });

    // Filtros
    document.querySelectorAll('.chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            filtroActual = chip.dataset.filtro;
            document.querySelectorAll('.chip').forEach(function (c) {
                c.classList.toggle('activo', c === chip);
            });
            renderizarLista();
        });
    });

    // Un solo "escuchador" para toda la lista (delegación de eventos):
    // sirve para los elementos que se crean después dinámicamente.
    const lista = document.getElementById('lista-actividades');
    lista.addEventListener('change', function (e) {
        if (e.target.classList.contains('check')) {
            cambiarCompletada(Number(e.target.dataset.id), e.target.checked);
        }
    });
    lista.addEventListener('click', function (e) {
        if (e.target.classList.contains('btn-borrar')) {
            borrarActividad(Number(e.target.dataset.id));
        }
    });
}

/* ==================== 3. NAVEGACIÓN ==================== */

/* Muestra una pantalla y oculta la otra */
function mostrarVista(nombre) {
    document.querySelectorAll('.vista').forEach(function (v) {
        v.classList.remove('activa');
    });
    document.getElementById('vista-' + nombre).classList.add('activa');

    const enLista = (nombre === 'lista');
    document.getElementById('titulo-vista').textContent = enLista ? 'Mi agenda' : 'Nueva actividad';
    document.getElementById('btn-volver').classList.toggle('oculto', enLista);
    vistaActual = nombre;

    if (enLista) {
        renderizarLista();
    } else {
        // La fecha no puede ser anterior a hoy
        document.getElementById('campo-fecha').min = fechaHoy();
    }
    window.scrollTo(0, 0);
}

function manejarBotonAtras() {
    if (vistaActual === 'form') {
        mostrarVista('lista');   // en el formulario: regresa a la lista
    } else {
        navigator.app.exitApp(); // en la lista: cierra la app
    }
}

/* ==================== 4. FORMULARIO Y VALIDACIÓN ==================== */

function guardarActividad(evento) {
    evento.preventDefault(); // evita que el formulario recargue la página

    const form = evento.target;
    const campos = form.elements; // todos los campos del formulario, por su "name"
    const datos = {
        titulo: campos.titulo.value.trim(),
        fecha: campos.fecha.value,
        hora: campos.hora.value,
        categoria: campos.categoria.value,
        descripcion: campos.descripcion.value.trim()
    };

    const errores = validar(datos);
    mostrarErrores(errores);

    if (Object.keys(errores).length > 0) {
        mostrarAviso('Revise los campos marcados', 'error');
        return; // no se guarda nada
    }

    actividades.push({
        id: Date.now(),      // número único basado en la hora actual
        titulo: datos.titulo,
        fecha: datos.fecha,
        hora: datos.hora,
        categoria: datos.categoria,
        descripcion: datos.descripcion,
        completada: false
    });
    guardarEnStorage();

    form.reset();
    mostrarAviso('Actividad guardada ✔', 'ok');
    mostrarVista('lista');
}

/* Devuelve un objeto con los errores encontrados, por ejemplo { titulo: '...' } */
function validar(datos) {
    const errores = {};

    if (datos.titulo.length < 3) {
        errores.titulo = 'El título debe tener al menos 3 caracteres.';
    }
    if (!datos.fecha) {
        errores.fecha = 'Elija una fecha.';
    } else if (datos.fecha < fechaHoy()) {
        errores.fecha = 'La fecha no puede ser anterior a hoy.';
    }
    if (!datos.hora) {
        errores.hora = 'Elija una hora.';
    }
    if (!datos.categoria) {
        errores.categoria = 'Elija una categoría.';
    }
    return errores;
}

function mostrarErrores(errores) {
    ['titulo', 'fecha', 'hora', 'categoria'].forEach(function (campo) {
        if (errores[campo]) {
            document.getElementById('error-' + campo).textContent = errores[campo];
            document.getElementById('campo-' + campo).classList.add('invalido');
        } else {
            limpiarError(campo);
        }
    });
}

function limpiarError(campo) {
    const error = document.getElementById('error-' + campo);
    if (error) {
        error.textContent = '';
        document.getElementById('campo-' + campo).classList.remove('invalido');
    }
}

/* ==================== 5. LISTADO DINÁMICO ==================== */

function renderizarLista() {
    const ul = document.getElementById('lista-actividades');
    ul.innerHTML = ''; // se borra la lista y se vuelve a construir

    // 1) Filtrar según el chip seleccionado
    const visibles = actividades.filter(function (a) {
        if (filtroActual === 'pendientes') return !a.completada;
        if (filtroActual === 'completadas') return a.completada;
        return true;
    });

    // 2) Ordenar por fecha y hora (la más próxima primero)
    visibles.sort(function (a, b) {
        return (a.fecha + a.hora).localeCompare(b.fecha + b.hora);
    });

    // 3) Crear un <li> por cada actividad
    visibles.forEach(function (a) {
        ul.appendChild(crearElemento(a));
    });

    // 4) Mensaje cuando no hay nada y contador
    document.getElementById('lista-vacia').classList.toggle('oculto', visibles.length > 0);
    const hechas = actividades.filter(function (a) { return a.completada; }).length;
    document.getElementById('contador').textContent =
        actividades.length + ' actividad(es) · ' + hechas + ' completada(s)';
}

/* Construye el HTML de UNA actividad.
 * Se usa textContent (y no innerHTML) para que el texto escrito por el usuario
 * no se interprete como código (buena práctica de seguridad). */
function crearElemento(a) {
    const li = document.createElement('li');
    li.className = 'tarjeta' + (a.completada ? ' hecha' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check';
    check.checked = a.completada;
    check.dataset.id = a.id;
    check.setAttribute('aria-label', 'Marcar como completada');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'cuerpo';

    const titulo = document.createElement('h3');
    titulo.textContent = a.titulo;

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = formatearFecha(a.fecha) + ' · ' + a.hora;

    const etiqueta = document.createElement('span');
    etiqueta.className = 'etiqueta cat-' + a.categoria.toLowerCase();
    etiqueta.textContent = a.categoria;

    cuerpo.append(titulo, meta, etiqueta);

    if (a.descripcion) {
        const desc = document.createElement('p');
        desc.className = 'desc';
        desc.textContent = a.descripcion;
        cuerpo.appendChild(desc);
    }

    const borrar = document.createElement('button');
    borrar.className = 'btn-borrar';
    borrar.dataset.id = a.id;
    borrar.setAttribute('aria-label', 'Eliminar');
    borrar.textContent = '✕';

    li.append(check, cuerpo, borrar);
    return li;
}

function cambiarCompletada(id, valor) {
    const actividad = actividades.find(function (a) { return a.id === id; });
    if (actividad) {
        actividad.completada = valor;
        guardarEnStorage();
        renderizarLista();
    }
}

function borrarActividad(id) {
    if (!confirm('¿Eliminar esta actividad?')) return;
    actividades = actividades.filter(function (a) { return a.id !== id; });
    guardarEnStorage();
    renderizarLista();
    mostrarAviso('Actividad eliminada', 'ok');
}

/* ==================== 6. ALMACENAMIENTO ==================== */
/* localStorage guarda texto dentro del teléfono; los datos siguen
 * ahí aunque se cierre la app. Se guarda el arreglo convertido a JSON. */

function cargarActividades() {
    try {
        return JSON.parse(localStorage.getItem(CLAVE_STORAGE)) || [];
    } catch (e) {
        return [];
    }
}

function guardarEnStorage() {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(actividades));
}

/* ==================== 7. UTILIDADES ==================== */

/* Fecha de hoy en formato AAAA-MM-DD (el mismo que usa <input type="date">) */
function fechaHoy() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mes + '-' + dia;
}

/* "2026-11-19" -> "jue, 19 nov 2026" */
function formatearFecha(iso) {
    const partes = iso.split('-');
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    return fecha.toLocaleDateString('es-CR', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
}

/* Muestra un mensaje abajo por 2,5 segundos */
let temporizadorAviso;
function mostrarAviso(texto, tipo) {
    const aviso = document.getElementById('aviso');
    aviso.textContent = texto;
    aviso.className = 'aviso visible aviso-' + tipo;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () {
        aviso.className = 'aviso';
    }, 2500);
}

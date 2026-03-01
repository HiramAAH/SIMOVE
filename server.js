// server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const mysql = require('mysql2'); 

const app = express();
const PORT = 3000;

const server = http.createServer(app);
const io = new Server(server);

// -------------------
// CONEXIÓN A BASE DE DATOS (Para Sockets)
// -------------------
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'simove'
});

db.connect((err) => {
  if (err) console.error('Error DB en server.js:', err);
  else console.log('DB MySQL Conectada correctamente en el servidor.');
});

// -------------------
// SESIONES
// -------------------
const sessionMiddleware = session({
  secret: 'clave_super_secreta',
  resave: false,
  saveUninitialized: false
});

app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);

// Rutas
app.use('/', authRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------
// COMPARTIR SESIÓN CON SOCKET.IO
// -------------------
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// -------------------
// MONITOREO USUARIOS Y DB
// -------------------
let usuariosActivos = {};

io.on('connection', (socket) => {

  const req = socket.request;
  const user = req.session?.user;

  // Variables provisionales para la ruta actual
  let idRutaActual = 1; 

  if (!user) {
    return;
  }
  
  // Registrar usuario activo
  usuariosActivos[socket.id] = user;
  console.log(`${user.nombre_usuario} inició sesión (${user.rol})`);

  // Notificar ingreso al admin
  io.emit('usuario_ingreso', user);
  socket.emit('usuarios_activos', Object.values(usuariosActivos));

  // 1. ESCUCHAR INICIO DE RUTA
  socket.on('iniciar_ruta_db', () => {
    console.log(`[DB] ${user.nombre_usuario} ha iniciado su ruta.`);
  });

  // 2. ESCUCHAR Y GUARDAR COORDENADAS
  socket.on('nueva_ubicacion', (datos) => {
    const usuarioActual = socket.request.session?.user;

    if (usuarioActual) {
      const paqueteDatos = {
        usuario: usuarioActual.nombre_usuario,
        rol: usuarioActual.rol,
        lat: datos.lat,
        lng: datos.lng,
        precision: datos.precision || 0
      };

      console.log(`[GPS] ${paqueteDatos.usuario} -> Lat: ${paqueteDatos.lat}, Lng: ${paqueteDatos.lng}`);

      // Guardar en la tabla 'coordenadas'
      const queryCoord = 'INSERT INTO coordenadas (id_ruta, latitud, longitud, timestamp) VALUES (?, ?, ?, NOW())';
      db.query(queryCoord, [idRutaActual, datos.lat, datos.lng], (err) => {
        if (err) console.error("Error al guardar coordenada:", err.message);
      });

      // Retransmitir al panel de monitoreo (Admins)
      io.emit('ubicacion_recibida', paqueteDatos);
    }
  });

// 3. ESCUCHAR FIN DE RUTA CON CALLBACK (CORTES)
  socket.on('finalizar_ruta_db', (datos, callback) => {
    const usuarioActual = socket.request.session?.user;

    // Si el usuario sí pasó por el Login
    if (usuarioActual) {
      const queryCorte = `
        INSERT INTO cortes (id_usuario, id_ruta, fecha, garrafones_vendidos) 
        VALUES (?, ?, CURDATE(), ?)
      `;
      
      db.query(queryCorte, [usuarioActual.id_usuario, idRutaActual, datos.total_vendidos], (err) => {
        if (err) {
          console.error("Error al guardar el corte en MySQL:", err.message);
          // Avisar al frontend que falló la Base de Datos
          if (callback) callback({ exito: false, error: err.message });
        } else {
          console.log(`[DB] ÉXITO: Corte guardado para ${usuarioActual.nombre_usuario} -> ${datos.total_vendidos} garrafones.`);
          // Avisar al frontend que todo salió bien
          if (callback) callback({ exito: true });
        }
      });
    } 
    // SI NO HAY SESIÓN ACTIVA (El usuario no hizo login)
    else {
      console.log("[DB] Error: Intento de guardar sin sesión activa.");
      if (callback) callback({ exito: false, error: "No tienes una sesión activa. Debes hacer Login primero para que el servidor sepa quién eres." });
    }
  });

  // DESCONEXIÓN
  socket.on('disconnect', () => {
    const usuario = usuariosActivos[socket.id];
    if (usuario) {
      console.log(`${usuario.nombre_usuario} salió del sistema`);
      io.emit('usuario_salida', usuario);
      delete usuariosActivos[socket.id];
    }
  });
});

// --- NUEVA RUTA: OBTENER HISTORIAL DE CORTES ---
app.get('/api/mis-cortes', (req, res) => {
  const usuarioActual = req.session?.user;

  if (!usuarioActual) {
    return res.status(401).json({ error: "No autorizado. Inicia sesión." });
  }

  // Consulta SQL: Obtener los cortes del usuario, ordenados de más recientes a más antiguos
  const query = `
    SELECT fecha, garrafones_vendidos 
    FROM cortes 
    WHERE id_usuario = ? 
    ORDER BY fecha DESC, created_at DESC
  `;

  db.query(query, [usuarioActual.id_usuario], (err, resultados) => {
    if (err) {
      console.error("Error al consultar cortes:", err);
      return res.status(500).json({ error: "Error en el servidor al consultar los cortes." });
    }
    
    res.json(resultados);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
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
  if (err) console.error('\x1b[31m[ERROR DB]\x1b[0m en server.js:', err);
  else console.log('\x1b[36m[SISTEMA]\x1b[0m DB MySQL Conectada correctamente.');
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

  let idRutaActual = 1; 

  if (!user) {
    return; // Ignoramos conexiones sin sesión (evita spam en consola)
  }
  
  usuariosActivos[socket.id] = user;
  console.log(`\x1b[35m[LOGIN]\x1b[0m ${user.nombre_usuario} inició sesión (${user.rol})`);

  io.emit('usuario_ingreso', user);
  socket.emit('usuarios_activos', Object.values(usuariosActivos));

  // 1. INICIO DE RUTA
  socket.on('iniciar_ruta_db', () => {
    console.log(`\x1b[34m[RUTA]\x1b[0m ${user.nombre_usuario} ha INICIADO su trayecto.`);
  });

  // 2. ESCUCHAR Y REPORTAR COORDENADAS (LO QUE PEDISTE)
  socket.on('nueva_ubicacion', (datos) => {
    const usuarioActual = socket.request.session?.user;

    if (usuarioActual) {
      const paqueteDatos = {
        usuario: usuarioActual.nombre_usuario,
        rol: usuarioActual.rol,
        lat: datos.lat,
        lng: datos.lng,
        precision: Math.round(datos.precision || 0)
      };

      // REPORTAR EN CMD CON FORMATO Y COLORES
      console.log(`\x1b[32m[GPS EN VIVO]\x1b[0m Repartidor: \x1b[33m${paqueteDatos.usuario}\x1b[0m | Lat: ${paqueteDatos.lat}, Lng: ${paqueteDatos.lng} | Precisión: ${paqueteDatos.precision}m`);

      // Guardar en la tabla 'coordenadas'
      const queryCoord = 'INSERT INTO coordenadas (id_ruta, latitud, longitud, timestamp) VALUES (?, ?, ?, NOW())';
      db.query(queryCoord, [idRutaActual, datos.lat, datos.lng], (err) => {
        if (err) console.error("\x1b[31m[ERROR DB]\x1b[0m al guardar coordenada:", err.message);
      });

      // Retransmitir al panel de monitoreo (Admins)
      io.emit('ubicacion_recibida', paqueteDatos);
    }
  });

  // 3. FIN DE RUTA Y CORTES
  socket.on('finalizar_ruta_db', (datos, callback) => {
    const usuarioActual = socket.request.session?.user;

    if (usuarioActual) {
      const queryCorte = `
        INSERT INTO cortes (id_usuario, id_ruta, fecha, garrafones_vendidos) 
        VALUES (?, ?, CURDATE(), ?)
      `;
      
      db.query(queryCorte, [usuarioActual.id_usuario, idRutaActual, datos.total_vendidos], (err) => {
        if (err) {
          console.error("\x1b[31m[ERROR DB]\x1b[0m al guardar el corte:", err.message);
          if (callback) callback({ exito: false, error: err.message });
        } else {
          console.log(`\x1b[36m[CORTE ÉXITO]\x1b[0m ${usuarioActual.nombre_usuario} reportó ${datos.total_vendidos} garrafones.`);
          if (callback) callback({ exito: true });
        }
      });
    } else {
      console.log("\x1b[31m[ERROR]\x1b[0m Intento de guardar sin sesión activa.");
      if (callback) callback({ exito: false, error: "No tienes una sesión activa." });
    }
  });

  socket.on('disconnect', () => {
    const usuario = usuariosActivos[socket.id];
    if (usuario) {
      console.log(`\x1b[31m[LOGOUT]\x1b[0m ${usuario.nombre_usuario} salió del sistema`);
      io.emit('usuario_salida', usuario);
      delete usuariosActivos[socket.id];
    }
  });
});

// --- RUTA: OBTENER HISTORIAL DE CORTES ---
app.get('/api/mis-cortes', (req, res) => {
  const usuarioActual = req.session?.user;

  if (!usuarioActual) {
    return res.status(401).json({ error: "No autorizado. Inicia sesión." });
  }

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
  console.log(`\x1b[32mServidor corriendo en http://localhost:${PORT}\x1b[0m`);
});
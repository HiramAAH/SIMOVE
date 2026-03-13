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
// CONEXIÓN A BASE DE DATOS
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

const sessionMiddleware = session({
  secret: 'clave_super_secreta',
  resave: false,
  saveUninitialized: false
});

app.use(express.json());
app.use(express.static('public'));
app.use(sessionMiddleware);
app.use('/', authRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// -------------------
// MEMORIA DEL SISTEMA
// -------------------
let usuariosActivos = {};
let rutasActivas = {}; // <-- NUEVA MEMORIA PARA EL MAPA ADMIN

io.on('connection', (socket) => {

  const req = socket.request;
  const user = req.session?.user;
  let idRutaActual = 1; 

  if (!user) return; 
  
  usuariosActivos[socket.id] = user;
  console.log(`\x1b[35m[LOGIN]\x1b[0m ${user.nombre_usuario} inició sesión (${user.rol})`);

  // Si un admin se conecta, enviarle el estado actual de las rutas inmediatamente
  if (user.rol === 'admin') {
    socket.emit('estado_rutas', rutasActivas);
  }

  // 1. INICIO DE RUTA
  socket.on('iniciar_ruta_db', () => {
    console.log(`\x1b[34m[RUTA]\x1b[0m ${user.nombre_usuario} ha INICIADO su trayecto.`);
    
    // Crear el perfil temporal del repartidor en el mapa
    rutasActivas[user.nombre_usuario] = {
      usuario: user.nombre_usuario,
      horaInicio: Date.now(),
      ventas: 0,
      lat: null,
      lng: null
    };
    io.emit('estado_rutas', rutasActivas); // Actualizar mapa de admins
  });

  // 2. ESCUCHAR VENTAS EN TIEMPO REAL
  socket.on('venta_registrada', (datos) => {
    if (rutasActivas[user.nombre_usuario]) {
      rutasActivas[user.nombre_usuario].ventas = datos.total;
      io.emit('estado_rutas', rutasActivas); // Actualizar panel de admins
    }
  });

  // 3. ACTUALIZAR GPS
  socket.on('nueva_ubicacion', (datos) => {
    if (rutasActivas[user.nombre_usuario]) {
      rutasActivas[user.nombre_usuario].lat = datos.lat;
      rutasActivas[user.nombre_usuario].lng = datos.lng;
    }

    console.log(`\x1b[32m[GPS EN VIVO]\x1b[0m Repartidor: \x1b[33m${user.nombre_usuario}\x1b[0m | Lat: ${datos.lat}, Lng: ${datos.lng}`);

    const queryCoord = 'INSERT INTO coordenadas (id_ruta, latitud, longitud, timestamp) VALUES (?, ?, ?, NOW())';
    db.query(queryCoord, [idRutaActual, datos.lat, datos.lng], (err) => {
      if (err) console.error("\x1b[31m[ERROR DB]\x1b[0m al guardar coordenada:", err.message);
    });

    // Enviar la foto completa de las rutas a los admins
    io.emit('estado_rutas', rutasActivas);
  });

  // 4. FIN DE RUTA Y CORTES
  socket.on('finalizar_ruta_db', (datos, callback) => {
    if (user) {
      const queryCorte = `INSERT INTO cortes (id_usuario, id_ruta, fecha, garrafones_vendidos) VALUES (?, ?, CURDATE(), ?)`;
      db.query(queryCorte, [user.id_usuario, idRutaActual, datos.total_vendidos], (err) => {
        if (err) {
          if (callback) callback({ exito: false, error: err.message });
        } else {
          console.log(`\x1b[36m[CORTE ÉXITO]\x1b[0m ${user.nombre_usuario} reportó ${datos.total_vendidos} garrafones.`);
          
          // Borrar al repartidor del mapa del administrador
          delete rutasActivas[user.nombre_usuario];
          io.emit('estado_rutas', rutasActivas);

          if (callback) callback({ exito: true });
        }
      });
    }
  });

  socket.on('disconnect', () => {
    delete usuariosActivos[socket.id];
  });
});

app.get('/api/mis-cortes', (req, res) => {
  const usuarioActual = req.session?.user;
  if (!usuarioActual) return res.status(401).json({ error: "No autorizado." });

  const query = `SELECT fecha, garrafones_vendidos FROM cortes WHERE id_usuario = ? ORDER BY fecha DESC, created_at DESC`;
  db.query(query, [usuarioActual.id_usuario], (err, resultados) => {
    if (err) return res.status(500).json({ error: "Error en el servidor." });
    res.json(resultados);
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32mServidor corriendo en http://localhost:${PORT}\x1b[0m`);
});
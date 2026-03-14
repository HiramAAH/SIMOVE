// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const mysql = require('mysql2'); 
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// -------------------
// CONEXIÓN A BASE DE DATOS (POOL)
// -------------------
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'simove',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) console.error('\x1b[31m[ERROR DB]\x1b[0m en server.js:', err);
  else {
    console.log('\x1b[36m[SISTEMA]\x1b[0m DB MySQL Remota Conectada.');
    connection.release();
  }
});

// Middlewares
app.use(cors()); 
app.use(express.json());
app.use(express.static('public'));

const sessionMiddleware = session({
  secret: 'clave_super_secreta',
  resave: false,
  saveUninitialized: false
});

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
let rutasActivas = {}; 

io.on('connection', (socket) => {
  // Soporte para APK (query) y Web (session)
  const user = socket.request.session?.user || socket.handshake.query;

  if (!user || !user.nombre_usuario) {
    return; 
  }
  
  console.log(`\x1b[35m[SOCKET]\x1b[0m ${user.nombre_usuario} conectado.`);

  if (user.rol === 'admin') {
    socket.emit('estado_rutas', rutasActivas);
  }

  // 1. INICIO DE RUTA (DINÁMICO)
  socket.on('iniciar_ruta_db', () => {
    // Insertamos una nueva ruta en la tabla 'rutas' para obtener un ID real
    const queryCrearRuta = 'INSERT INTO rutas (id_usuario, fecha_inicio) VALUES (?, NOW())';
    
    db.query(queryCrearRuta, [user.id_usuario], (err, result) => {
        if (err) {
            console.error("\x1b[31m[ERROR DB]\x1b[0m al crear ruta:", err.message);
            return;
        }

        // Guardamos el ID autogenerado en el objeto socket de esta conexión
        socket.idRutaActual = result.insertId; 
        
        console.log(`\x1b[34m[RUTA]\x1b[0m ${user.nombre_usuario} inició ruta ID: ${socket.idRutaActual}`);
        
        rutasActivas[user.nombre_usuario] = {
            usuario: user.nombre_usuario,
            id_ruta: socket.idRutaActual,
            horaInicio: Date.now(),
            ventas: 0,
            lat: null,
            lng: null
        };
        io.emit('estado_rutas', rutasActivas);
    });
  });

  // 2. REGISTRAR VENTA
  socket.on('venta_registrada', (datos) => {
    if (rutasActivas[user.nombre_usuario]) {
      rutasActivas[user.nombre_usuario].ventas = datos.total;
      io.emit('estado_rutas', rutasActivas);
    }
  });

  // 3. ACTUALIZAR GPS
  socket.on('nueva_ubicacion', (datos) => {
    if (rutasActivas[user.nombre_usuario] && socket.idRutaActual) {
      rutasActivas[user.nombre_usuario].lat = datos.lat;
      rutasActivas[user.nombre_usuario].lng = datos.lng;

      const queryCoord = 'INSERT INTO coordenadas (id_ruta, latitud, longitud, timestamp) VALUES (?, ?, ?, NOW())';
      db.query(queryCoord, [socket.idRutaActual, datos.lat, datos.lng], (err) => {
        if (err) console.error("\x1b[31m[ERROR DB]\x1b[0m en coordenadas:", err.message);
      });

      io.emit('estado_rutas', rutasActivas);
    }
  });

  // 4. FIN DE RUTA Y CORTES (USANDO ID DINÁMICO)
  socket.on('finalizar_ruta_db', (datos, callback) => {
    if (user && socket.idRutaActual) {
      const queryCorte = `INSERT INTO cortes (id_usuario, id_ruta, fecha, garrafones_vendidos) VALUES (?, ?, CURDATE(), ?)`;
      
      db.query(queryCorte, [user.id_usuario, socket.idRutaActual, datos.total_vendidos], (err) => {
        if (err) {
          console.error("\x1b[31m[ERROR DB]\x1b[0m en corte:", err.message);
          if (callback) callback({ exito: false, error: err.message });
        } else {
          console.log(`\x1b[36m[CORTE]\x1b[0m ${user.nombre_usuario} finalizó con ${datos.total_vendidos} garrafones.`);
          
          delete rutasActivas[user.nombre_usuario];
          io.emit('estado_rutas', rutasActivas);

          if (callback) callback({ exito: true });
        }
      });
    } else {
        if (callback) callback({ exito: false, error: "No hay una ruta activa para finalizar." });
    }
  });

  socket.on('disconnect', () => {
    // Opcional: podrías mantener la ruta activa aunque se desconecte el socket por micro-cortes de internet
  });
});

app.get('/api/mis-cortes', (req, res) => {
  // Tomamos el ID enviado por la APK (query) o por la Web (session)
  const id_usuario = req.query.id_usuario || req.session?.user?.id_usuario;
  
  if (!id_usuario) return res.status(401).json({ error: "No autorizado." });

  const query = `SELECT fecha, garrafones_vendidos FROM cortes WHERE id_usuario = ? ORDER BY fecha DESC`;
  db.query(query, [id_usuario], (err, resultados) => {
    if (err) return res.status(500).json({ error: "Error en el servidor." });
    res.json(resultados);
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32mServidor corriendo en el puerto ${PORT}\x1b[0m`);
});
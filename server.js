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

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'simove',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000
});

db.getConnection((err, connection) => {
  if (err) console.error('\x1b[31m[ERROR DB]\x1b[0m en server.js:', err);
  else {
    console.log('\x1b[36m[SISTEMA]\x1b[0m DB MySQL Remota Conectada.');
    connection.release();
  }
});

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

let rutasActivas = {}; 

io.on('connection', (socket) => {
  const user = socket.request.session?.user || socket.handshake.query;

  if (!user || !user.nombre_usuario) return; 
  
  console.log(`\x1b[35m[SOCKET]\x1b[0m ${user.nombre_usuario} conectado.`);

  if (user.rol === 'admin') {
    socket.emit('estado_rutas', rutasActivas);
  }

  socket.on('iniciar_ruta_db', (callback) => {
    const queryCrearRuta = 'INSERT INTO rutas (id_usuario, id_ruta_catalogo, fecha_inicio) VALUES (?, 1, NOW())';
    
    db.query(queryCrearRuta, [user.id_usuario], (err, result) => {
        if (err) {
            console.error("\x1b[31m[ERROR DB]\x1b[0m al crear ruta:", err.message);
            if (callback) callback({ exito: false, error: err.message });
            return;
        }

        const idGenerado = result.insertId; 
        console.log(`\x1b[34m[RUTA]\x1b[0m ${user.nombre_usuario} inició ruta ID: ${idGenerado}`);
        
        rutasActivas[user.nombre_usuario] = {
            usuario: user.nombre_usuario,
            id_ruta: idGenerado,
            horaInicio: Date.now(),
            ventas: 0,
            lat: null,
            lng: null
        };
        io.emit('estado_rutas', rutasActivas);
        
        if (callback) callback({ exito: true });
    });
  });

  socket.on('venta_registrada', (datos) => {
    if (rutasActivas[user.nombre_usuario]) {
      rutasActivas[user.nombre_usuario].ventas = datos.total;
      io.emit('estado_rutas', rutasActivas);
    }
  });

  socket.on('nueva_ubicacion', (datos) => {
    const rutaGlobal = rutasActivas[user.nombre_usuario];

    if (rutaGlobal && rutaGlobal.id_ruta) {
      rutaGlobal.lat = datos.lat;
      rutaGlobal.lng = datos.lng;

      const queryCoord = 'INSERT INTO coordenadas (id_ruta, latitud, longitud, timestamp) VALUES (?, ?, ?, NOW())';
      db.query(queryCoord, [rutaGlobal.id_ruta, datos.lat, datos.lng], (err) => {
        if (err) console.error("\x1b[31m[ERROR DB]\x1b[0m en coordenadas:", err.message);
      });

      io.emit('estado_rutas', rutasActivas);
    }
  });

  socket.on('finalizar_ruta_db', (datos, callback) => {
    const rutaGlobal = rutasActivas[user.nombre_usuario];

    if (user && rutaGlobal && rutaGlobal.id_ruta) {
      const queryCorte = `INSERT INTO cortes (id_usuario, id_ruta, fecha, garrafones_vendidos) VALUES (?, ?, CURDATE(), ?)`;
      
      db.query(queryCorte, [user.id_usuario, rutaGlobal.id_ruta, datos.total_vendidos], (err) => {
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

  socket.on('disconnect', () => {});
});

app.get('/api/mis-cortes', (req, res) => {
  const id_usuario = req.query.id_usuario || req.session?.user?.id_usuario;
  if (!id_usuario) return res.status(401).json({ error: "No autorizado." });

  const query = `SELECT fecha, garrafones_vendidos FROM cortes WHERE id_usuario = ? ORDER BY fecha DESC`;
  db.query(query, [id_usuario], (err, resultados) => {
    if (err) return res.status(500).json({ error: "Error en el servidor." });
    res.json(resultados);
  });
});

// ==========================================
// APIS PARA EL PANEL DE ADMINISTRADOR
// ==========================================
app.get('/api/usuarios', (req, res) => {
  db.query('SELECT id_usuario, nombre_usuario, rol, password FROM usuarios', (err, results) => {
    if(err) return res.status(500).json({error: err.message});
    res.json(results);
  });
});

app.post('/api/usuarios', (req, res) => {
  const { nombre_usuario, rol, password } = req.body;
  db.query('INSERT INTO usuarios (nombre_usuario, rol, password) VALUES (?, ?, ?)', [nombre_usuario, rol, password], (err, result) => {
    if(err) return res.status(500).json({error: err.message});
    res.json({ success: true, id_usuario: result.insertId });
  });
});

app.put('/api/usuarios/:id', (req, res) => {
  const { nombre_usuario, rol, password } = req.body;
  db.query('UPDATE usuarios SET nombre_usuario=?, rol=?, password=? WHERE id_usuario=?', [nombre_usuario, rol, password, req.params.id], (err) => {
    if(err) return res.status(500).json({error: err.message});
    res.json({ success: true });
  });
});

app.delete('/api/usuarios/:id', (req, res) => {
  db.query('DELETE FROM usuarios WHERE id_usuario=?', [req.params.id], (err) => {
    if(err) return res.status(500).json({error: err.message});
    res.json({ success: true });
  });
});

app.get('/api/estadisticas', (req, res) => {
  const query = `
    SELECT c.fecha, c.garrafones_vendidos as vendidos, u.nombre_usuario as repartidor
    FROM cortes c
    JOIN usuarios u ON c.id_usuario = u.id_usuario
    ORDER BY c.fecha DESC
  `;
  db.query(query, (err, results) => {
    if(err) return res.status(500).json({error: err.message});
    res.json(results);
  });
});

app.get('/api/historial/rutas', (req, res) => {
  const query = `
    SELECT r.id_ruta, r.fecha_inicio, u.nombre_usuario, COALESCE(c.garrafones_vendidos, 0) as ventas
    FROM rutas r
    JOIN usuarios u ON r.id_usuario = u.id_usuario
    LEFT JOIN cortes c ON r.id_ruta = c.id_ruta
    ORDER BY r.fecha_inicio DESC
  `;
  db.query(query, (err, results) => {
    if(err) return res.status(500).json({error: err.message});
    res.json(results);
  });
});

app.get('/api/historial/coordenadas/:id_ruta', (req, res) => {
  db.query('SELECT latitud as lat, longitud as lng, timestamp FROM coordenadas WHERE id_ruta = ? ORDER BY timestamp ASC', [req.params.id_ruta], (err, results) => {
    if(err) return res.status(500).json({error: err.message});
    res.json(results);
  });
});

server.listen(PORT, () => {
  console.log(`\x1b[32mServidor corriendo en el puerto ${PORT}\x1b[0m`);
});
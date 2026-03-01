// server.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = 3000;

const server = http.createServer(app);
const io = new Server(server);

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
// MONITOREO USUARIOS
// -------------------
let usuariosActivos = {};

io.on('connection', (socket) => {

  const req = socket.request;
  const user = req.session?.user;

  if (!user) {
    return;
  }

  // Registrar usuario activo
  usuariosActivos[socket.id] = user;

  console.log(`${user.nombre_usuario} inició sesión (${user.rol})`);

  // Notificar ingreso
  io.emit('usuario_ingreso', user);

  // Enviar lista actual al que acaba de conectarse
  socket.emit('usuarios_activos', Object.values(usuariosActivos));

  socket.on('disconnect', () => {
    const usuario = usuariosActivos[socket.id];
    if (usuario) {
      console.log(`${usuario.nombre_usuario} salió del sistema`);
      io.emit('usuario_salida', usuario);
      delete usuariosActivos[socket.id];
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
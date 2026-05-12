const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Variables para almacenar usuarios y llamadas
const users = new Map();
const rooms = new Map();

// Configuración de puertos
const PORT = process.env.PORT || 3000;

// ==================== EVENTOS DE SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log(`[CONECTADO] Usuario conectado: ${socket.id}`);

    // Registrar usuario
    socket.on('register-user', (userData) => {
        users.set(socket.id, {
            socketId: socket.id,
            dni: userData.dni,
            nombre: userData.nombre,
            rol: userData.rol,
            especialidad: userData.especialidad,
            email: userData.email,
            tel: userData.tel,
            timestamp: new Date()
        });
        
        console.log(`[USUARIO REGISTRADO] ${userData.nombre} (${userData.rol})`);
        io.emit('users-online', Array.from(users.values()));
    });

    // Iniciar llamada
    socket.on('start-call', (callData) => {
        const { recipientDNI, callerId, callerName, callerRole, citaId } = callData;
        
        // Buscar al destinatario por DNI
        let recipientSocket = null;
        for (let [socketId, user] of users.entries()) {
            if (user.dni === recipientDNI) {
                recipientSocket = socketId;
                break;
            }
        }

        if (recipientSocket) {
            const callId = `call_${Date.now()}`;
            
            // Guardar información de la llamada
            rooms.set(callId, {
                callId,
                callerId,
                callerName,
                callerRole,
                recipientId: recipientSocket,
                recipientDNI,
                citaId,
                startTime: new Date(),
                status: 'ringing'
            });

            // Enviar notificación de llamada entrante
            io.to(recipientSocket).emit('incoming-call', {
                callId,
                callerId,
                callerName,
                callerRole,
                citaId
            });

            console.log(`[LLAMADA INICIADA] ${callerName} llamando a ${recipientDNI}`);
        } else {
            socket.emit('call-error', { message: 'Usuario no disponible' });
            console.log(`[ERROR] Usuario con DNI ${recipientDNI} no encontrado`);
        }
    });

    // Aceptar llamada
    socket.on('accept-call', (callData) => {
        const { callId } = callData;
        const call = rooms.get(callId);

        if (call) {
            call.status = 'active';
            call.acceptTime = new Date();

            // Notificar a ambos usuarios
            io.to(call.callerId).emit('call-accepted', { callId });
            io.to(socket.id).emit('call-accepted', { callId });

            console.log(`[LLAMADA ACEPTADA] ${callId}`);
        }
    });

    // Rechazar llamada
    socket.on('reject-call', (callData) => {
        const { callId } = callData;
        const call = rooms.get(callId);

        if (call) {
            io.to(call.callerId).emit('call-rejected', { callId });
            rooms.delete(callId);
            console.log(`[LLAMADA RECHAZADA] ${callId}`);
        }
    });

    // ICE Candidate
    socket.on('ice-candidate', (candidateData) => {
        const { callId, candidate } = candidateData;
        const call = rooms.get(callId);

        if (call) {
            if (socket.id === call.callerId) {
                io.to(call.recipientId).emit('ice-candidate', { candidate, callId });
            } else {
                io.to(call.callerId).emit('ice-candidate', { candidate, callId });
            }
        }
    });

    // SDP Offer
    socket.on('send-offer', (offerData) => {
        const { callId, offer } = offerData;
        const call = rooms.get(callId);

        if (call && socket.id === call.callerId) {
            io.to(call.recipientId).emit('receive-offer', { offer, callId });
            console.log(`[OFFER ENVIADO] ${callId}`);
        }
    });

    // SDP Answer
    socket.on('send-answer', (answerData) => {
        const { callId, answer } = answerData;
        const call = rooms.get(callId);

        if (call && socket.id === call.recipientId) {
            io.to(call.callerId).emit('receive-answer', { answer, callId });
            console.log(`[ANSWER ENVIADO] ${callId}`);
        }
    });

    // Finalizar llamada
    socket.on('end-call', (callData) => {
        const { callId } = callData;
        const call = rooms.get(callId);

        if (call) {
            const duration = Math.floor((new Date() - call.startTime) / 1000);
            
            io.to(call.callerId).emit('call-ended', { callId, duration });
            io.to(call.recipientId).emit('call-ended', { callId, duration });

            console.log(`[LLAMADA FINALIZADA] ${callId} - Duración: ${duration}s`);
            rooms.delete(callId);
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            console.log(`[DESCONECTADO] ${user.nombre} (${socket.id})`);
        }
        
        users.delete(socket.id);
        io.emit('users-online', Array.from(users.values()));

        // Finalizar cualquier llamada activa
        for (let [callId, call] of rooms.entries()) {
            if (call.callerId === socket.id || call.recipientId === socket.id) {
                io.emit('call-ended-by-disconnect', { callId });
                rooms.delete(callId);
            }
        }
    });

    // Mensajes de chat (opcional)
    socket.on('send-message', (messageData) => {
        const { recipientDNI, message, senderName } = messageData;
        
        let recipientSocket = null;
        for (let [socketId, user] of users.entries()) {
            if (user.dni === recipientDNI) {
                recipientSocket = socketId;
                break;
            }
        }

        if (recipientSocket) {
            io.to(recipientSocket).emit('receive-message', {
                message,
                senderName,
                timestamp: new Date()
            });
        }
    });
});

// Rutas REST
app.get('/api/users', (req, res) => {
    res.json(Array.from(users.values()));
});

app.get('/api/calls', (req, res) => {
    res.json(Array.from(rooms.values()));
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date(),
        connectedUsers: users.size,
        activeCalls: rooms.size
    });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║   TELEENFERMERIA SERVER INICIADO       ║
    ║   Puerto: ${PORT}                           ║
    ║   WebSocket: ws://localhost:${PORT}       ║
    ║   API: http://localhost:${PORT}/api        ║
    ╚════════════════════════════════════════╝
    `);
});

module.exports = server;

import express from 'express';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const app = express();
const server = createServer(app);

// ✅ WebSockets desteği ekle (Render'da polling yerine WebSocket kullanmasını sağla)
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'], // Render WebSockets için bu gerekli!
});

// ✅ CORS Ayarlarını Güncelle
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// ✅ MongoDB Bağlantısını Düzelt ve Hata Kontrolü Ekle
mongoose.connect(process.env.MONGODB_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    serverSelectionTimeoutMS: 5000 // 5 saniye içinde bağlanamazsa hata versin
})
.then(() => console.log("✅ MongoDB bağlantısı başarılı!"))
.catch(err => console.error("❌ MongoDB bağlantı hatası:", err));

const roomSchema = new mongoose.Schema({
    name: { type: String, required: true },
});

const Room = mongoose.model('Room', roomSchema);

const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    text: { type: String, required: function() { return this.messageType === 'text'; } },
    createdAt: { type: Date, default: Date.now, index: true },
    avatar: { type: String, required: true },
    messageType: { type: String, required: true, enum: ['text', 'steam', 'smember'] },
    teamId: { type: String, required: function() { return this.messageType === 'steam'; } },
    teamName: { type: String, required: function() { return this.messageType === 'steam'; } },
    teamAvatar: { type: String, required: function() { return this.messageType === 'steam'; } },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

// ✅ Ana Route (Server Çalışıyor mu Test Etmek İçin)
app.get("/", (req, res) => {
    res.send("✅ Server is running!");
});

// ✅ API Rotaları
app.post('/api/rooms', async (req, res) => {
    try {
        const { name } = req.body;
        const newRoom = new Room({ name });
        await newRoom.save();
        res.status(201).json(newRoom);
    } catch (error) {
        console.error("❌ /api/rooms hatası:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find();
        res.status(200).json(rooms);
    } catch (error) {
        console.error("❌ /api/rooms hatası:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { text, userId, userName, avatar, messageType, teamId, teamName, teamAvatar } = req.body;
        const { roomId } = req.params;
        const newMessage = new Message({ roomId, userId, userName, text, avatar, messageType, teamId, teamName, teamAvatar });
        await newMessage.save();
        io.to(roomId).emit('receive_msg', newMessage);
        res.status(201).json(newMessage);
    } catch (error) {
        console.error("❌ /api/rooms/:roomId/messages hatası:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await Message.find({ roomId })
            .select('userId userName text createdAt avatar messageType teamId teamName teamAvatar')
            .sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        console.error("❌ /api/rooms/:roomId/messages hatası:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ✅ Socket.io Bağlantı Yönetimi
io.on('connection', (socket) => {
    console.log(`✅ Kullanıcı bağlandı: ${socket.id}`);

    // Kullanıcı odaya katıldığında
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`✅ Kullanıcı ${socket.id} odaya katıldı: ${roomId}`);
    });

    // 30 saniyede bir bağlantıyı canlı tut
    const keepAliveInterval = setInterval(() => {
        socket.emit("keep_alive", { message: "ping" });
    }, 30000);

    socket.on('disconnect', () => {
        console.log(`❌ Kullanıcı ayrıldı: ${socket.id}`);
        clearInterval(keepAliveInterval); // Keep-alive mesajını durdur
    });
});

// ✅ Render Port Ayarlarını Kullan
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`✅ Sunucu ${PORT} numaralı portta çalışıyor.`);
});

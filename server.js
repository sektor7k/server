import express from 'express';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
}));
app.use(express.json());

// **1️⃣ MongoDB Bağlantısı**
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("✅ MongoDB bağlantısı başarılı!"))
    .catch(err => console.error("❌ MongoDB bağlantı hatası:", err));

// **2️⃣ MongoDB Şema ve Modelleri**
const roomSchema = new mongoose.Schema({ name: { type: String, required: true } });
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

messageSchema.index({ roomId: 1, createdAt: 1 }); // **🔹 Sorgu hızını artırır**
const Message = mongoose.model('Message', messageSchema);

// **3️⃣ API Rotaları**
app.get("/", (req, res) => res.send("✅ Server is running!"));

// **🚀 1. Oda Oluşturma API**
app.post('/api/rooms', async (req, res) => {
    try {
        const { name } = req.body;
        const newRoom = new Room({ name });
        await newRoom.save();
        res.status(201).json(newRoom);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// **🚀 2. Odaları Getirme API**
app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find().lean(); // **🔹 Gereksiz veri işlemesini önler**
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// **🚀 3. Mesajları Getirme API**
app.get('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await Message.find({ roomId })
            .select('userId userName text createdAt avatar messageType teamId teamName teamAvatar')
            .sort({ createdAt: 1 })
            .lean(); // **🔹 Daha hızlı sorgu**
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// **🚀 4. Mesaj Gönderme API (Hızlı)**
app.post('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { text, userId, userName, avatar, messageType, teamId, teamName, teamAvatar } = req.body;
        const { roomId } = req.params;

        const newMessage = {
            roomId,
            userId,
            userName,
            text,
            avatar,
            messageType,
            teamId,
            teamName,
            teamAvatar,
            createdAt: new Date().toISOString()
        };

        // **1️⃣ WebSocket ile mesajı anında gönder**
        io.to(roomId).emit('receive_msg', newMessage);

        // **2️⃣ Mesajı asenkron olarak MongoDB'ye kaydet**
        Message.create(newMessage).catch(err => console.error("❌ DB Error:", err));

        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// **4️⃣ WebSocket Bağlantı Yönetimi**
io.on('connection', (socket) => {
    console.log(`✅ Kullanıcı bağlandı: ${socket.id}`);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`✅ Kullanıcı ${socket.id} odaya katıldı: ${roomId}`);
    });

    // **🚀 Hızlı Mesaj Gönderme (Sadece WebSocket Kullanımı)**
    socket.on('send_msg', async (msgData) => {
        io.to(msgData.roomId).emit('receive_msg', msgData);
        Message.create(msgData).catch(err => console.error("❌ DB Error:", err));
    });

    // **🚀 WebSocket Bağlantı Kontrolü (Ping-Pong)**
    setInterval(() => {
        socket.emit('ping', { time: new Date().toISOString() });
    }, 10000); // **Her 10 saniyede bir bağlantıyı kontrol et**

    socket.on('pong', () => {
        console.log(`✅ Kullanıcıdan ping alındı: ${socket.id}`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Kullanıcı ayrıldı: ${socket.id}`);
    });
});

// **5️⃣ Sunucuyu Başlat**
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Sunucu ${PORT} numaralı portta çalışıyor.`);
});

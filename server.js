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

mongoose.connect(process.env.MONGODB_URI);

const roomSchema = new mongoose.Schema({
    name: { type: String, required: true },
});

const Room = mongoose.model('Room', roomSchema);

const messageSchema = new mongoose.Schema({
    roomId: { type: String, required: true, index: true },
    userId: { type: String, required: true, },
    userName: { type: String, required: true },
    text: { type: String, required: function() { return this.messageType === 'text'; } },
    createdAt: { type: Date, default: Date.now, index: true },
    avatar: { type: String, required: true },
    messageType: {type:String, required: true, enum:['text','steam','smember']},
    teamId: { type: String, required: function() { return this.messageType === 'steam'; } },
    teamName: { type: String, required: function() { return this.messageType === 'steam'; } }, 
    teamAvatar: { type: String, required: function() { return this.messageType === 'steam'; } }, 
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);

// API rotaları
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

app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await Room.find();
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { text, userId, userName, avatar, messageType, teamId, teamName, teamAvatar } = req.body;
        const { roomId } = req.params;
        const newMessage = new Message({ roomId, userId, userName, text, avatar, messageType, teamId, teamName, teamAvatar });
        await newMessage.save();
        io.to(roomId).emit('receive_msg', {
            userId: newMessage.userId,
            userName: newMessage.userName,
            text: newMessage.text,
            createdAt: newMessage.createdAt,
            avatar: newMessage.avatar,
            messageType: newMessage.messageType,
            teamId: newMessage.teamId,
            teamName: newMessage.teamName,
            teamAvatar: newMessage.teamAvatar
        });
        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/api/rooms/:roomId/messages', async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await Message.find({ roomId })
        .select('userId userName text createdAt avatar messageType teamId teamName teamAvatar') // Gerekli tüm alanları ekledik
        .sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

io.on('connection', (socket) => {
    console.log(`Kullanıcı bağlandı: ${socket.id}`);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`Kullanıcı ${socket.id} odaya katıldı: ${roomId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} numaralı portta çalışıyor.`);
});

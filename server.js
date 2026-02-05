const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

// Serve files from the 'public' folder
app.use(express.static(path.join(__dirname, "public")));

let rooms = {};

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Create Room
    socket.on("create_room", (roomCode) => {
        if (rooms[roomCode]) {
            socket.emit("error_msg", "Room already exists!");
        } else {
            rooms[roomCode] = { p1: socket.id, p2: null };
            socket.join(roomCode);
            socket.emit("room_created", "Room created! Waiting for P2...");
        }
    });

    // Join Room
    socket.on("join_room", (roomCode) => {
        const room = rooms[roomCode];
        if (room && !room.p2) {
            room.p2 = socket.id;
            socket.join(roomCode);
            // Notify P1 (Creator) they start first
            io.to(room.p1).emit("game_start", { startTurn: room.p1 });
            // Notify P2 (Joiner) the game started
            io.to(room.p2).emit("game_start", { startTurn: room.p1 });
        } else {
            socket.emit("error_msg", "Room is full or does not exist.");
        }
    });

    // Player Move
    socket.on("player_move", (data) => {
        socket.to(data.roomCode).emit("opponent_move", data);
    });

    // End Turn
    socket.on("end_turn", (roomCode) => {
        socket.to(roomCode).emit("your_turn");
    });

    socket.on("disconnect", () => {
        // Optional: Cleanup empty rooms
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

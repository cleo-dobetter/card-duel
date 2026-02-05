const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public")); // Serves your HTML/CSS/JS files

let rooms = {};

io.on("connection", (socket) => {
    console.log("A user connected: " + socket.id);

    // 1. Create a Room
    socket.on("create_room", (roomCode) => {
        if (rooms[roomCode]) {
            socket.emit("error_msg", "Room already exists!");
        } else {
            rooms[roomCode] = { p1: socket.id, p2: null };
            socket.join(roomCode);
            socket.emit("room_created", "Waiting for Player 2...");
        }
    });

    // 2. Join a Room
    socket.on("join_room", (roomCode) => {
        const room = rooms[roomCode];
        if (room && !room.p2) {
            room.p2 = socket.id;
            socket.join(roomCode);
            // Notify both players the game starts
            io.to(roomCode).emit("game_start", { startTurn: room.p1 }); 
        } else {
            socket.emit("error_msg", "Room full or doesn't exist.");
        }
    });

    // 3. Sync Moves (The crucial part)
    socket.on("player_move", (data) => {
        // Data contains: { roomCode, card, slot, sacrifices }
        // We broadcast this to the OTHER player in the room
        socket.to(data.roomCode).emit("opponent_move", data);
    });

    // 4. End Turn (Pass turn signal)
    socket.on("end_turn", (roomCode) => {
        socket.to(roomCode).emit("your_turn");
    });

    socket.on("disconnect", () => {
        // Handle player leaving (optional: delete room)
    });
});

http.listen(3000, () => {
    console.log("Server running on port 3000");
});

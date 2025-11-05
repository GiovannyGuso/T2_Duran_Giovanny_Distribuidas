// Trivia Buzzer & Scoreboard (no chat)
// Node.js + Express + Socket.IO

const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir cliente estático
app.use(express.static(path.join(__dirname, "public")));

const PORT = 3000;

// === Estado del juego (sala única "main") ===
const state = {
  isOpen: false,          // ¿buzzer abierto para pulsar?
  winner: null,           // { id, nick } del primero que pulsó (si hay)
  players: new Map(),     // socketId -> { nick, score }
};

// Helpers
function snapshot() {
  return {
    isOpen: state.isOpen,
    winner: state.winner,
    players: Array.from(state.players.entries()).map(([id, p]) => ({ id, ...p })),
  };
}

function broadcastState() {
  io.emit("state:update", snapshot());
}

io.on("connection", (socket) => {
  // Un jugador u host se conecta y puede enviar "player:join" con su nick
  socket.on("player:join", (nickRaw) => {
    const nick = String(nickRaw || "").trim() || `Jugador-${socket.id.slice(0,4)}`;
    // Registrar si no existía
    if (!state.players.has(socket.id)) {
      state.players.set(socket.id, { nick, score: 0 });
    } else {
      state.players.get(socket.id).nick = nick;
    }
    socket.emit("state:init", snapshot());
    broadcastState();
  });

  // Jugador pulsa el buzzer
  socket.on("buzzer:press", () => {
    if (!state.isOpen) return;   // no se puede pulsar si está cerrado
    if (state.winner) return;    // ya hay ganador
    const player = state.players.get(socket.id);
    if (!player) return;
    // asignar ganador
    state.winner = { id: socket.id, nick: player.nick };
    state.isOpen = false; // cerrar inmediatamente
    io.emit("buzzer:winner", state.winner);
    broadcastState();
  });

  // === Eventos del HOST ===
  // Abrir buzzer (nueva ronda)
  socket.on("host:open", () => {
    state.isOpen = true;
    state.winner = null;
    io.emit("buzzer:open");
    broadcastState();
  });

  // Cerrar buzzer manualmente (opcional)
  socket.on("host:close", () => {
    state.isOpen = false;
    io.emit("buzzer:close");
    broadcastState();
  });

  // Asignar puntaje al ganador actual
  socket.on("host:award", (points = 10) => {
    if (!state.winner) return;
    const entry = state.players.get(state.winner.id);
    if (!entry) return;
    entry.score += Number(points);
    io.emit("score:changed", { id: state.winner.id, score: entry.score });
    broadcastState();
  });

  // Penalizar al ganador actual
  socket.on("host:penalize", (points = 5) => {
    if (!state.winner) return;
    const entry = state.players.get(state.winner.id);
    if (!entry) return;
    entry.score -= Number(points);
    io.emit("score:changed", { id: state.winner.id, score: entry.score });
    broadcastState();
  });

  // Reset total de marcador
  socket.on("host:resetScores", () => {
    for (const [, p] of state.players) p.score = 0;
    io.emit("score:reset");
    broadcastState();
  });

  // Expulsar jugador (por id)
  socket.on("host:kick", (playerId) => {
    if (!state.players.has(playerId)) return;
    state.players.delete(playerId);
    if (state.winner && state.winner.id === playerId) {
      state.winner = null;
      state.isOpen = false;
    }
    io.emit("player:kicked", playerId);
    broadcastState();
  });

  // Desconexión
  socket.on("disconnect", () => {
    // borrar jugador si estaba
    if (state.players.has(socket.id)) {
      state.players.delete(socket.id);
      if (state.winner && state.winner.id === socket.id) {
        state.winner = null;
        state.isOpen = false;
      }
      broadcastState();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Trivia Buzzer en http://192.168.0.174:${PORT}`);
});

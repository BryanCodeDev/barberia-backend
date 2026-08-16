const clients = new Map();
const rooms = new Map();

function getRoomName(role, entityId) {
  if (role === 'client') {
    return `client:${entityId}`;
  }
  if (role === 'barber') {
    return `barber:${entityId}`;
  }
  return 'admin';
}

function register(ws, user) {
  clients.set(ws, user);
  const roomName = getRoomName(user.role, user.id);
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  rooms.get(roomName).add(ws);
  ws.room = roomName;
  ws.user = user;
}

function unregister(ws) {
  if (!ws) return;
  clients.delete(ws);
  if (ws.room && rooms.has(ws.room)) {
    rooms.get(ws.room).delete(ws);
    if (rooms.get(ws.room).size === 0) {
      rooms.delete(ws.room);
    }
  }
  ws.room = null;
  ws.user = null;
}

function getRoomSockets(roomName) {
  return rooms.has(roomName) ? Array.from(rooms.get(roomName)) : [];
}

function getSocketBySessionId(sessionId) {
  for (const [ws, user] of clients.entries()) {
    if (user.session_id === sessionId) {
      return ws;
    }
  }
  return null;
}

function getRoomNames() {
  return Array.from(rooms.keys());
}

module.exports = {
  register,
  unregister,
  getRoomSockets,
  getSocketBySessionId,
  getRoomNames,
};

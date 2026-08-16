const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { authenticateSocket } = require('./auth');
const { register, unregister, getRoomSockets, getSocketBySessionId } = require('./rooms');
const pool = require('../config/database');

const EVENTS = {
  APPOINTMENT_CREATED: 'appointment:created',
  APPOINTMENT_UPDATED: 'appointment:updated',
  APPOINTMENT_STATUS_CHANGED: 'appointment:status-changed',
  APPOINTMENT_CANCELLED: 'appointment:cancelled',
  APPOINTMENT_DELETED: 'appointment:deleted',
  NOTIFICATION_NEW: 'notification:new',
  SESSION_REPLACED: 'session:replaced',
};

function createWebSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const token = params.get('token');

    const authResult = await authenticateSocket(token);

    if (!authResult.authenticated) {
      ws.send(JSON.stringify({ type: 'error', reason: authResult.reason }));
      ws.close(4001, 'Unauthorized');
      return;
    }

    register(ws, authResult.user);

    ws.send(JSON.stringify({ type: 'connected', user: authResult.user }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      unregister(ws);
    });

    ws.on('error', () => {
      unregister(ws);
    });
  });

  return {
    broadcastToRoom(roomName, payload, excludeWs = null) {
      const sockets = getRoomSockets(roomName);
      const message = JSON.stringify(payload);
      for (const socket of sockets) {
        if (socket !== excludeWs && socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    },

    broadcastToAdmin(payload, excludeWs = null) {
      this.broadcastToRoom('admin', payload, excludeWs);
    },

    broadcastToClient(clientId, payload, excludeWs = null) {
      this.broadcastToRoom(`client:${clientId}`, payload, excludeWs);
    },

    emitAppointmentCreated(appointment, actorRole) {
      const payload = { type: EVENTS.APPOINTMENT_CREATED, data: appointment, actorRole };
      this.broadcastToAdmin(payload);
    },

    emitAppointmentUpdated(appointment, actorRole) {
      const payload = { type: EVENTS.APPOINTMENT_UPDATED, data: appointment, actorRole };
      this.broadcastToAdmin(payload);
    },

    emitAppointmentStatusChanged(appointment, actorRole) {
      const payload = { type: EVENTS.APPOINTMENT_STATUS_CHANGED, data: appointment, actorRole };
      this.broadcastToAdmin(payload);
      if (appointment.client_id) {
        this.broadcastToClient(appointment.client_id, payload);
      }
    },

    emitAppointmentCancelled(appointment, actorRole) {
      const payload = { type: EVENTS.APPOINTMENT_CANCELLED, data: appointment, actorRole };
      this.broadcastToAdmin(payload);
      if (appointment.client_id) {
        this.broadcastToClient(appointment.client_id, payload);
      }
    },

    emitAppointmentDeleted(appointmentId, actorRole) {
      const payload = { type: EVENTS.APPOINTMENT_DELETED, data: { id: appointmentId }, actorRole };
      this.broadcastToAdmin(payload);
    },

    emitNotificationNew(notification) {
      const payload = { type: EVENTS.NOTIFICATION_NEW, data: notification };
      if (notification.user_role === 'client') {
        this.broadcastToClient(notification.user_id, payload);
      } else {
        this.broadcastToAdmin(payload);
      }
    },

    closeSession(sessionId) {
      const ws = getSocketBySessionId(sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: EVENTS.SESSION_REPLACED }));
        ws.close(4002, 'Session replaced');
      }
    },

    getEvents() {
      return EVENTS;
    },
  };
}

module.exports = { createWebSocketServer, EVENTS };

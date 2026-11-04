// Reemplazo local de socket.io: la cabina (admin) ejecuta la lógica del servidor
// y sincroniza las pantallas de escenario mediante BroadcastChannel y Presentation API.
(function () {
  const isHost = document.body.classList.contains('admin-page');
  const channel = new BroadcastChannel('stagedsp');
  const handlers = {};
  const peers = new Set();
  let connected = false;
  let lastSeen = 0;

  function fire(event, payload) {
    (handlers[event] || []).forEach((handler) => handler(payload));
  }

  const socket = {
    on(event, handler) {
      (handlers[event] = handlers[event] || []).push(handler);
      if (event === 'connect' && connected) handler();
      return socket;
    },
    emit(event, payload) {
      if (isHost) host.handle(event, payload);
    }
  };

  function setConnected(value) {
    if (connected === value) return;
    connected = value;
    fire(value ? 'connect' : 'disconnect');
  }

  function send(message) {
    channel.postMessage(message);
    const data = JSON.stringify(message);
    peers.forEach((peer) => {
      try {
        if (peer.state === 'connected') peer.send(data);
      } catch {
        peers.delete(peer);
      }
    });
  }

  const host = !isHost ? null : (() => {
    const state = {
      timer: { durationSeconds: 300, remainingSeconds: 300, running: false, finished: false, endsAt: null },
      meterDb: 0,
      message: '',
      messageDuration: 5,
      messageUntil: 0
    };

    const remaining = () => (!state.timer.running || !state.timer.endsAt
      ? state.timer.remainingSeconds
      : Math.max(0, Math.ceil((state.timer.endsAt - Date.now()) / 1000)));

    const snapshot = () => ({
      timer: { ...state.timer, remainingSeconds: remaining() },
      meterDb: state.meterDb,
      message: state.message,
      messageDuration: state.messageDuration,
      messageBlinking: Boolean(state.message && Date.now() < state.messageUntil)
    });

    function broadcast() {
      const snap = snapshot();
      fire('state', snap);
      send({ type: 'state', state: snap });
    }

    let messageTimeout = null;

    const actions = {
      'timer:set'(payload = {}) {
        if (state.timer.running) return;
        const seconds = Number(payload.durationSeconds);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 5999) return;
        Object.assign(state.timer, { durationSeconds: seconds, remainingSeconds: seconds, finished: false, endsAt: null });
        broadcast();
      },
      'timer:start'() {
        if (state.timer.running || state.timer.remainingSeconds <= 0) return;
        Object.assign(state.timer, { running: true, finished: false, endsAt: Date.now() + state.timer.remainingSeconds * 1000 });
        broadcast();
      },
      'timer:pause'() {
        if (!state.timer.running) return;
        Object.assign(state.timer, { remainingSeconds: remaining(), running: false, endsAt: null });
        broadcast();
      },
      'timer:reset'() {
        Object.assign(state.timer, { remainingSeconds: state.timer.durationSeconds, running: false, finished: false, endsAt: null });
        broadcast();
      },
      'meter:update'(value) {
        const db = Number(value);
        if (!Number.isFinite(db)) return;
        state.meterDb = Math.max(0, Math.min(120, Math.round(db)));
        broadcast();
      },
      'message:send'(payload = {}) {
        const text = String(payload.text || '').trim().slice(0, 140);
        const duration = Math.max(2, Math.min(15, Number.parseInt(payload.duration, 10) || 5));
        if (!text) return;
        Object.assign(state, { message: text, messageDuration: duration, messageUntil: Date.now() + duration * 1000 });
        clearTimeout(messageTimeout);
        broadcast();
        messageTimeout = setTimeout(broadcast, duration * 1000);
      }
    };

    setInterval(() => {
      if (state.timer.running && remaining() === 0) {
        Object.assign(state.timer, { remainingSeconds: 0, running: false, finished: true, endsAt: null });
      }
      broadcast();
    }, 250);

    channel.onmessage = (event) => {
      if (event.data?.type === 'hello') send({ type: 'state', state: snapshot() });
    };

    return {
      handle(event, payload) {
        if (actions[event]) actions[event](payload);
      },
      start() {
        setConnected(true);
        setTimeout(() => fire('state', snapshot()));
      }
    };
  })();

  function receive(message) {
    if (message?.type !== 'state') return;
    lastSeen = Date.now();
    setConnected(true);
    fire('state', message.state);
  }

  function listenToPeer(connection) {
    connection.onmessage = (event) => {
      try {
        receive(JSON.parse(event.data));
      } catch {
        // Mensaje inválido ignorado.
      }
    };
  }

  const bus = {
    addPresentationConnection(connection) {
      peers.add(connection);
      connection.addEventListener('terminate', () => peers.delete(connection));
      connection.addEventListener('close', () => peers.delete(connection));
    }
  };

  if (isHost) {
    host.start();
  } else {
    channel.onmessage = (event) => receive(event.data);
    channel.postMessage({ type: 'hello' });
    setInterval(() => {
      if (!connected) channel.postMessage({ type: 'hello' });
      else if (Date.now() - lastSeen > 3000) setConnected(false);
    }, 1000);

    // Receptor de la Presentation API (por ejemplo Chromecast).
    if (navigator.presentation?.receiver) {
      navigator.presentation.receiver.connectionList.then((list) => {
        list.connections.forEach(listenToPeer);
        list.addEventListener('connectionavailable', (event) => listenToPeer(event.connection));
      });
    }
  }

  window.stageBus = bus;
  window.io = () => socket;
})();

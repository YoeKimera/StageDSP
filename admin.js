const socket = io();
const timerProgress = document.getElementById('timerProgress');
const timerRing = document.getElementById('timerRing');
const timerCircumference = 2 * Math.PI * 46;
const minutesInput = document.getElementById('minutesInput');
const secondsInput = document.getElementById('secondsInput');
const timerToggle = document.getElementById('timerToggle');
const meterCondition = document.getElementById('meterCondition');
const meterConditionText = document.getElementById('meterConditionText');
const messagePreview = document.getElementById('messagePreview');
const toast = document.getElementById('toast');
let latestState = null;
let audioContext = null;
let microphoneStream = null;
let analyser = null;
let audioSamples = null;
let meterInterval = null;
let toastTimeout = null;

timerProgress.style.strokeDasharray = String(timerCircumference);

function setToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 6000);
}

function conditionFor(db) {
  if (db > 97) return { className: 'danger', text: 'Exceso de volumen. Riesgo físico.' };
  if (db > 90) return { className: 'warning', text: 'Riesgo de distorsión' };
  return { className: 'good', text: 'Nivel óptimo' };
}

function updateCondition(element, textElement, db) {
  const condition = conditionFor(db);
  if (element.classList.contains(condition.className) && textElement.textContent === condition.text) return;
  element.classList.remove('good', 'warning', 'danger');
  element.classList.add(condition.className);
  textElement.textContent = condition.text;
}

function configuredSeconds() {
  const minutes = Math.max(0, Math.min(99, Number.parseInt(minutesInput.value, 10) || 0));
  const seconds = Math.max(0, Math.min(59, Number.parseInt(secondsInput.value, 10) || 0));
  minutesInput.value = String(minutes);
  secondsInput.value = String(seconds);
  return minutes * 60 + seconds;
}

[minutesInput, secondsInput].forEach((input) => {
  input.addEventListener('change', () => {
    if (latestState?.timer.running) return;
    const durationSeconds = configuredSeconds();
    if (durationSeconds > 0) socket.emit('timer:set', { durationSeconds });
  });
});

function renderTimer(timer) {
  const remaining = Math.max(0, timer.remainingSeconds);
  document.getElementById('timerValue').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const progress = timer.durationSeconds ? remaining / timer.durationSeconds : 0;
  timerProgress.style.strokeDashoffset = String(timerCircumference * (1 - progress));
  timerRing.classList.toggle('finished', timer.finished);
  document.getElementById('timerStatus').textContent = timer.finished ? 'TIEMPO TERMINADO' : timer.running ? 'EN CURSO' : remaining === timer.durationSeconds ? 'LISTO' : 'EN PAUSA';
  timerProgress.style.stroke = timer.finished ? 'var(--red)' : 'var(--green)';
  timerToggle.textContent = timer.running ? 'Pausar' : timer.remainingSeconds === 0 ? 'Terminado' : timer.remainingSeconds === timer.durationSeconds ? 'Iniciar' : 'Continuar';
  timerToggle.disabled = timer.finished;
  minutesInput.disabled = timer.running;
  secondsInput.disabled = timer.running;
}

function renderMeter(db) {
  const value = Math.max(0, Math.min(120, Math.round(db)));
  document.getElementById('dbValue').textContent = String(value);
  document.getElementById('meterAria').setAttribute('aria-valuenow', String(value));
  document.getElementById('meterAria').setAttribute('aria-valuetext', `${value} decibelios`);
  const levelFill = document.getElementById('levelFill');
  levelFill.style.width = `${value / 1.2}%`;
  const condition = conditionFor(value);
  levelFill.style.backgroundColor = `var(--${condition.className === 'good' ? 'green' : condition.className === 'warning' ? 'amber' : 'red'})`;
  updateCondition(meterCondition, meterConditionText, value);
}

socket.on('connect', () => {
  document.getElementById('connectionDot').classList.add('connected');
  document.getElementById('connectionStatus').textContent = 'Conectado';
});
socket.on('disconnect', () => {
  document.getElementById('connectionDot').classList.remove('connected');
  document.getElementById('connectionStatus').textContent = 'Conexión interrumpida';
});
socket.on('state', (state) => {
  latestState = state;
  renderTimer(state.timer);
  if (document.activeElement !== minutesInput && document.activeElement !== secondsInput) {
    minutesInput.value = String(Math.floor(state.timer.durationSeconds / 60));
    secondsInput.value = String(state.timer.durationSeconds % 60);
  }
  renderMeter(state.meterDb);
  if (state.message) {
    messagePreview.textContent = state.message;
    messagePreview.classList.add('has-message');
    messagePreview.classList.toggle('blink', state.messageBlinking);
  }
});

document.getElementById('timerToggle').addEventListener('click', () => {
  if (latestState?.timer.running) {
    socket.emit('timer:pause');
    return;
  }
  if (!latestState?.timer.running && latestState?.timer.remainingSeconds === latestState?.timer.durationSeconds) {
    const durationSeconds = configuredSeconds();
    if (!durationSeconds) {
      setToast('El temporizador debe tener al menos un segundo.');
      return;
    }
    socket.emit('timer:set', { durationSeconds });
  }
  socket.emit('timer:start');
});

document.getElementById('timerReset').addEventListener('click', () => {
  const durationSeconds = configuredSeconds();
  if (!durationSeconds) {
    setToast('El temporizador debe tener al menos un segundo.');
    return;
  }
  socket.emit('timer:set', { durationSeconds });
  socket.emit('timer:reset');
});

document.getElementById('messageForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text) return input.focus();
  socket.emit('message:send', { text, duration: document.getElementById('blinkDuration').value });
  input.value = '';
  input.focus();
});

document.getElementById('calibrationInput').addEventListener('input', (event) => {
  document.getElementById('calibrationValue').value = `${event.target.value} dB`;
});

function updateMicrophone() {
  if (!analyser || !audioSamples) return;
  analyser.getFloatTimeDomainData(audioSamples);
  let sumSquares = 0;
  for (const sample of audioSamples) sumSquares += sample * sample;
  const rms = Math.sqrt(sumSquares / audioSamples.length);
  const db = rms > 0 ? 60 + 20 * Math.log10(rms / 0.03) + Number(document.getElementById('calibrationInput').value) : 0;
  socket.emit('meter:update', Math.max(0, Math.min(120, db)));
}

async function stopMicrophone() {
  if (meterInterval) clearInterval(meterInterval);
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== 'closed') await audioContext.close();
  meterInterval = null;
  microphoneStream = null;
  audioContext = null;
  analyser = null;
  audioSamples = null;
  document.getElementById('micToggle').textContent = 'Activar micrófono';
  socket.emit('meter:update', 0);
}

document.getElementById('micToggle').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (microphoneStream) {
    await stopMicrophone();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setToast('El micrófono requiere localhost o una conexión HTTPS.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Solicitando acceso…';
  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(microphoneStream).connect(analyser);
    audioSamples = new Float32Array(analyser.fftSize);
    updateMicrophone();
    meterInterval = setInterval(updateMicrophone, 300);
    button.textContent = 'Desactivar micrófono';
  } catch (error) {
    if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    button.textContent = 'Activar micrófono';
    setToast(error.name === 'NotAllowedError' ? 'Permiso de micrófono denegado.' : 'No se pudo activar el micrófono.');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('openStage').addEventListener('click', () => {
  const stageWindow = window.open('stage.html', 'stagedsp-stage', 'popup,width=1280,height=720');
  if (!stageWindow) setToast('El navegador bloqueó la ventana. Permite las ventanas emergentes para abrir el escenario.');
});

document.getElementById('castStage').addEventListener('click', async () => {
  if (!window.isSecureContext || !('PresentationRequest' in window)) {
    setToast('Chromecast requiere Chrome compatible y una dirección HTTPS accesible para ambos dispositivos. Usa «Abrir pantalla escenario» en esta red local.');
    return;
  }
  try {
    const request = new PresentationRequest([new URL('stage.html', window.location.href).href]);
    if (navigator.presentation) navigator.presentation.defaultRequest = request;
    const connection = await request.start();
    window.stageBus.addPresentationConnection(connection);
    setToast('Pantalla de escenario conectada.');
  } catch (error) {
    setToast(error.name === 'NotFoundError' ? 'No se encontró una pantalla disponible para transmitir.' : 'No se pudo iniciar la transmisión. Revisa la conexión y permisos del navegador.');
  }
});

window.addEventListener('beforeunload', () => {
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
});
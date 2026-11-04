const socket = io();
const timerProgress = document.getElementById('stageTimerProgress');
const timerRing = document.getElementById('stageTimerRing');
const circumference = 2 * Math.PI * 46;

timerProgress.style.strokeDasharray = String(circumference);

function updateCondition(db) {
  const condition = db > 95
    ? { className: 'danger', text: 'Exceso de volumen. Riesgo físico.' }
    : db > 85
      ? { className: 'warning', text: 'Riesgo de distorsión' }
      : { className: 'good', text: 'Nivel óptimo' };
  const element = document.getElementById('stageCondition');
  element.classList.remove('good', 'warning', 'danger');
  element.classList.add(condition.className);
  document.getElementById('stageConditionText').textContent = condition.text;
  return condition.className;
}

function render(state) {
  const timer = state.timer;
  const value = Math.max(0, timer.remainingSeconds);
  document.getElementById('stageTimerValue').textContent = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  timerProgress.style.strokeDashoffset = String(circumference * (1 - (timer.durationSeconds ? value / timer.durationSeconds : 0)));
  timerRing.classList.toggle('finished', timer.finished);
  timerProgress.style.stroke = timer.finished ? 'var(--red)' : 'var(--green)';
  document.getElementById('stageTimerStatus').textContent = timer.finished ? 'TIEMPO TERMINADO' : timer.running ? 'EN CURSO' : value === timer.durationSeconds ? 'LISTO' : 'EN PAUSA';

  const db = Math.max(0, Math.min(120, Math.round(state.meterDb)));
  document.getElementById('stageDbValue').textContent = String(db);
  const levelFill = document.getElementById('stageLevelFill');
  levelFill.style.width = `${db / 1.2}%`;
  const condition = updateCondition(db);
  levelFill.style.backgroundColor = `var(--${condition === 'good' ? 'green' : condition === 'warning' ? 'amber' : 'red'})`;

  const message = document.getElementById('stageMessage');
  if (state.message) {
    message.textContent = state.message;
    message.classList.add('has-message');
    message.classList.toggle('blink', state.messageBlinking);
  }
}

socket.on('connect', () => {
  document.getElementById('stageConnection').textContent = 'Conectado';
  document.querySelector('.stage-live').classList.add('connected');
});
socket.on('disconnect', () => {
  document.getElementById('stageConnection').textContent = 'Sin conexión';
  document.querySelector('.stage-live').classList.remove('connected');
});
socket.on('state', render);

document.getElementById('stageShell').addEventListener('dblclick', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    document.getElementById('stageConnection').textContent = 'Pantalla completa no disponible';
  }
});
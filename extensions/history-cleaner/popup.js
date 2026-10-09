import { loadSettings, saveSettings, parseDomains } from './settings.js';

const $ = (id) => document.getElementById(id);
const extraBoxes = [...document.querySelectorAll('[data-extra]')];

const REASON = { manual: '직접', interval: '주기', close: '브라우저 닫음', startup: '브라우저 시작' };
const EXTRA = { downloads: '다운로드 목록', cache: '캐시', cookies: '쿠키', formData: '자동완성' };
const KEEP = { 60: '최근 1시간 남김', 1440: '최근 1일 남김', 10080: '최근 7일 남김', 43200: '최근 30일 남김' };

const timeFmt = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function fmt(ts) {
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? '오늘 ' + d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : timeFmt.format(d);
}

function summary(s) {
  const parts = [s.keepMinutes > 0 ? `방문 기록(${KEEP[s.keepMinutes] ?? '일부 남김'})` : '방문 기록 전부'];
  for (const [k, on] of Object.entries(s.extra)) if (on) parts.push(EXTRA[k]);
  return '지울 것: ' + parts.join(' · ');
}

async function renderStatus() {
  const s = await loadSettings();
  const { last } = await chrome.storage.local.get('last');
  const lastEl = $('last');
  if (last) {
    lastEl.textContent = last.error ? `${fmt(last.at)} 실패` : `${fmt(last.at)} (${REASON[last.reason] ?? last.reason})`;
    lastEl.title = last.error ?? '';
    lastEl.classList.toggle('error', Boolean(last.error));
  }

  const alarm = await chrome.alarms.get('auto-clear');
  let next;
  if (!s.enabled) next = '자동 삭제 꺼짐';
  else if (alarm) next = fmt(alarm.scheduledTime);
  else if (s.onClose) next = '브라우저를 닫을 때';
  else next = '없음';
  $('next').textContent = next;

  $('summary').textContent = summary(s);
  document.body.classList.toggle('off', !s.enabled);
}

async function renderForm() {
  const s = await loadSettings();
  $('enabled').checked = s.enabled;
  $('interval').value = String(s.intervalMinutes);
  $('onClose').checked = s.onClose;
  $('keep').value = String(s.keepMinutes);
  for (const box of extraBoxes) box.checked = s.extra[box.dataset.extra];
  $('domains').value = s.domains.join('\n');
}

async function save(patch) {
  const next = await saveSettings(patch);
  // 알람은 백그라운드가 설정 변경을 보고 다시 건다 — 조금 기다렸다 다시 읽는다
  setTimeout(renderStatus, 150);
  renderStatus();
  return next;
}

$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
$('interval').addEventListener('change', (e) => save({ intervalMinutes: Number(e.target.value) }));
$('onClose').addEventListener('change', (e) => save({ onClose: e.target.checked }));
$('keep').addEventListener('change', (e) => save({ keepMinutes: Number(e.target.value) }));
for (const box of extraBoxes) {
  box.addEventListener('change', () => save({ extra: { [box.dataset.extra]: box.checked } }));
}

// 사이트 목록: 글자마다 저장하면 매번 기록 전체를 훑게 되므로 저장 버튼이나 포커스를 떠날 때만 저장한다
const domainsEl = $('domains');
const saveBtn = $('saveDomains');
domainsEl.addEventListener('input', () => {
  saveBtn.disabled = false;
  $('domainsNote').textContent = '';
});
async function saveDomains() {
  if (saveBtn.disabled) return;
  saveBtn.disabled = true; // 버튼을 누르면 blur 와 click 이 연달아 온다
  const domains = parseDomains(domainsEl.value);
  const s = await save({ domains });
  domainsEl.value = domains.join('\n');
  let note = '저장함';
  if (domains.length) note = `${domains.length}곳 저장함 · ` + (s.enabled ? '이미 남은 기록도 지웁니다' : '자동 삭제가 꺼져 있어 쉬는 중');
  $('domainsNote').textContent = note;
}
saveBtn.addEventListener('click', saveDomains);
domainsEl.addEventListener('blur', saveDomains);

// 되돌릴 수 없으니 두 번 눌러야 지운다
const clearBtn = $('clear');
let armed = null;
function disarm() {
  clearTimeout(armed);
  armed = null;
  clearBtn.classList.remove('armed');
  clearBtn.textContent = '지금 지우기';
}
clearBtn.addEventListener('click', async () => {
  if (!armed) {
    clearBtn.classList.add('armed');
    clearBtn.textContent = '한 번 더 누르면 지웁니다';
    armed = setTimeout(disarm, 3000);
    return;
  }
  disarm();
  clearBtn.disabled = true;
  clearBtn.textContent = '지우는 중…';
  const last = await chrome.runtime.sendMessage({ type: 'clear-now' });
  clearBtn.disabled = false;
  clearBtn.textContent = last?.error ? '실패 — 다시 시도' : '지웠습니다';
  setTimeout(() => (clearBtn.textContent = '지금 지우기'), 2000);
  renderStatus();
});

renderForm();
renderStatus();

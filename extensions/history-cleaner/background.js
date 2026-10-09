import { loadSettings, matchesDomain } from './settings.js';

const ALARM = 'auto-clear';

// 설정대로 지운다. reason: manual | interval | close | startup
async function clearHistory(reason) {
  const s = await loadSettings();
  const now = Date.now();
  if (s.keepMinutes > 0) {
    await chrome.history.deleteRange({ startTime: 0, endTime: now - s.keepMinutes * 60_000 });
    // 남겨 둔 최근 기록 안에도 '바로 지울 사이트'는 남기지 않는다
    await sweepDomains(s.domains);
  } else {
    await chrome.history.deleteAll();
  }
  // browsingData 는 '언제부터'만 받으므로 함께 지울 것들은 기간과 상관없이 전부 지운다
  const types = Object.fromEntries(Object.entries(s.extra).filter(([, on]) => on));
  if (Object.keys(types).length) await chrome.browsingData.remove({ since: 0 }, types);
  return { at: now, reason };
}

// 실패해도 다음 기회가 있으므로 기록만 남기고 넘어간다
async function run(reason) {
  let last;
  try {
    last = await clearHistory(reason);
  } catch (e) {
    console.error('기록 지우개:', e);
    last = { at: Date.now(), reason, error: String(e?.message ?? e) };
  }
  await chrome.storage.local.set({ last });
  return last;
}

async function sweepDomains(domains) {
  if (!domains.length) return;
  // maxResults: 0 은 개수 제한 없이 전부
  const items = await chrome.history.search({ text: '', startTime: 0, maxResults: 0 });
  const hits = items.filter((it) => matchesDomain(it.url, domains));
  await Promise.all(hits.map((it) => chrome.history.deleteUrl({ url: it.url })));
}

async function syncAlarm() {
  const s = await loadSettings();
  const period = s.enabled ? s.intervalMinutes : 0;
  const cur = await chrome.alarms.get(ALARM);
  if (!period) {
    if (cur) await chrome.alarms.clear(ALARM);
    return;
  }
  if (cur?.periodInMinutes === period) return;
  await chrome.alarms.create(ALARM, { delayInMinutes: period, periodInMinutes: period });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncAlarm();
  // 처음 깔았을 때 무엇이 언제 지워지는지 먼저 보여 준다
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

// 알람은 브라우저를 다시 켜면 사라질 수 있어 시작할 때마다 다시 건다
chrome.runtime.onStartup.addListener(async () => {
  await syncAlarm();
  const s = await loadSettings();
  if (s.enabled && s.onClose) await run('startup');
});

// 마지막 창이 닫히면 브라우저가 곧 꺼져 끝까지 못 지울 수 있다 — 그래서 시작할 때도 지운다
chrome.windows.onRemoved.addListener(async () => {
  const s = await loadSettings();
  if (!s.enabled || !s.onClose) return;
  const left = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (left.length === 0) await run('close');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  const s = await loadSettings();
  if (s.enabled) await run('interval');
});

chrome.history.onVisited.addListener(async (item) => {
  const s = await loadSettings();
  if (s.enabled && matchesDomain(item.url, s.domains)) {
    await chrome.history.deleteUrl({ url: item.url });
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  await syncAlarm();
  // 새로 넣은 사이트(또는 다시 켰을 때 전부)는 이미 남아 있는 기록도 지운다
  const { oldValue, newValue } = changes.settings;
  if (!newValue?.enabled) return;
  const before = oldValue?.enabled ? oldValue.domains ?? [] : [];
  await sweepDomains(newValue.domains.filter((d) => !before.includes(d)));
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'clear-now') return;
  run('manual').then(reply);
  return true;
});

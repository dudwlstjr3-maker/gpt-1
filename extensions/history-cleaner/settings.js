// 설정 읽기·쓰기와 사이트 주소 다루기. 백그라운드와 팝업이 같이 쓴다.

export const DEFAULTS = {
  enabled: true, // 자동 삭제 전체 스위치. 꺼도 '지금 지우기'는 된다
  intervalMinutes: 60, // 0 이면 주기 삭제를 하지 않는다
  onClose: true, // 창을 모두 닫으면 지우고, 다음에 켤 때 한 번 더 지운다
  keepMinutes: 0, // 0 이면 방문 기록 전부, 아니면 최근 N분은 남긴다
  extra: { downloads: false, cache: false, cookies: false, formData: false },
  domains: [], // 방문하는 즉시 기록에서 지울 사이트
};

export async function loadSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings, extra: { ...DEFAULTS.extra, ...settings.extra } };
}

export async function saveSettings(patch) {
  const cur = await loadSettings();
  const next = { ...cur, ...patch, extra: { ...cur.extra, ...patch.extra } };
  await chrome.storage.local.set({ settings: next });
  return next;
}

// "https://www.YouTube.com/watch" → "youtube.com"
export function normalizeDomain(input) {
  let d = input.trim().toLowerCase();
  if (!d) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(d)) {
    try {
      d = new URL(d).hostname;
    } catch {
      return '';
    }
  }
  d = d.split(/[/:?#\s]/)[0].replace(/^\*\./, '').replace(/^www\./, '').replace(/\.$/, '');
  return d.includes('.') || d === 'localhost' ? d : '';
}

export function parseDomains(text) {
  return [...new Set(text.split(/[\n,]/).map(normalizeDomain).filter(Boolean))];
}

// youtube.com 은 youtube.com, www.youtube.com, m.youtube.com 에 걸린다
export function matchesDomain(url, domains) {
  if (!domains.length) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith('.' + d));
}

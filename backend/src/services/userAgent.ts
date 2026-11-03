/**
 * A small user-agent classifier for the traffic analytics: browser, operating system, device and
 * whether the client is a person's browser, a crawler or scanner, or a tool. It is a hand-written
 * list on purpose (a few dozen patterns, no dependency or licence to carry); the result is an
 * indication, since a client can send any user agent.
 */
export type ClientKind = 'browser' | 'bot' | 'tool' | 'unknown';
export type Device = 'desktop' | 'mobile' | 'tablet' | null;

export interface UserAgentInfo {
  kind: ClientKind;
  /** "Chrome", "Firefox", "Googlebot", "curl", "Other" */
  name: string;
  os: string;
  device: Device;
}

// Crawlers and scanners: the name is shown, so the more specific patterns come first
const BOTS: Array<[RegExp, string]> = [
  [/googlebot|adsbot-google|mediapartners-google/i, 'Googlebot'],
  [/bingbot|msnbot|bingpreview/i, 'Bingbot'],
  [/duckduckbot/i, 'DuckDuckBot'],
  [/baiduspider/i, 'Baidu'],
  [/yandex(bot|images)?/i, 'Yandex'],
  [/applebot/i, 'Applebot'],
  [/facebookexternalhit|meta-externalagent/i, 'Facebook'],
  [/twitterbot/i, 'Twitter'],
  [/slackbot|discordbot|telegrambot|whatsapp/i, 'Link preview'],
  [/gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexitybot|ccbot|bytespider|amazonbot/i, 'AI crawler'],
  [/ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|seznambot/i, 'SEO crawler'],
  [/uptimerobot|pingdom|statuscake|better ?uptime|site24x7|monitor/i, 'Uptime monitor'],
  [/zgrab|masscan|nmap|nuclei|sqlmap|nikto|wpscan|dirbuster|gobuster|censys|shodan|internet-measurement|expanse|netcraft/i, 'Scanner'],
];

// Anything else that calls itself a bot, checked after the tools ("Botocore" is an SDK, not a bot)
const GENERIC_BOT = /\bbot\b|bot\/|crawler|spider|crawl|scrap/i;

// Command-line and library clients: real traffic, but not a person at a browser
const TOOLS: Array<[RegExp, string]> = [
  [/^curl\//i, 'curl'],
  [/^wget\//i, 'Wget'],
  [/python-requests|python-urllib|aiohttp|httpx|^python/i, 'Python'],
  [/^go-http-client/i, 'Go'],
  [/okhttp/i, 'OkHttp'],
  [/^java\/|apache-httpclient/i, 'Java'],
  [/postmanruntime|insomnia/i, 'API client'],
  [/boto3|botocore|aws-sdk|aws-cli|s3cmd|rclone|minio|cyberduck/i, 'S3 / AWS client'],
  [/^node|axios|node-fetch|undici/i, 'Node.js'],
  [/libwww-perl|^perl/i, 'Perl'],
  [/^php|guzzle/i, 'PHP'],
  [/^ruby|faraday/i, 'Ruby'],
  [/dalvik|cfnetwork/i, 'Mobile app'],
  [/git\/|go-git/i, 'Git'],
  [/docker|containerd/i, 'Docker'],
];

function operatingSystem(ua: string): string {
  if (/windows nt|win64|win32/i.test(ua)) return 'Windows';
  if (/iphone|ipad|ipod|cpu os|cfnetwork.*darwin/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/mac os x|macintosh|darwin/i.test(ua)) return 'macOS';
  if (/linux|x11|ubuntu|debian|fedora/i.test(ua)) return 'Linux';
  return 'Other';
}

function browserName(ua: string): string | null {
  if (/edg(e|a|ios)?\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/firefox\/|fxios/i.test(ua)) return 'Firefox';
  if (/(chrome|chromium|crios)\//i.test(ua)) return 'Chrome';
  if (/version\/[\d.]+.*safari\//i.test(ua) || /safari\//i.test(ua)) return 'Safari';
  if (/msie |trident\//i.test(ua)) return 'Internet Explorer';
  return null;
}

function deviceOf(ua: string): Device {
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function classifyUserAgent(userAgent: string | undefined | null): UserAgentInfo {
  const ua = String(userAgent ?? '').trim();
  if (!ua) return { kind: 'unknown', name: 'No user agent', os: 'Other', device: null };

  for (const [pattern, name] of BOTS) {
    if (pattern.test(ua)) {
      return { kind: 'bot', name, os: operatingSystem(ua), device: null };
    }
  }
  for (const [pattern, name] of TOOLS) {
    if (pattern.test(ua)) return { kind: 'tool', name, os: operatingSystem(ua), device: null };
  }
  if (GENERIC_BOT.test(ua)) return { kind: 'bot', name: 'Other bot', os: operatingSystem(ua), device: null };
  const browser = browserName(ua);
  if (browser) return { kind: 'browser', name: browser, os: operatingSystem(ua), device: deviceOf(ua) };
  return { kind: 'unknown', name: 'Other', os: operatingSystem(ua), device: null };
}

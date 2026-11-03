const { classifyUserAgent } = require('../../src/services/userAgent');

const cases = [
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'browser', 'Chrome', 'Windows', 'desktop'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0', 'browser', 'Edge', 'Windows', 'desktop'],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'browser', 'Firefox', 'Linux', 'desktop'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', 'browser', 'Safari', 'macOS', 'desktop'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 'browser', 'Safari', 'iOS', 'mobile'],
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', 'browser', 'Chrome', 'Android', 'mobile'],
  ['Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'browser', 'Chrome', 'Android', 'tablet'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0', 'browser', 'Opera', 'Windows', 'desktop'],
  ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'bot', 'Googlebot', 'Other', null],
  ['Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)', 'bot', 'SEO crawler', 'Other', null],
  ['Mozilla/5.0 zgrab/0.x', 'bot', 'Scanner', 'Other', null],
  ['curl/7.81.0', 'tool', 'curl', 'Other', null],
  ['Boto3/1.43.123 md/Botocore#1.43.123 ua/2.1 os/linux#6.8.0-147-generic md/arch#x86_64 lang/python#3.12.3', 'tool', 'S3 / AWS client', 'Linux', null],
  ['python-requests/2.31.0', 'tool', 'Python', 'Other', null],
  ['Go-http-client/2.0', 'tool', 'Go', 'Other', null],
  ['', 'unknown', 'No user agent', 'Other', null],
  [undefined, 'unknown', 'No user agent', 'Other', null],
  ['SomethingElse/1.0', 'unknown', 'Other', 'Other', null],
];

test.each(cases)('%s', (ua, kind, name, os, device) => {
  expect(classifyUserAgent(ua)).toEqual({ kind, name, os, device });
});

// Suppress noisy console output from services during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore && console.log.mockRestore();
  console.info.mockRestore && console.info.mockRestore();
  console.warn.mockRestore && console.warn.mockRestore();
  console.error.mockRestore && console.error.mockRestore();
});

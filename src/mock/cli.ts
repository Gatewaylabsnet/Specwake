import { startMock } from './server.js';
const mock = await startMock(4319);
console.error(`Specwake mock: ${mock.target.baseUrl}`);

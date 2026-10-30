import dotenv from 'dotenv';

// Load test settings before any app module reads process.env.
dotenv.config({ path: new URL('../.env.test', import.meta.url), override: true });

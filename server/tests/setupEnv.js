import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

// Load test settings before any app module reads process.env.
dotenv.config({ path: new URL('../.env.test', import.meta.url), override: true });

// Uploaded test documents go to a throwaway folder, not server/uploads.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'transtrack-test-uploads');

import { defineConfig } from 'vite';
import {resolve} from 'node:path';
export default defineConfig({
 base: '/MWISHO-MWISHO-INVESTMENT/',
 build:{rollupOptions:{input:{main:resolve(import.meta.dirname,'index.html'),websiteTasks:resolve(import.meta.dirname,'website-tasks/index.html')}}}
});

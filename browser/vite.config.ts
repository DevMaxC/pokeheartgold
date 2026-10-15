import {defineConfig} from 'vite';

export default defineConfig({build:{rollupOptions:{input:{game:'index.html',original:'original.html'}}}});

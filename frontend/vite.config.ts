import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
    server: {
      host: true,
      port: 5173,
      watch: {
        usePolling: true,
      },
      proxy: {
        '/api/v1': {
          target: 'http://193.37.138.47:3000',
          changeOrigin: true,
          secure: false,
          headers: {
            'Access-Control-Allow-Origin': '*'
          }
        }
      },
    },
  };
});

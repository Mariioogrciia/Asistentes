import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-ignore - En algunas versiones de Next.js esta opción es necesaria en la raíz
  allowedDevOrigins: ['10.202.2.11', 'localhost:3000'],
  /* otras opciones de configuración aquí */
};

export default nextConfig;

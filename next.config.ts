import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // imposé par Hostinger ; gardé pour que build local = build prod
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig; // un objet, jamais une fonction (sinon échec du build Hostinger)

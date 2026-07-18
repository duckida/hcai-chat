/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "secure-exec",
    "@secure-exec/core",
    "@secure-exec/sidecar",
  ],
};

export default nextConfig;

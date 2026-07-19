/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "secure-exec",
    "@secure-exec/core",
    "@secure-exec/sidecar",
    "@secure-exec/sidecar-darwin-arm64",
    "@secure-exec/sidecar-darwin-x64",
    "@secure-exec/sidecar-linux-arm64-gnu",
    "@secure-exec/sidecar-linux-x64-gnu",
  ],
};

export default nextConfig;

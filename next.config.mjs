/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Set by `next upgrade --agent=security`: keeps the security-only upgrade
    // lane selected for later upgrade prompts.
    agentUpgrade: "security",
  },
};

export default nextConfig;

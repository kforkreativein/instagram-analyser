/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["apify-client", "proxy-agent"],
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "**.apify.com" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/video/:path*",
        destination: "/videos/:path*",
        permanent: true,
      },
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

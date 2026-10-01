/** @type {import('next').NextConfig} */
const nextConfig = {
  // اجازه دسترسی دستگاههای شبکه محلی (تست با گوشی) به فایلهای dev
  allowedDevOrigins: ['192.168.1.100', 'localhost'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
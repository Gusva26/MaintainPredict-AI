/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    },
    // pdfkit lee sus fuentes .afm desde node_modules en runtime; si webpack lo
    // empaqueta, no las encuentra (ENOENT .../vendor-chunks/data/Helvetica.afm).
    serverComponentsExternalPackages: ['pdfkit']
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};

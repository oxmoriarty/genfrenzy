/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  images: {
    // allow data: URIs rendered through <img> tags (we use plain <img> for base64)
    unoptimized: true,
  },
};

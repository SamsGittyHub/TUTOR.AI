import type { NextConfig } from "next";

const config: NextConfig = {
  // pdfjs ships a worker we load from /public; nothing server-side touches it.
  turbopack: {},
};

export default config;

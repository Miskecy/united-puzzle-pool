import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactCompiler: true,
	experimental: {
		// Raise the body-size cap that Next.js enforces when buffering requests
		// through proxy.ts. Default is 10MB; 4GB accommodates any SQLite backup.
		middlewareClientMaxBodySize: 4 * 1024 * 1024 * 1024,
	},
};

export default nextConfig;

// Copyright (c) 2026 Michael David Guggenbichler | MDG-Labs, licensed under Apache-2.0 — see LICENSE

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["postgres", "bcryptjs", "openid-client"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  experimental: {
    // Docker layer uploads stream through /v2/* — avoid default body caps.
    middlewareClientMaxBodySize: "500mb",
  },
};

export default withNextIntl(nextConfig);

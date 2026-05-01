import type { MetadataRoute } from "next";

// Nexvelon is a private internal workspace — keep search engines out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
  };
}

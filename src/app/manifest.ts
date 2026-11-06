import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Gita Lessons · GitaViśva",
    short_name: "Gita Lessons",
    description: "Explore 701 Bhagavad Gita verses, insights and a knowledge graph.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d0c0b",
    theme_color: "#0d0c0b",
    orientation: "any",
    lang: "en",
    categories: ["education", "books"],
    icons: [
      { src: "/icons/gita-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/gita-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/gita-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Read Bhagavad Gita", url: "/?view=adhyayana", short_name: "Read" },
      { name: "Explore the graph", url: "/?view=cosmos", short_name: "Explore" },
    ],
  };
}

import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://rainfd.github.io",
    title: "RainFD's Blog",
    description: "RainFD的个人博客，分享技术生活。",
    author: "RainFD",
    profile: "https://github.com/rainfd",
    ogImage: "default-og.jpg",
    lang: "zh-CN",
    timezone: "Asia/Shanghai",
    dir: "ltr",
    googleVerification: "AhZptGehHRPXtvT_SWQt3iFUHEVhoQbap9KJMqlJDrY",
  },
  posts: {
    perPage: 5,
    perIndex: 5,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/rainfd/rainfd.github.io/edit/main/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/rainfd" },
  ],
  shareLinks: [
    { name: "x", url: "https://x.com/intent/post?url=" },
  ],
});
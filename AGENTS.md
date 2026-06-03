# AGENTS.md — RainFD Blog 操作约定

本文件用于 Hermes（pi 编码代理）接管 RainFD 个人博客的日常操作。

## 项目概况

- **框架**: Astro + AstroPaper 主题
- **域名**: https://rainfd.fun
- **托管**: GitHub Pages（推送 main 分支自动部署）
- **内容**: `src/content/posts/` 下 Markdown 文章
- **评论**: utteranc.es（基于 GitHub Issues）
- **分析**: Google Analytics（ID: G-YZWW8Q0N1P）

## 目录结构

```
src/content/posts/          ← 所有文章
  {slug}/index.md           ← 文章内容
  {slug}/assets/*           ← 该文章专属图片
src/content/pages/about.md  ← 关于页面
public/                     ← 静态文件（favicon、验证文件等）
astro-paper.config.ts       ← 站点配置
astro.config.ts             ← 框架配置
.github/workflows/deploy.yml ← 部署配置
```

## 文章模板

```markdown
---
author: RainFD
title: "文章标题"
slug: article-slug
pubDatetime: 2026-01-01T00:00:00+08:00
draft: false
tags:
  - Tag1
  - Tag2
description: "文章摘要，不超过160字。"
---

<!--more--> ← 摘要分割线，之上的内容显示在卡片预览中

正文内容...

## 二级标题

图片引用（相对路径，放在同目录 assets/ 下）：
![描述](./assets/image.png)
```

### 文章创建命令

```bash
# Hermes 可直接创建文章目录和文件
mkdir -p src/content/posts/{slug}/assets
# 然后写入 index.md
```

## 日常操作命令

### 新建文章
```bash
# Hermes 创建草稿（draft: true）
mkdir -p src/content/posts/{slug}/assets
# 写入 src/content/posts/{slug}/index.md
```

### 本地预览
```bash
npm run dev       # 启动开发服务器 http://localhost:4321
```

### 构建检查
```bash
npm run build     # 构建到 dist/，检查无报错
```

### 发布
```bash
git add .
git commit -m "post: 文章标题"
git push origin main
# GitHub Actions 自动部署到 rainfd.fun
```

## 图片规范

- 图片放入文章目录的 `assets/` 子目录
- Markdown 中用相对路径：`![描述](./assets/image.png)`
- 构建时自动压缩为 WebP，生成响应式 srcset
- 支持格式：png, jpg, gif, webp, avif

## 内容生成

当用户要求生成文章时：
1. 了解话题、确认大纲
2. 创建 `src/content/posts/{slug}/index.md`
3. 使用标准 frontmatter 模板
4. 将图片（如有）放入 `{slug}/assets/`
5. 询问用户是否需要修改
6. 用户确认后执行发布流程

## Trilium 集成

用户笔记存放在 Trilium 中，可通过 `trilium-etapi` skill 拉取：
- 搜索笔记：按关键词或标签搜索
- 读取笔记内容并整理为文章格式
- 自动匹配合适的 tags 和 description

## 配置要点

修改站点配置编辑 `astro-paper.config.ts`：
- `site.*` — 网站元信息
- `posts.*` — 分页设置
- `features.*` — 功能开关
- `socials` — 社交链接

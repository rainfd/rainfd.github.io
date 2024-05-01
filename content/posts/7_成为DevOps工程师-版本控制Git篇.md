---
title: 成为DevOps工程师-版本控制Git篇
description:
date: 2019-05-18
tags: 
- Git
categories:
- DevOps
series:
- "成为DevOps工程师"
typora-root-url: ../../static/
---

网上关于Git的文章实在是太多了，所以我就不浪费时间介绍一些基本概念和操作。
在这里我推荐一些相关的资源，以及介绍一些不常见但实用的技巧。

<!--more-->

---

## Git 图形化教程

Link: https://learngitbranching.js.org/

![git-grpah](/img/7/git-graph.png)

这个教程涵盖了常用的git fetch, git pull, git push, git revert, git reset, git chekcout等命令。通过图形和动画，以树的形式展现了平常操支时分支树的变化。整个教程形象生动，非常推荐新手试一试。

## Git 工作流

Link: <http://www.ruanyifeng.com/blog/2015/12/git-workflow.html>

![git-flow](/img/7/git-flow.png)

介绍了3个常用的Git工作流程：

- Git flow
- Github flow
- Gitlab flow

这个博客除了有很多Git相关的教程外，还有许多高质量的文章，都很值得一看。

## Git 服务器

除了最常用的Github之外，还有其他Git服务器

- Gitlab
- Gogs
- Bitbucket
- 码云

### Github

![github](/img/7/github.png)

Github的基础服务是免费，当然，那也意味着你的代码仓库也是公开。在1月份的时候，Github宣布免费开放个人私有仓库的，但只支持3个成员，无论是公司还是小团队都是不够用。

### Gitlab

![gitlab](/img/7/gitlab.png)

如何要介绍一款功能最多的Git服务器，那毫无疑问就是Gitlab。除了在Github的基础上添加大量实用的功能，最近Gitlab也在自己的Gitlab中嵌入了CI持续集成服务，与Kubernetes高度集成，有点与Jenkins在CI领域一争高下的意思。

当然Gitlab的缺点也很明显，它的高级功能都是收费的，而且它真的"很重"，占用的内存非常的多。

### Gogs

![gogs](/img/7/gogs.png)

一款用Go写的轻量级Git服务器，提供了最基本的Git、Wiki和Issue。网上人有将Gogs运行在树莓派上，足以看出它是多么地"轻"。如果团队人数不多，Gogs是一个很不错的选择。

### Bitbucket

![bitbucket](/img/7/bitbucket.png)

ATLASSIAN家的又一组件，能与Jira和Trello(国外一款Kanban软件)整合。国内用的人不多。

### 码云

![gitee](/img/7/gitee.svg)

国内Git服务首选，包含了不少Gitlab中的功能。如果担心Github被墙，是一个还可以的替代选择。

码云主要的用户是国内传统公司，他们采购国外的Git服务器比较麻烦，而且码云的本地化确实不错，与微信和钉钉都有集成。

## Issue, Wiki, Kanban

最常见的也是最容易忽略的：Issue 缺陷跟踪，Wiki文档管理。

虽然经常在Github上查看别人提交的Issue，但我在几个公司都看不到有使用Issue做缺陷跟踪的。

许多开源项目都有自己的主要放文档，但是维护一个网站来管理文档还是太麻烦了，直接使用Git服务提供的Wiki，既方便又省事。

看板，又一个项目管理组件，可以把项目的开发进度往上面扔。

![kanban](/img/7/kanban.png)

除了这些功能，像Github和Gitlab这样的Git服务器都集成了不少项目管理的功能。如果你的团队不太喜欢额外维护一个项目管理软件，不妨考虑一下这些跟Git集成的功能。

## 项目主页/个人博客

[Github Page](https://pages.github.com/) 原来是用来做开源项目的介绍页的，后面就像点歪了技能点一样，直接可以作为一个个人博客的托管网站。除了在Github Page上配置自己的博客外，还可以通过像[Hexo](https://hexo.io/zh-cn/)这样的博客框架，将博客推送到Github。本博客就是使用Hexo搭建的。详细的搭建说明可以在Hexo中的文档找到。

## Git图形化工具

随着项目的分支越来越多，在命令行中合并分支，修改历史commit变成了一件很抽象的事。辛好，有许多图形化的工具简化操作。

### GitHub for Desktop

GitHub官方出的Git GUI工具

![github-desktop](/img/7/github-desktop.png)

#### SourceTree

![souretree](/img/7/sourcetree.png)

同样是ATLASSIAN家，不过跟他的兄弟姐妹不一样，SourceTree可以算得上同类产品中最简洁，使用最方便的产品了。

### IDE

![vs-git](/img/7/vs-git.png)

在许多IDE上，也会自动集成Git的插件。

### Gitlab graph

![gitlab_tree](/img/7/gitlab_tree.png)

如果你使用的是Gitlab，你还可以在项目页面看到所有的分支历史

## Git修改历史commit

`git filter-branch`

filter-branch 允许你批量的对历史commit进行修改

例子1:  删除所有历史的密钥文件，防止密钥泄露

```bash
git filter-branch --tree-filter 'rm -f key' HEAD
```

例子2: 修改字段，换成大写

```bash
git filter-branch -f --msg-filter \
'cat sed "s/update/UPDATE/g"' \
--tag-name-filter cat -- --all
```

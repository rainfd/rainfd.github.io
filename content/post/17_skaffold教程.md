---
title: "Skaffold教程（一）"
keywords:
- Skaffold
date: 2022-07-13T07:15:25+08:00
draft: true
typora-root-url: ../../static/
---

![demo](/img/17/demo.gif)



## Skaffold 是什么？

简单来说就是一个本地的CICD工具，可以将你Kubernetes原生的应用快速部署到集群。

特性：

- 提供本地快速的Kubernetes开发流程
  - 优化了从源代码到Kubernetes的流程
- 一次配置到处运行
- 轻量级
  - 只包含一个二进制文件

## 为什么选择 Skaffold?

以往我们开发流程是先在本地的环境开发和联调，快到测试阶段才会将应用搬上Kuberetes，而最后才会在Jenkins/GitLab CICD配上对应的流水线。这样做的问题有很多：

1. ~~应用在初始开发阶段不是Kubernetes原生的，后续测试部署要再搬到Kubernetes集群上，环境切换和配置管理是个大问题~~
2. CICD即便用上了之前定义好的模板，实际用起来总有需要修改的地方。无论是Jenkins还是GiLab ，都没有提供很好的本地调试工具，调试的过程又慢又痛苦
3. 熟悉CICD这套流程的同事很少，所以基本上都是运维的一个同事和我在维护。这就导致了CICD的流程一般很晚才进入开发流程。这就诞生了一个很奇葩的问题，在CICD流程配置之前，怎么把应用持续地部署到集群上？这不就是CICD要干的吗？
4. 如果测试阶段出了有问题，很多情况下是无法单靠服务的响应和日志来定位问题，这个时候要不就是用本地开发环境的服务来复现问题，要不就是将本地的服务接入测试环境来debug问题。环境切换的流程非常麻烦

而Skaffold正好切中了这些问题：

1. 简化CICD流程
由于Skaffold可以直接在本地运行，再加上整个流程的配置都很简单，所以可以很方便地进行调试。在项目初期就很方便地加进来。而同样由于配置的简单，给同事介绍了这一软件并写了相关指南后，同事很快就能上手。就算完全不知道怎么配置Skaffold，也能方便地跑流水线。

2. 加速CICD流程
Skaffold有命令`skaffold run`，从代码构建到部署到Kuberenetes集群上，执行的整个流程最快只需要几秒。而原来必须先推送代码，等Jenkins检测到变更在慢吞吞地起任务构建这个旧的流程至少也得花上一两分钟，多得甚至五六分钟。

3. 更方便地部署调试
Skaffold在VSCode和GoLand都有对应的插件，提供了远程调试的功能，实现了跟本地调试基本一样的体验。

4. ~~Kubernetes原生支持~~
正因为上述的优点，在项目开始的时候，就能方便地把应用部署到Kubernetes上，直接以Kubernetes原生的方式进行开发。


### 类似工具

怎么引出同类工具？
Skaffold

- Telepresence
- nocalhost https://www.zhihu.com/question/436014358/answer/1653714633
- tilt
- DevSpace
- okteto



## 安装



### IDE



## 快速上手



## 架构了解

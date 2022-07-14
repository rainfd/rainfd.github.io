---
title: "Skaffold简易教程"
keywords:
- Skaffold
date: 2022-07-13T07:15:25+08:00
typora-root-url: ../../static/
---

![demo](/img/17/demo.gif)

## Skaffold 是什么？

简单来说就是一个本地的CICD工具，可以将你的应用快速部署到Kubernetes集群。

特性：

- 提供本地快速的Kubernetes开发体验，优化了从源代码到Kubernetes的流程
- 一次配置随处运行
- 轻量级，只包含一个二进制文件

## 为什么选择 Skaffold?

我们当前用的CI是Jenkins或者GitLab CI，部署使用helm，使用的过程中会遇到几个问题：

1. CICD即便用上了之前定义好的模板，实际用起来总有需要修改的地方。无论是Jenkins还是GiLab ，都没有提供很好的本地调试工具，调试的过程又慢又痛苦
2. 应用测试的时候很多情况下是无法单靠服务的响应和日志来定位问题，这个时候要不就是用本地开发环境的服务来复现问题，要不就是将本地的服务接入测试环境来debug问题，整个环境切换的流程非常麻烦

而Skaffold正好切中了这些问题：

1. 简化CICD流程
由于Skaffold可以直接在本地运行，再加上配置简单，所以整个流程可以很方便地进行调试。而且一旦配置完毕，其他人就能直接使用命令进行操作。
2. 加速CICD流程
Skaffold有命令`skaffold run`，从代码构建到部署到Kuberenetes集群上，执行的整个流程最快只需要几秒。而原来必须先推送代码，等Jenkins检测到变更在慢吞吞地起任务构建。这个旧的流程至少也得花上一两分钟，多的甚至要五六分钟。
3. 更方便地部署调试
Skaffold在VSCode和GoLand都有对应的插件，提供了远程调试的功能，实现了跟本地调试基本一样的体验。

## 快速上手

*官方Quickstart，官方地址https://skaffold.dev/docs/quickstart/*

### 安装

- linux: [https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64](https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64)
- mac: [https://storage.googleapis.com/skaffold/releases/latest/skaffold-darwin-amd64](https://storage.googleapis.com/skaffold/releases/latest/skaffold-darwin-amd64)
- windows: [https://storage.googleapis.com/skaffold/releases/latest/skaffold-windows-amd64.exe](https://storage.googleapis.com/skaffold/releases/latest/skaffold-windows-amd64.exe)
- docker: `docker run gcr.io/k8s-skaffold/skaffold:latest skaffold <command>`

IDE插件，VSCode搜索Cloud Code，GoLand搜索skaffold。

### 下载示例项目

```bash
git clone --depth 1 https://github.com/GoogleContainerTools/skaffold

cd skaffold/examples/getting-started
```

修改`skaffold.yaml`和`k8s-pod.yaml`中image的地址，修改成一个你有权限推送镜像的地址，例如dockerhub上的账号 userxxx/getting-started。**注意不需要加tag，skaffold会在流程中自动补上。**

### skaffold dev 持续构建并在代码变更时进行部署

skaffold默认会将pod部署到你当前kubectx的namespace上，如果需要切换请提前切换，或者在kubeclt加上namespace

```yaml
deploy:
  kubectl:
    manifests:
      - k8s-*
    defaultNamespace: xx
```

成功部署后，试着修改"Hello world!"的值，会发现`skaffold dev`会监视代码的变更并重新部署。

```text
Listing files to watch...
 - skaffold-example
Generating tags...
 - skaffold-example -> skaffold-example:v1.1.0-113-g4649f2c16
Checking cache...
 - skaffold-example: Not found. Building
Found [docker-desktop] context, using local docker daemon.
Building [skaffold-example]...
Sending build context to Docker daemon  3.072kB
Step 1/6 : FROM golang:1.12.9-alpine3.10 as builder
 ---> e0d646523991
Step 2/6 : COPY main.go .
 ---> Using cache
 ---> e4788ffa88e7
Step 3/6 : RUN go build -o /app main.go
 ---> Using cache
 ---> 686396d9e9cc
Step 4/6 : FROM alpine:3.10
 ---> 965ea09ff2eb
Step 5/6 : CMD ["./app"]
 ---> Using cache
 ---> be0603b9d79e
Step 6/6 : COPY --from=builder /app .
 ---> Using cache
 ---> c827aa5a4b12
Successfully built c827aa5a4b12
Successfully tagged skaffold-example:v1.1.0-113-g4649f2c16
Tags used in deployment:
 - skaffold-example -> skaffold-example:c827aa5a4b12e707163842b803d666eda11b8ec20c7a480198960cfdcb251042
   local images can't be referenced by digest. They are tagged and referenced by a unique ID instead
Starting deploy...
 - pod/getting-started created
Watching for changes...
[getting-started] Hello world!
[getting-started] Hello world!
[getting-started] Hello world!

Listing files to watch...
 - skaffold-example
Generating tags...
 - skaffold-example -> skaffold-example:v1.1.0-113-g4649f2c16
Checking cache...
 - skaffold-example: Not found. Building
Found [docker-desktop] context, using local docker daemon.
Building [skaffold-example]...
Sending build context to Docker daemon  3.072kB
Step 1/6 : FROM golang:1.12.9-alpine3.10 as builder
 ---> e0d646523991
Step 2/6 : COPY main.go .
 ---> Using cache
 ---> e4788ffa88e7
Step 3/6 : RUN go build -o /app main.go
 ---> Using cache
 ---> 686396d9e9cc
Step 4/6 : FROM alpine:3.10
 ---> 965ea09ff2eb
Step 5/6 : CMD ["./app"]
 ---> Using cache
 ---> be0603b9d79e
Step 6/6 : COPY --from=builder /app .
 ---> Using cache
 ---> c827aa5a4b12
Successfully built c827aa5a4b12
Successfully tagged skaffold-example:v1.1.0-113-g4649f2c16
Tags used in deployment:
 - skaffold-example -> skaffold-example:c827aa5a4b12e707163842b803d666eda11b8ec20c7a480198960cfdcb251042
   local images can't be referenced by digest. They are tagged and referenced by a unique ID instead
Starting deploy...
 - pod/getting-started created
Watching for changes...
[getting-started] Hello world!
[getting-started] Hello world!
[getting-started] Hello world!
```

### skaffold run 直接部署应用

与`skaffold dev`不同，`skaffold run`直接部署应用，适合完成调试后需要部署完整应用时使用。

## skaffold 架构了解

![arch](/img/17/architecture.png)

大致的流程就是3个：构建，打包和部署。每个流程都可以配置不同的插件来实现。

示例中的项目就是使用`Dockerfile`来进行`Go`代码的编译和打包镜像，然后使用`gitCommit`号来标记镜像，最后使用`kubectl`来部署到`k8s`。

具体到我们公司内项目，构建主要用`Dockerfile`和`ko`, tag使用默认的`gitCommit`，部署使用`kubectl`或者`helm`。

## 同类工具

既然Kubernetes已经发展了这么长时间，在Kuberentes上开发应用都会遇到各种相关的问题，当然Skaffold也不是唯一的答案。

与Skaffold方案类似的有tilt、DevSpace，okteto和Nocalhost。

### Nocalhost

这里提一个比较特别的就是nocalhost。

对于解释性的语言，Skaffold这类工具都支持文件同步，直接将代码变更同步到目标容器。

但对于编译性的语言，就没办法这样做，只能乖乖编译然后构建镜像和推送镜像。

而nocalhost另辟蹊径，会直接用一个开发容器替换目标容器，然后再将代码同步到开发容器，编译的工作就直接在里面完成。很有趣的一个方案，有空会专门去试试。

### Telepresence

在开发的初始流程中，可能Kubernetes相关的manifest和其他资源都没有配置，那我们要怎么让应用在Kuberenetes的环境中运行呢？Telepresence就是一个很好的解决方案。其实现效果可以理解为实现一个Kuberentes版本的VPN，打开VPN后，在本地就能直接访问Kubernetes的网络，使用内部DNS域名来访问其他Kubernetes服务。


---
title: "Skaffold实践指南"
date: 2022-07-13T09:42:57+08:00
keywords:
- Skaffold
- ko
typora-root-url: ../../static/
---

## Build

官方支持Build的方式有:

- Docker, 最常见的
- Bazel，Google内部开源的构建系统，用得不多
- Custom，自定义镜像来执行任意命令来完成构建
- Jib，Java专用
- ko，go专用

### Docker

下面是官方例子的Dockerfile，可以看到使用的是Dockerfile builder的模式来进行构建的，在builder中使用编译环境编译服务，然后把编译好的二进制文件复制到目标镜像。

这种方式很好地屏蔽了开发者所在环境的差异，不需要编写复杂的Makefile来适应不同的环境，只需要安装Docker就可以完整构建项目。

```yaml
FROM golang:1.18 as builder
COPY main.go .
# `skaffold debug` sets SKAFFOLD_GO_GCFLAGS to disable compiler optimizations
ARG SKAFFOLD_GO_GCFLAGS
RUN go build -gcflags="${SKAFFOLD_GO_GCFLAGS}" -o /app main.go

FROM alpine:3
# Define GOTRACEBACK to mark this container as using the Go language runtime
# for `skaffold debug` (https://skaffold.dev/docs/workflows/debug/).
ENV GOTRACEBACK=single
CMD ["./app"]
COPY --from=builder /app .
```

使用这种方式会有几个问题:

1. 构建速度慢, 需要启动运行`builder`镜像来进行构建，速度不及本地构建；
2. 需要解决缓存问题。不考虑缓存的情况下，`go build`每次都要下载所有的依赖。通过`Dockerfile`的新特性BuildKit可以解决这一问题，直接在`builder`的镜像构建流程中，将本地`gomodule cache`挂载到镜像中，详见: <https://www.docker.com/blog/containerize-your-go-developer-environment-part-2/>；
3. 需要在builder镜像中添加访问权限，例如在内部项目中需要加入GitLab的权限，不然私有的仓库无法下载。*直接在Dockerfile添加账号密码或者sshkey并不是很合适的做法，可以用`netrc`解决。*

### ko

虽然使用Docker编译构建应用有很多好处，但是本地编译然后`docker build`的这个流程还是会快点。

不过还有更快，使用本地构建，然后完全不需要Docker，根据Docker镜像的标准，直接构建镜像。这样能省去与Docker daemon交互的流程。而且由于我们的应用比较简单的，只有一个二进制文件，没有其他的系统依赖，不需要复杂的Dockerfile 构建流程，根据这个流程优化，能再缩短构建时间，于是ko就诞生了。*Java的Jib也是类似的思路*

### 官方简介

`ko`是一个为Go应用做的快速镜像构建工具。与`skaffold`都用google团队做的。

最佳的使用场景就是没有特定系统依赖的Go应用(例如，CGO)。

`ko` 编译应用部分直接使用本地的`go build`, 完全不需要安装`docker`。

`ko`还有很多其他的功能，有兴趣可以去了解一下。`skaffold`已经集成了`ko`，只要我们本地`go build`能正常编译应用，`skaffold`配置将`docker`改为`ko`就能正常使用，基本不需要了解`ko`怎么使用。

```yaml
build:
  artifacts:
  - image: cr.speakin.mobi/algo_platform/algo_ability_api
    # docker:
    #   - cr.speakin.mobi/algo_platform/algo_ability_api
    ko:
      fromImage: cr.speakin.mobi/common/frolvlad/alpine-glibc:alpine-3.9
```

还要注意一个点就是，`ko`默认使用的镜像是`gcr.io`的镜像需要翻墙，可以通过`fromImage`修改为可以访问仓库的镜像。如果需要部署的镜像还是需要某些依赖和复杂的Dockerfile，可以通过提前构建镜像，然后使用`ko`集成应用来加速镜像构建。

## Tag

构建的镜像需要tag来标记版本，默认的gitCommit策略使用commit来标记，使用默认的就能满足需求。

如果是要正式发布的版本，可以使用inputDigest策略来手动指定tag.

## Deploy

Skaffold部署应用到Kubernetes，会有一下流程：

- skaffold deployer 渲染Kubernetes manifests: 将为标记的image name修改为前面部署tag的名；
- 将Kubernetes manifests部署到集群；
- 一直阻塞，定时检查应用状态，直到应用部署完成并且稳定运行或者超时失败。

### 支持所有的部署方式

- docker
- kubectl
- kustomize
- Helm

### Helm

我们使用Helm部署是因为Helm支持模板。假设A，B，C应用都需要使用同一个Mysql，在Helm中可以用go template的语法填充ConfigMap, 在外面的values.yaml中来声明Mysql信息，这样就能集中管理数据库信息。

#### 我们的部署Workspace目录结构

```bash
tree
├── serviceA
├── serviceB
├── serviceC
└── deployment
    ├── README.md
    ├── api
    │   ├── Chart.yaml
    │   ├── charts
    │   └── values.yaml
    ├── hosts
    ├── kubeconfig
    │   ├── new.sh
    │   ├── clusterX
    │   └── template.yaml
    └── route.yaml
```

- serviceX是一个单独的业务服务
- deployment是统一管理部署相关配置的地方，Helm相关的文件都是放在这里
- 对于开发环境使用Skaffold，而测试环境则则会用ArgoCD监控deployment，来实现GitOPs

#### Helm部署说明

```yaml
deploy:
  helm:
    releases:
    - name: algo-ability-api
      namespace: ai-ability-test
      chartPath: ../deployment/api/charts/algo_ability_api
      artifactOverrides:
        image: cr.speakin.mobi/algo_platform/algo_ability_api
      imageStrategy:
        helm: {}
      setValues:
        service.type: NodePort
        service.nodeport: 31081
        debug: true
```

- chartPath: 指定Helm部署文件位置
- setValues: 可以修改values.yaml里面的值
- setValues.debug: 在使用`skaffold debug`的场景下，Kubernetes的livenessprobe/readinessprobe需要关闭，不然在使用断点暂停的时候，probe会失效, 所以在模板中添加debug变量来控制探针的开关。

```yaml
          {{- if not .Values.debug }}
          livenessProbe:
            tcpSocket:
              port: 1081
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: 1081
            initialDelaySeconds: 5
            periodSeconds: 10
          {{- end }}
```

## IDE Debug

### GoLand

Cloud Code插件能自动识别skaffold.yaml创建运行/调试配置，配置创建完后，就可以直接debug使用断点等功能。

### VSCode

debug配置添加以下内容

```json
{
    "configurations": [
        {
            "name": "k8s: algo-ability-api",
            "type": "cloudcode.kubernetes",
            "request": "launch",
            "skaffoldConfig": "${workspaceFolder}/skaffold.yaml",
            "watch": true,
            "cleanUp": false,
            "portForward": true,
            "imageRegistry": "cr.speakin.mobi",
            "debug": [
                {
                    "image": "cr.speakin.mobi/algo_platform/algo_ability_api",
                    "containerName": "algo-ability-api",
                    "sourceFileMap": {
                        "${workspaceFolder}": "${workspaceFolder}"
                    }
                }
            ]
        }
    ]
}
```

留意cleanUp设置为false，是为了关闭debug的情况下，应用不会被清除。

sourceFileMap这里两个变量都必须为workspaceFolder。

如果配置后仍然不能进行debug，可以看看官方的问题说明，或者直接是4.3的方法
<https://skaffold.dev/docs/workflows/debug/>
<https://github.com/GoogleContainerTools/skaffold/issues/6843>

### dlv

在刚开始使用上述两个IDE进行debug的时候，配置花了很长时间。如果不想花时间研究配置，或者上述两种方法都不奏效，可以直接在另外一个终端使用`skaffold debug`

```bash
skaffold debug

Listing files to watch...
 - cr.speakin.mobi/algo_platform/algo_ability_api
Generating tags...
 - cr.speakin.mobi/algo_platform/algo_ability_api -> cr.speakin.mobi/algo_platform/algo_ability_api:14799fc-dirty
Checking cache...
 - cr.speakin.mobi/algo_platform/algo_ability_api: Found Remotely
Tags used in deployment:
 - cr.speakin.mobi/algo_platform/algo_ability_api -> cr.speakin.mobi/algo_platform/algo_ability_api:14799fc-dirty@sha256:09fde9c9c78c5f57d1356586c4c2594fea4743304c924b244447216de7766bac
Starting deploy...
WARNING: Kubernetes configuration file is group-readable. This is insecure. Location: /Users/rainfd/.kube/config
WARNING: Kubernetes configuration file is world-readable. This is insecure. Location: /Users/rainfd/.kube/config
WARNING: Kubernetes configuration file is group-readable. This is insecure. Location: /Users/rainfd/.kube/config
WARNING: Kubernetes configuration file is world-readable. This is insecure. Location: /Users/rainfd/.kube/config
Release "algo-ability-api" has been upgraded. Happy Helming!
NAME: algo-ability-api
LAST DEPLOYED: Wed Jun 22 15:42:38 2022
NAMESPACE: ai-ability-test
STATUS: deployed
REVISION: 11
Waiting for deployments to stabilize...
 - ai-ability-test:deployment/algo-ability-api is ready.
Deployments stabilized in 1.623 second
WARN[0010] Skipping the port forwarding resource deployment/algo-ability-api because namespace is not specified  subtask=-1 task=DevLoop
Press Ctrl+C to exit
Not watching for changes...
Port forwarding pod/algo-ability-api-6c84f78844-4sszc in namespace ai-ability-test, remote port 56268 -> http://127.0.0.1:56268
```

dlv的远程端口暴露到本地的56268，这个时候就可以使用原来VSCode或者GoLand的远程调试功能。

VSCode debug配置

```json
    {
        "name": "Skaffold Debug",
        "type": "go",
        "request": "attach",
        "debugAdapter": "dlv-dap",
        "mode": "remote",
        "host": "localhost",
        "port": 56268,
        "cwd": "${workspaceFolder}",
        "remotePath": "${workspaceFolder}"
    }
```

GoLand 配置

![goland-remote](/img/18/goland-remote.png)

## 其他配置选项说明

### local.push == ture

除非使用minikube，不然每次构建部署都需要将镜像推送到仓库，k8s集群才能获取到正确的镜像

```yaml
apiVersion: skaffold/v2beta28
kind: Config
metadata:
  name: app
build:
  artifacts:
  - image: xxx
    ko: {}
  local:
    push: true
```

### portForward

端口转发，将k8s的deployment/service或者其他资源的端口重定向到你本地的端口，与`kubectl portforward`类似。

```yaml
portForward:
- resourceType: deployment
  resourceName: algo-ability-api
  address: 0.0.0.0 # 默认是 127.0.0.1
  port: 1081 # 远程的端口
  localPort: 1081 # 本地端口，可以不指定，那样每次都会随机分配一个新的端口

```

## 创建Skaffold项目流程

### 1. 确定部署方式

- 确定部署是使用kubectl还是helm。
- 确定后参考其他项目修改Kubernetes manifests, 然后进行初始化skaffold init。

### 2. 确定构建方式

1. 没有复杂构建流程的统一使用ko；
2. 确保本地`go build`构建正常；
3. 确定镜像推送地址, 确保本地拥有推送镜像的权限；
4. 用`skaffold build`调试。

### 3. `skaffold run` 部署调试

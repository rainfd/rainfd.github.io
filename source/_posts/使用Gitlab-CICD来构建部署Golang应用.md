---
title: 使用Gitlab CICD来构建部署Golang应用
filename: 使用Gitlab-CICD来构建部署Golang应用
typora-copy-images-to: 使用Gitlab-CICD来构建部署Golang应用
date: 2020-08-02 20:01:16
tags:
categories:
---



现在在做的项目是用几个shell脚本来构建部署的，执行起来太麻烦，我就想着有时间做做自动化。

当前的环境没有Jenkins，代码管理是Gitlab，所以正好试试Gitlab CICD，体验下跟Jenkins有什么不一样

{% asset_img gitlab_cicd.png %}

<!--more-->

开始前先提醒一下，细节有点多，一定要多多留意。

## [GitLab CI/CD是什么](https://docs.gitlab.com/ee/ci/README.html)

GitLab CI/CD 是一个内置在GitLab的CI/CD工具, 用于:
- 持续集成 Continuous Integration (CI)
- 持续交付 Continuous Delivery (CD)
- 持续部署 Continuous Deployment (CD)

个人总结的几个特点：

1. 由于内置在GitLab中，就不用再去维护另外一套CI/CD工具链,减少了维护成本。但Gitlab

缺失：很多其他CI/CD工具常见的功能，部分功能只开放给商业版，整体扩展性也较差，一个团队是否是用GitLab CI/CD还是要看菜下饭。个人认为GitLab CI/CD更适用于简单的CI/CD工作流，解决从无到有的问题，如果流程越来越复杂，我更推荐使用Jenkins搭配其他CI/CD工具。


## [GitLab CI/CD怎么运行](https://docs.gitlab.com/ee/ci/introduction/#how-gitlab-cicd-works)

与Jenkins类似，GitLab CI/CD通过.gitlab-ci.yml定义工作流。把定义好的.gitlab-ci.yml放在GitLab仓库根目录，GitLab会自动发现这个文件，然后是用已经注册好的执行器(GitLab Runner)来执行你的脚本。

通过GitLab仓库界面，就可以直接看到工作流的状态，比Jenkins要直接得多。

![pipeline_status](使用Gitlab-CICD来构建部署Golang应用/pipeline_status.png)

## 定义流程

在编写工作流前要先定义好工作流有什么部分，这里我设置了3个步骤：编译，构建和部署。

编译：编译Golang代码

构建：构建Docker镜像

部署：将Docker镜像部署到目标服务器上

对于个人开发来说，这3个步骤是最常用的。熟悉主要流程后，后面再把测试，代码质量检测这些内容加上。

## 创建`.gitlab-ci.yml`

### .gitlab-ci.yml组成

在介绍具体的脚本之前，先来介绍一下`.gitlab-ci.yml`基本是怎么构成的

```
variables:  
  GO_PROXY: https://goproxy.io,direct
  GO_PRIVATE: "*.speakin.mobi"

before_script:
  - echo before

stages:
  - compile
  - build
  - deploy

compile:
  image: golang:1.13.10
  stage: compile
  tags:
    - docker
    - dind
  script:
    echo hello
```

- variables: 定义常量
- before_script(after_scirpt): 定义脚本执行前后的一些通用操作
- stages: 定义有多少执行阶段
- compile: 定义一个job的内容
  - image: 定义运行的docker镜像环境
  - tags: 用于筛选Runner
  - script: 具体执行的命令

主要的内容就是stages定义有什么job，然后定义job执行的内容。更详细的说明请查阅[官方文档]((https://docs.gitlab.com/ee/ci/yaml/README.html))。

### 开始的.gitlab-ci.yml

```yaml
image: golang:1.13.10

compile:
  script:
    - echo "Hello, World!"
```

image 指定运行环境的镜像，由于是Golang应用，这里选用了`golang:1.13.10`。compile是我定义的第一个步骤，脚本执行echo命令。

>  *Tips：绝大多数情况，都不推荐不指定镜像标签或者使用latest标签，避免镜像版本更新带来的一系列问题*

创建完后，把`.gitlab-ci.yml`放到仓库根目录进行提交。

![格式错误](使用Gitlab-CICD来构建部署Golang应用/格式错误-6774136.png)

推送到GitLab后，会自动识别并校验`.gitlab-ci.yml`的语法，如果语法解析错误，会有相应的提示。为了避免频繁提交语法错误的文件，可以使用GitLab内置的语法检验工具，地址是你的仓库根地址加上`/-/ci/lint`

![lint](使用Gitlab-CICD来构建部署Golang应用/lint.png)

正确提交后，打开CI/CD的Pipeline看到如下图所示，Pipeline处于stuck状态，原因是目前没有可使用的GitLab Runner让Pipeline执行任务。那么接下来就是配置自己的Runner。

![stuck](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-14 下午7.39.48.png)



## [GitLab Runner](https://docs.gitlab.com/runner/)

GitLab Runner是执行Pipeline的主体。类似于一些管理工具的远程agent，GitLab主服务解析完 `.gitlab-ci.yml`的内容，将对应的指令发送到Runner来执行。

### 安装

GitLab Runner是用Go写的服务，没有任何依赖，可以安装在任意环境。这里推荐使用Docker安装，因为使用Docker更方便Pipeline之间的隔离，避免作业之间相互影响。

```bash
#docker volume create gitlab-runner-config
mkdir /etc/gitlab-runner
touch /etc/gitlabr-unner/config.toml

docker run -d --name gitlab-runner --restart always \
    -v /etc/gitlab-runner:/etc/gitlab-runner \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --privileged \    # --network host \
    gitlab/gitlab-runner:ubuntu
```

将配置目录映射到本地而不是存储卷是为了方便修改配置。至于为什么是用privileged模式还有不推荐是用host网络后面会有解释。

### 注册

接着要把Runner加入到你的项目。进入你的项目->Settings->CI/CD界面，可以看到存在着Specific Runner和Shared Runner两种Runner。Shared Runner一般是通用的，提供公共的Runner给各个项目共同使用。而Specific Runner则相反。

![截屏2020-08-17 下午4.42.56](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-17 下午4.42.56.png)



考虑到你不一定拥有GitLab管理员的账号来添加Shared Runner，我们用Speific Runner来作演示。

将`Set up a specific Runner manually`下面的url和token复制到脚本中，然后执行。

```bash
TOKEN=""
URL=""

docker run --rm -v /etc/gitlab-runner/config.toml:/etc/gitlab-runner/config.toml \
  gitlab/gitlab-runner:ubuntu \
  register \
  --non-interactive \
  --executor "docker" \
  --docker-image golang:1.13 \
  --url "$URL" \
  --registration-token "$TOKEN" \
  --description "golang-runner" \
  --tag-list "docker,golang" \
  --locked="false" \
```

注册成功后就会看到对应的Runner。

回到Pipeline的界面，你有发现它的状态还是stuck。这是因为我们的`.gitlab-ci.yml`没有指定Runner的Tag，而刚注册的Runner默认不会执行没有指定Tag的作业。解决方法有两个，一个是编辑Runner，把·Run untagged jobs·的选项加上。
![截屏2020-08-17 下午4.58.52](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-17 下午4.58.52.png)

![截屏2020-08-17 下午5.04.18](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-17 下午5.04.18.png)

另一种就是在`.gitlab-ci.yml`上加上tag。
```yaml
image: golang:1.13.10

compile:
  tags:
  - docker
  - golang
  script:
    - echo "Hello, World!"
    
```
终于，我们的第一个作业跑起来了。

![截屏2020-08-17 下午5.09.21](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-17 下午5.09.21.png)

![截屏2020-08-17 下午5.08.59](使用Gitlab-CICD来构建部署Golang应用/截屏2020-08-17 下午5.08.59.png)



## [SSH keys](https://docs.gitlab.com/ee/ci/ssh_keys/README.html)

在更深入之前，我们现在解决一个棘手的问题——SSH keys。当我们需要直接克隆私有库代码和免密登录其他主机，都需要SSH Key。

为什么说这个问题棘手？因为GitLab CI/CD没有Jenkins那样为执行器(Runner)做了完整的SSH Key密钥管理，官方给出的用法是是在`.gitlab-ci.yml`上直接加入私钥。可以看如下示例

```yaml
variables:
  GIT_HOST: xx.xx.xx.xx
  SSH_PRIVATE_KEY: |
    -----BEGIN RSA PRIVATE KEY-----
    xxx
    
before_script:
  - mkdir -p ~/.ssh
  - 'which ssh-agent || ( apt-get update -y && apt-get install openssh-client -y )'
  - eval $(ssh-agent -s)
  - echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
  - chmod 700 ~/.ssh
  ## known_hosts | 自动添加信任主机
  - ssh-keyscan -H $GIT_HOST > ~/.ssh/known_hosts
  - chmod 644 ~/.ssh/known_hosts
```

在这里有两个值得注意的点（在网上常看到按照官方文档操作仍可能添加key失败）

1. SSH_PRIVATE_KEY: 后面的符号一定要用`|`，在yaml中| 表示下面的多行字符串自动换行并且在结尾新增一个空行。很多人是用>或者其他符号分割行会导致yaml错误识别分行。
2. ke'y-scan添加的如果是域名，那么最好加上域名对应的IP `ssh-keycan -H $DOMAIN,$IP > ~/.ssh/kndown_hosts`

### 更方便的解决方法

直接在代码中添加私钥是很危险的行为，即便官方提供了[Deploy Key](https://docs.gitlab.com/ee/user/project/deploy_keys/#deploy-keys)一个拥有只读权限的方式来操作，但还是需要需要公开私钥。

而我现在的是用方式是直接将密钥挂载在Runner中:

```toml

```






## 总结

### 总体感受

### 不一样的地方

### 坑

## 后续扩展 
cache 跨runner
cache 是用minio






---

TODO:
- release
  - commit id && version 
- Rules



```yaml

    
```


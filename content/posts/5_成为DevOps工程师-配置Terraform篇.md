---
title: "成为DevOps工程师-配置Terraform篇"
date: "2019-04-07"
tags: 
 - "Terraform"
categories:
 - "DevOps"
series: 
 - "成为DevOps工程师"
cover:
  image: "/img/5/devops_six_parts.png"
typora-root-url: ../../static/
---

在博文[How To Become a DevOps Engineer In Six Months or Less](https://medium.com/@devfire/how-to-become-a-devops-engineer-in-six-months-or-less-366097df7737)中，作者介绍了一条DevOps的学习路线

<!-- ![devops_six_parts](/img/5/devops_six_parts.png) -->

本系列文章将依据这条路线，因地制宜，介绍各个环节和这些工具的使用。

本文正是第一篇：配置 Terraform篇。

<!--more-->

---

## Terraform

如果要用一句话介绍Terrform的话，那这句话就是**INFRASTRUCTURE AS CODE**。如果对基础设施的这个概念很陌生，那么我们看看Terraform支持的基础设施是什么

![providers](/img/5/providers.png)

可以看到AWS、Google Cloud Platform、Azure等一众公有云平台和一些其他常见的Pass平台。

假设一个场景，公司需要你在阿里云上部署一套业务系统。然后你就在阿里云上一个一个的地建资源，LB、ECS、DB。除了这些传统架构上的，可能还有网络控制(SDN)、开发账号控制等等。过几天，公司要求你要在不同的区域再部署一套，那你只能屁颠屁颠地再上控制页面继续点点点。

为了解决这类问题，**基础设施即代码**这个概念就被提出。通过代码和模板语言来自动化初始基础设施的这一过程，就是Terraform的主要功能。

---

## 安装

直接在[下载页面](https://www.terraform.io/downloads.html)下载对应的二进制压缩包，解压后直接执行就可以了

如果是Mac OS，可以直接使用Homebrew安装：`brew insall terraform`

---

## 使用教程(Aliyun)

在Terraform的官方主页上点击[Learn](https://learn.hashicorp.com/terraform/)就会进入到官方使用教程，不过使用的例子是AWS和Azure。这里为了方便，就使用阿里云。

另外，在阿里云的官网上也有使用Terraform创建资源的文档

https://help.aliyun.com/document_detail/91451.html?spm=a2c4g.11186623.2.18.439c92acl7WbtU 

![aliyun-terraform-ecs](/img/5/aliyun-terraform-ecs.png)

在文档里面点试用按钮还可以跳到实验平台在线使用命令行操作Terraform。

---

### Access Key

在使用Terraform操作阿里云之前，需要先在阿里云的控制台创建号用户生成Access Key.
生成Access Key有两种途径：

1. 直接生成，key拥有所有账号所有权限
2. 创建RAM(Resource Access Management) 用户，通过授权来添加用户的操作权限。
两者关系就像Unix系统中的root系统管理员和普通用户。这里推荐使用RAM用户的方式。

---

#### 创建RAM用户

第一次使用RAM功能时需要开通

![ram_init](/img/5/ram_init.png)

创建Terraform RAM角色（人员管理->用户）,选择编程访问来生成Access Kes

![ram_key](/img/5/ram_key.png)

创建成功后，自动生成Access Key，注意要保存好key，在弹窗关闭后将无法再次获取该信息

![ram_user](/img/5/ram_user.png)

---


#### 添加权限

由于是测试的账号，为了方便直接添加最高权限÷

![ram_access](/img/5/access.png)

---


### tf配置

#### 初始化

Terraform使用*.tf配置文件来描述资源。Terraform创建资源时会识别当前目录下的所有tf文件。

*阿里云 Terraform配置参数说明：https://www.terraform.io/docs/providers/alicloud/index.html*

现在创建一个example.tf文件。

```tf
# Configure the Alicloud Provider
provider "alicloud" {
  access_key = "<your access key>"
  secret_key = "<your secret key>"
  availability_zone = "cn-shenzhen-d"
}
```


这里是设置刚才创建好的AK。除了直接在配置文件中声明，还可以使用环境变量来声明
```bash
➜  export ALICLOUD_ACCESS_KEY="LTAIUrZCw3********"
➜  export ALICLOUD_SECRET_KEY="zfwwWAMWIAiooj14GQ2*************"
➜  export ALICLOUD_REGION="cn-beijing"
```
使用环境变量声明就可以用不同的系统用户来区分操作的阿里云账号

接下来执行初始化，terraform自动下载阿里云的provider插件

```bash
➜  aliyun terraform init

Initializing provider plugins...
- Checking for available provider plugins on https://releases.hashicorp.com...

Error installing provider "alicloud": Get https://releases.hashicorp.com/terraform-provider-alicloud/: EOF.

Terraform analyses the configuration and state and automatically downloads
plugins for the providers used. However, when attempting to download this
plugin an unexpected error occured.

This may be caused if for some reason Terraform is unable to reach the
plugin repository. The repository may be unreachable if access is blocked
by a firewall.

If automatic installation is not possible or desirable in your environment,
you may alternatively manually install plugins by downloading a suitable
distribution package and placing the plugin's executable file in the
following directory:
    terraform.d/plugins/darwin_amd64
```

当由于防火墙 或者其他网络原因下载失败时，会提示到release地址下载对应平台的插件。

插件安装地址

| Operating system  | User plugins directory          |
| ----------------- | ------------------------------- |
| Windows           | `%APPDATA%\terraform.d\plugins` |
| All other systems | `~/.terraform.d/plugins`        |

```bash
# Windows:     %APPDATA%\terraform.d\plugins
# Linux&Macos: ~/.terraform.d/plugins
mkdir -p ~/.terraform.d/plugins/darwin_amd64
wget https://releases.hashicorp.com/terraform-provider-alicloud/1.34.0/terraform-provider-alicloud_1.34.0_darwin_amd64.zip
unzip terraform-provider-alicloud_1.34.0_darwin_amd64.zip
```


重新初始化，安装成功

```bash
➜  terraform init

Initializing provider plugins...

The following providers do not have any version constraints in configuration,
so the latest version was installed.

To prevent automatic upgrades to new major versions that may contain breaking
changes, it is recommended to add version = "..." constraints to the
corresponding provider blocks in configuration, with the constraint strings
suggested below.


* provider.alicloud: version = "~> 1.34"

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

---

### 创建资源

#### 资源文档

Terraform aliyun插件参数文档

https://www.terraform.io/docs/providers/alicloud/r/instance.html

---

#### 专用网络和交换机

**专有网络VPC**(Virtual Private Cloud):  基于阿里云构建的一个隔离的网络环境，专有网络之间逻辑上彻底隔离。

每个VPC都有一个路由器和至少一个交换机(VSW Virtual Switch)。交换机连接不同云产品，路由器连接不同可用区。这样一个VPC就可以管理一片独立的网络。

![专有网络](/img/5/专有网络.png)

接下来在example.tf中添加vpc和vsw资源

```
#  data_type name
resource "alicloud_vpc" "vpc" {
  name       = "tf_test_foo"
  cidr_block = "172.16.0.0/12"
}

resource "alicloud_vswitch" "vsw" {
  vpc_id            = "${alicloud_vpc.vpc.id}"
  cidr_block        = "172.16.0.0/21"
  availability_zone = "cn-shenzhen-e"
}
```

运行`terraform apply`来创建资源

```bash
➜  terraform apply
alicloud_vpc.vpc: Refreshing state... (ID: vpc-wz9974l8ryiwe8l9w582s)
alicloud_vswitch.vsw: Refreshing state... (ID: vsw-wz9knct0w23uwkzvq2s1n)

Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
```

---

#### 安全组和安全规则

安全组控制着ECS实例的网络访问，一个安全组包含多个安全规则。可设置多个安全组，通过设置优先级来组合使用。

```
resource "alicloud_security_group" "default" {
  name = "default"
  vpc_id = "${alicloud_vpc.vpc.id}"
}

resource "alicloud_security_group_rule" "allow_all_tcp" {
  type              = "ingress"                               # ingress (inbound) or egress (outbound). 规则方向：
                                                              # 出方向：是指 ECS 实例访问内网中其他 ECS 实例或者公网上的资源
                                                              # 入方向：是指内网中的其他 ECS 实例或公网上的资源访问 ECS 实例
  ip_protocol       = "tcp"
  # nic_type          = "intranet"                              # internet connection
  policy            = "accept"                                # 说明 这里的 拒绝策略是直接丢弃数据包，不给任何回应信息。如果 2 个安全组规则其他都相同只有授权策略不同，则 拒绝授权生效， 接受授权不生效。
  port_range        = "1/65535"                               # from 1 to 65535
  priority          = 1                                       # the highest priority
  security_group_id = "${alicloud_security_group.default.id}"
  cidr_ip           = "0.0.0.0/0"                             # all ip address access
}
```

*在VPC安全组的nic_type网卡类型的默认值是intranet，而且也只能选择intranet，不能选择internet。这也意味着VPC内的ECS实例不能直接访问公网。*

---

#### ECS实例

添加ECS实例

*1. 留意所在区域有没有对应的实例*

*2. 镜像地址：https://ecs.console.aliyun.com/#/image/region/cn-hangzhou/systemImageList*

```
resource "alicloud_instance" "instance" {
  # cn-beijing
  availability_zone = "cn-beijing-b"
  security_groups = ["${alicloud_security_group.default.*.id}"]

  # series III
  instance_type        = "ecs.n2.small"
  system_disk_category = "cloud_efficiency"
  image_id             = "ubuntu_140405_64_40G_cloudinit_20161115.vhd"
  instance_name        = "test_foo"
  vswitch_id = "${alicloud_vswitch.vsw.id}"
  internet_max_bandwidth_out = 10
  password = "<replace_with_your_password>"
}
```



一般使用新的账号会创建失败，提示没有足够余额

```bash
Error: Error applying plan:

1 error(s) occurred:

* alicloud_instance.instance: 1 error(s) occurred:

* alicloud_instance.instance: Error creating Aliyun ecs instance: &errors.ServerError{httpStatus:403, requestId:"CA1B42FE-A5F9-4323-932F-B2C863C7AB16", hostId:"ecs-cn-hangzhou.aliyuncs.com", errorCode:"InvalidAccountStatus.NotEnoughBalance", recommend:"", message:"Your account does not have enough balance.", comment:""}

Terraform does not automatically rollback in the face of errors.
Instead, your Terraform state file has been partially updated with
any resources that successfully completed. Please address the error
above and apply again to incrementally change your infrastructure.
```



需要往阿里云的账号至少充值100块（默认为按量付费，而按量付费需要账户余额至少100块），再接着创建


```bash
Apply complete! Resources: 1 added, 0 changed, 0 destroyed.
```

看到创建成功后，登陆阿里云控制台就可以看到该实例

![instance](/img/5/instance.png)

注意在测试完后，使用`terraform destory`销毁所有资源来避免资源消耗产生的费用。

---

### 总结

到这里，我们已经通过Terraform来创建云产品。而在实际工作中，还要配合更多的实用的功能，例如Datasource，允许我们描述一个ECS实例的要求，来自动选择可用区、镜像、实例类型等。但我们已经了解了Terraform的核心功能，这里就点到即止了。
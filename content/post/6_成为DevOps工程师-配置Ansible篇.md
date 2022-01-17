---
title: "成为DevOps工程师-配置Ansible篇"
description: ""
date: "2019-04-20"
tags: 
 - "devops"
 - "ansible"
typora-root-url: ../../static/
---

什么是Ansible？Ansible能干什么？

<!--more-->

---

## Ansible是什么

Ansible，一个配置管理和IT自动化工具。简单来说就是讲一个将脚本自动化的工具。

想象一下，现在要你手工地在几十台机器上部署十几个服务，中间还偶尔来一些升级失败和回滚，那简直就是一个灾难。这时候Puppet，Chef和Ansible这类自动化工具就是运维人员的救星。

## 为什么选择Ansible

1. 无代理模式，配上ssh key就可以快速完成整个系统的搭建
2. 国内使用人数多，在招聘网站上自动化运维的应聘要求大多数都有ansible
3. 大量模板支持，常用的基础软件安装在网上就可以找到对应的模板
4. 简单，概念不多，容易上手

## Ansible 架构

![ansible-arch](/img/6/ansible-architechture.png)

这是从网上找来的Ansible的架构图，从图中可以看到Ansible 内部的提供了Inventory, Modules, Plugins 几个核心组件，用户通过ansible-playbook 或者其他API的方式来调用这些组件来将自动化任务运行在目标主机上。

---

## Ansible 安装

Linux 系统上直接使用python 的 pip 安装`pip install ansible`。

*Ansible对Windows和MacOs的支持都有问题，不建议踩坑。*

安装成功后用`ansible —version`来检验是否安装成功

---

## Ansible 使用

对于一般使用Ansible只需要掌握以下的几个核心功能：
    - host inventory
    - ansible cli command
    - module
    - playbook

引用Ansible文档中的一句描述：

> If Ansible modules are the tools in your workshop, playbooks are your instrction manuals, and your inventory of hosts are your raw material.

---

### Host inventory

使用Ansible一般要连接很多台主机，而inventory就是用声明这些主机的一个文件。

它的格式可以是INI形式的：

```ini
mail.example.com

[webservers]
foo.example.com
bar.example.com

[dbservers]
one.example.com
two.example.com
three.example.com
```

也可以是yaml形式的：

```yaml
all:
  hosts:
    mail.example.com:
  children:
    webservers:
      hosts:
        foo.example.com:
        bar.example.com:
    dbservers:
      hosts:
        one.example.com:
        two.example.com:
        three.example.com:
```

> 在Ansible的配置中一般都同时支持这两种形式的配置

可以看到上面的实例配置中还支持分组，通过命名来代表一组主机。除了声明ip/host name外，还可以支持其他参数：

`jumper ansible_port=5555 ansible_user=root`

---

### Ansible cli command && module

大家在看Ansible相关介绍的时候，常看到它表明的一个优点是agentless，那它是怎么做到的呢？

其实很简单，就是通过ssh，只要连接前把控制主机的key加入到被控主机的authorized key中，Ansible就可以通过ssh的方式实现它的控制。

为了方便测试，我们将本地主机加入到inventory：

```ini
localhost
```

保存其为hosts(Ansible读取的inventory名默认为hosts)，并将主机的pub key添加到本地的authroized key中。接着输入：

`ansible -i hosts all -m ping`

如果没有意外，就会输出如下内容，表示你与inventory中的主机成功连接。

```bash
localhost | SUCCESS => {
    "changed": false,
    "ping": "pong"
}
```

以下是命令`ansible -i hosts all -m ping`的解释说明
    - `ansible`是ansible的cli工具，用来测试或者连接主机执行一些简单的任务，如果要执行的内容比较复杂或者很多，就需要使用ansible-playbook，这个下文会提到，这里先跳过。
    - `-i hosts` 表示你选择的主机列表是哪个文件，一般默认为~/.ansible/hosts。除了使用默认文件后者使用-i指定外，还可以配置环境变量来改变这个文件的读取路径，详见[官方文档][1]
    - `all`表示选择所有的主机。如果你则inventory中设置了分组，如上述例子中的webservers，这里变为webservers则表示只连接这一小组的主机。
    - `-m ping`表示使用的是ping模块。module模块是ansible提供的用来简化操作的工具，常见的有shell(执行shell命名)，cp(复制文件到目标主机)，file（创建文件，修改文件权限）等等。其中最常用的就是ping模块，用来测试inventory中的主机是否连通

---

### Playbook

Playbook的中文意思是剧本，Ansible中的Playbook也就是将一系列的操作组合在一起，来达到复用的目的。Ansible为什么这么流行的其中一个原因就是playbook的便捷，官方还有许多开发者将一些常用的软件的安装过程写成可复用的ansible playbook。使用者只需要把这个playbook下载下来就可以直接执行。

playbook支持yaml的语法，一个playbook的目录结构如下：

```plain
├── defaults
│   └── main.yml
├── files
├── handlers
│   └── main.yml
├── tasks
│   └── main.yml
├── templates
│   ├── example.conf.j2
└── vars
    └── main.yml
```

我们先从tasks的main.yml开始

#### tasks

main.yml一般作为入口文件，可以在这里完成所有的任务，也可以加载其他的任务。

以下是一个将django应用的安装playbook，内容包括了初始目录，代码复制和启动应用

```plain
---
# 安装django
- name: install django
  shell: pip install "django{{ django_version }}"

# 初始化目录
- name: init directory
  file:
    path: "{{ project_path }}"
    state: directory
  notify:
    - restart example

# 复制代码到目标目录
- name: copy code to target directory
  copy:
    src: mysite
    dest: "{{ root_path }}"

# 生成配置文件
- name: template supervisor file
  template:
    src: example.j2
    dest: "{{ supervisor_app_path }}"
  notify:
    # 加载supervisor配置文件
    - reread example
    # 重启应用
    - restart example
```

可以看到，每一个步骤都是一个模块。也就是说，在playbook中，需要将你以往手动操作的指令转化为一个个小的任务，通过模块来实现的你目标。

---

#### vars和default

这两个文件夹都是用来存放变量

```plain
--- 
# vars/main.yml
project_user: root
root_path: /tmp
project_path: /tmp/mysite
log_path: /tmp/mysite/log
program_name: example
supervisor_app_path: /etc/supervisor/conf.d/example.conf
---
# default/main.yml
django_version: "<2"
```

这里声明的变量，就可以在其他文件中使用&#123;&#123; vars &#125;&#125;的方式进行引用。而vars和default的区别就是其名字代表的含义，default中的变量一般设置完后就不需要改变，而vars中的变量经常需要根据不同的需求和环境和进行变更。

---

#### templates

templates常用与生成不同的软件配置文件，它使用`Jinja2`语法来生成文件，变量引用的
&#123;&#123; &#125;&#125;符号就是来自`Jinja2`。通过与vars和default中变量的结合，使用在tasks中使用template就可以快速生成新的配置文件，文中例子中就使用它来生成supervisor的配置文件。

```conf
[program:{{ program_name }}]
command=python manage.py runserver
autostart=true ; supervisord守护程序启动时自动启动tornado
autorestart=true ; supervisord守护程序重启时自动重启tornado
redirect_stderr=true ; 将stderr重定向到stdout
user={{ project_user }}
directory={{ project_path }} ; cd 到应用目录
stdout_logfile={{ log_path }}
```

---

#### files

除了配置文件，通过还有一些不变的文件（例如验证密钥，环境变量文件）需要复制到目标主机。这里就使用它配合cp模块来将代码发送到目标主机。

```yaml
- name: copy code to target directory
  copy:
    src: mysite
    dest: "{{ root_path }}"
```

当然下载代码更一般的方法是通过git来下载，在ansible中也提供了git这个模块。

#### handlers

handlers一般负责服务的启停

```yaml
---
- name: reread example
  supervisorctl:
    name: example
    state: present

- name: start example
  supervisorctl:
    name: example
    state: started

- name: restart example
  supervisorctl:
    name: example
    state: restarted

- name: delete example
  supervisorctl:
    name: example
    state: present
```

那handlers种的任务是如何调用的呢？你可以从上面的命令中注意到一个关键字`notify`。

在这里就要暂停一下，先引入Ansible关于任务的几个概念。在Ansible执行每一个小任务的时候（对应task/main.yml中的一个模块），都会输出这个任务完成的状态。

状态分两种：success，failed。一般情况下，如果一个任务的执行结果为failed，那么整个playbook都会因此而终止。而success也会分为两种，一个changed=true, 另一种changed=false。changed=true表示它执行的内容与上一次执行的不同，例如我使用cp模块复制的文件不同了，使用tempaltes生成的内容也不同了等等。

回到notify，它的内容是一个handler列表。在playbook执行过程中，notify就会识别任务changed状态，即任务发生变更时，才会执行notify中的任务。由于这个特性，使得它能与服务启停很好地配合。

在上面实例的task中，在代码发生变更或者supervisor配置文件发生变更的时候才去重启任务。如果只使用在task中使用普通的模块来完成服务启停，那么当你的代码和配置文件没有发生变更的时候，它都会去重启服务，这在很多场景下就不合适了。

我把常见的playbook目录内容都介绍了一遍，但不知道你有没有留意上面例子`task/main.yaml`中的第一个任务：使用shell模块安装django`pip install django`。你有没有想过一般机器上原来是没有安装pip？更何况我们用来启动django的supervisor呢？

那我是不是要在这里加上pip和supervisor的安装步骤呢？当然不需要，就像我开始介绍playbook所说的，你轻易可以在网上找到安装它们的playbook，但是这个要怎么与现在安装django应用的playbook结合呢？

### roles

这就是roles的作用。Ansible通过引入roles来区分不同的playbook，类似于不同的演员拿不同的剧本，各司其职。

加入roles后的目录结构

```plain
roles
├── example
│   ├── defaults
│   ├── files
│   ├── handlers
│   ├── hosts
│   ├── meta
│   ├── tasks
│   ├── templates
│   ├── tests
│   └── vars
├── geerlingguy.pip
└── geerlingguy.supervisor
```

显然现在还缺一个入口文件来调用两个playbook

```yaml
---
# django.yml
- hosts: all
  roles:
    - geerlingguy.supervisor
    - geerlingguy.pip
    - django
```

现在可以调用ansible-playbook来安装我们的django应用::

`ansible-playbook -i hosts django.yml`

---

## 总结

实际的运维任务并不一定跟上述例子中的步骤相似，所以在写playbook前，一般要先把任务进行拆分，再次以部署django应用为例, 它的任务可以拆分为：

1. 安装依赖(pip, supervisor, Django)
2. 初始化机器目录
3. 复制代码到目标主机
4. 启动/重启服务

其中安装依赖一部分可交给其他playbook完成，启停服务由handler完成，目录、服务参数、django版本参数等放到default和vars中的变量中，代码可以放在files中方便复制，完整的任务流程就放在task中编写。

一旦完成拆分，接下来编写playbook就是时间问题了。

[1]: <https://docs.ansible.com/ansible/latest/index.html>

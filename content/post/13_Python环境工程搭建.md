---
title: Python环境&工程搭建
date: 2020-06-15
tags:
- python
typora-root-url: ../../static/
---

之前一直在线上服务器裸敲Python，很久没有在自己的mac上写了。最近有任务要用Python来实现，借此好好整理关于Python环境设置和工程搭建遇到的问题。

<!--more-->

---

示例工程地址: <https://github.com/rainfd/python-example-project>

## ENVIROMMENT

### 安装 Python

```bash
brew install python
```

安装 Python2/3,虽然在今年官方就正式停止了对 Python2 的支持,但已经在线上运行的系统还是默认跑着 Python2. 像 Centos7.6 才会默认使用 Python3, 那在近几年内 Python2 还是避不开了.

### IDE

不是用 Python 作为主力语言,那么买 Pycharm 就没什么必要了. 在其余的几个常用 IDE 中(VSCode/Sublime Text3/Atom), 我选了 VSCode.原因是我 Golang 也是在 VSCode 上开发的.配置 Python 相关的环境也不需要折腾什么.

#### 安装 Python 插件

在 marketplace 搜索 Python 的官方插件直接安装

### [pipenv](https://pipenv.pypa.io/)

```bash
brew install pipenv
```

相对比于 pyenv,个人认为 pipenv 安装和使用更简单，还有完整的文档.

#### 新建虚拟环境

```bash
$ cd python-example-project
$ pipenv --three

$ pipenv shell
(python-example-project) $ pipenv install package

(python-example-project) $ pipenv --venv
/Users/rainfd/.local/share/virtualenvs/python-example-project-9IUo4aoR
```

#### VSCode 配置虚拟环境

按下 `⇧⌘P/F1`, 输入 `select interpreter` 选择上面 venv 列出的路径.
又或者在 workspace 的 setting 中添加:

```json
{
  "python.pythonPath": "/Users/rainfd/.local/share/virtualenvs/python-example-project-9IUo4aoR/bin/python"
}
```

#### Shebang

```bash
#!/usr/bin/env python
# -*- encoding: utf-8 -*-
```

通常 Python 文件开头会加入 Shebang 或者其他作者/注释说明, 这里就要使用 VSCode 自带的 Snippet.菜单栏选择 Preferences>Use Snippets, 输入 python.json, 输入

```json
{
  "HEADER": {
    "prefix": "header",
    "body": ["#!/usr/bin/env python", "# -*- encoding: utf-8 -*-"]
  }
}
```

## PROJECT

### Unit Test

Python 用于单元测试的框架有很多,但 Python 官方库就自带了一个不错的 unittest,那就没必要引入其他依赖了.

#### VSCode 配置 unittest

```json
{
  "python.testing.unittestArgs": ["-v", "-s", ".", "-p", "*_test.py"],
  "python.testing.pytestEnabled": false,
  "python.testing.nosetestsEnabled": false,
  "python.testing.unittestEnabled": true
}
```

##### Mock

既然使用了 unittest, 那就少不了 unittest.mock 相对于其他语言的 mock 支持, 我是觉得 Python 的 mock 使用是最简单的.
要注意的是 unitest.mock 是 Python 3.3 加入到官方库的，假设使用 Python2，就需要额外安装 `pipenv install mock`

### Log

全局日志可以参考这个`https://gist.github.com/kingspp/9451566a5555fb022215ca2b7b802f19`
通过 yaml 配置各个模块的日志格式和等级

在模块中只需要引入 logger 就可以正常输出日志

```python
logger = logging.getLogger(__name__)
logger.info("msg")
```

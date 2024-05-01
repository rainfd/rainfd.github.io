---
title: "[译]如何在Web开发中使用Python"
date: 2017-02-23
tags:
- Python
categories:
- "Web"
---


原文：[HOWTO Use Python in the Web](https://docs.python.org/3/howto/webservers.html)

*这篇文档展示了Python如何融入到web中。它介绍了几种Python结合web服务器的方法，以及开发网站的一些常规做法。*

<!--more-->

“Web 2.0”是指由用户主导网站内容的创作。自从这个概念兴起以来，网络编程就成为了一个热门话题。一直以来，用Python创建网站是相当繁琐的，所以也很少有人这么做。因此人们创建了许多框架和辅助工具来帮助开发者创建更快更可靠的网站。这篇HOWTO介绍了几种Python结合web服务器创建动态内容的方法。当然，因为这个话题涉及的内容太广，很难在单独的一篇文档里进行详细的描述。所以这里就只对一些当前流行的库作简要的概述。

**参见**：这篇HOWTO试图对Python的Web开发作一个概览，但不能总是按预期及时地更新。Python的Web开发正在迅速发展，所以wiki上的[Web Programming](https://wiki.python.org/moin/WebProgramming)可能与近期的发展更为接近。

---

# 底层视角

当一个用户访问网站时，他们的浏览器会与网站的服务器进行连接（这称为*请求*)。服务器在文件系统中寻找文件，并将其发送回用户的浏览器（这称为*响应*)。这就是底层HTTP协议的大致工作原理。动态网站不是基于文件系统中的文件，而是以程序为基础。当请求到来，运行在服务器上的程序就会生成相应内容并发送回用户。它们可以处理用户的各种数据，例如列出公告板上的帖子，显示你的邮件，配置软件，或者只是显示当前时间。这些程序能用服务器支持的任意语言完成。自从大部分的服务器开始支持Python，用Python创建动态网站就变得十分简单了。

大多数的HTTP服务器是用C或者C++写的，它们不能直接执行Python代码，所以服务器和程序之间就需要有一座桥。网桥，或者更确切地称为接口，决定了程序如何与服务器进行交互。

为了创建尽可能好的接口，人们作出了无数尝试，但只有少数的几个值得关注。

不是每一个服务器都支持所有的接口。许多服务器只支持老的，现在已经过时的接口。然而，它们经常可以通过第三方模块扩展来支持新的接口。

## 常用网关接口

这个接口，通常被称为“CGI”，是最古老的，几乎被所有web服务器很好地支持着。在处理单个请求时，程序由服务器启动，通过CGI与服务器进行通讯。因而每个请求来临时都要花一定时间去启动新的Python解释器。这就使得整个接口在低负载状态的时候才能正常使用。

CGI的优点在于它很简单——用CGI写一个Python程序大概就是三行代码的事情。这种简易性造成了一种误解：它对开发者的帮助聊胜于无。

虽然还有可能用CGI写程序，但已经不建议这么做了。通过使用本文稍后提到的WSGI，就能模仿CGI的方式写程序，而且在迫不得已的时候，它们也能作为CGI运行。

**参见**：Python标准库包含了一些模块来帮助创建简单的CGI程序：

-   [cgi](https://docs.python.org/3/library/cgi.html#module-cgi) — 在CGI脚本中处理用户输入

-   [cgitb](https://docs.python.org/3/library/cgitb.html#module-cgitb) — 当在CGI应用中出现错误时，不再显示“500服务器内部错误”的消息，而用更好的错误回溯代替。

Python的wiki有专门描述CGI脚本的页面，里面有关于CGI在Python中的一些额外信息。

### 测试CGI的简单脚本

你可以用这个简短的CGI程序来测试你的服务器是否支持CGI。

```python
#!/usr/bin/env python
# -*- coding: UTF-8 -*-

# enable debugging
import cgitb
cgitb.enable()

print("Content-Type: text/plain;charset=utf-8")
print()

print("Hello World!")
```

根据你服务器的配置，你可能需要使用用`.py`或者`.cgi`扩展名来保存此代码。出于对安全的考虑，此文件也可能需要放置在`cgi-bin`目录中。

也许你想知道`cgitb`那行代码有什么作用。这行代码显示良好的错误回溯，而不仅仅是崩溃时在用户的浏览器上显示“服务器内部错误”。这有利于进行debug，但存在一定的风险暴露某些机密的数据给用户。基于这个原因，你不应该在生产环境中使用`cgitb`模块。还有，终端用户不会喜欢在浏览器上看到“服务器内部错误”这样不伦不类的信息，所以你应该捕获所有异常，并显示合适的错误页面。

### 在你自己的服务器上安装配置CGI

如果你没有自己的服务器，这就不适用于你。你可以检查服务器是否如常工作，如果不是，你就可能需要联系你网站的管理员。如果它是一个庞大的主机，你可以尝试提交问题请求Python支持。

如果你就是自己的管理员，或者基于测试的目的想在自己的电脑上安装CGI，你就必须自己进行配置。因为每个服务器的配置选项都不用，所以配置CGI没有通用的方法。现在使用最广的免费服务器是[Apache HTTPd](http://httpd.apache.org/)，或者简称Apache。通过系统的包管理工具，Apache可以轻易地安装到几乎所有的系统。[lighttpd](http://www.lighttpd.net/) 则是另一个选项，据说有着更好的性能。在许多系统中，可以使用包管理工具来安装这个服务器，所以不再需要手动来编译它。

- 在Apache中，你可以在教程[Dynamic Content with CGI](http://httpd.apache.org/docs/2.2/howto/cgi.html)中查看所有相关内容。在大多数的情况下，只配置`+ExecCGI`就足够了。这篇教程也提到一些最常见的问题。
- 在lighttp中需要使用能直接配置的[CGI模块](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModCGI)。总的来说，只要合理地对`cgi.assign`进行设置。

### 关于cgi脚本的常见问题

在运行CGI脚本的时候，时常会出现一些小的烦人的问题。有时看起来似乎正确的脚本不会像预期那样工作，原因是某些小的隐藏问题很难被发现。

以下是一些潜在的问题：

- Python脚本没有被标记为可执行的。当CGI脚本不能被执行时，大部分服务器不会运行它并发送结果给用户，反而是让用户来下载它。在类Unix系统中，要正确运行CGI脚本，需要设置`+x` 位（修改执行权限）。使用`chmod a+x your_script.py`可能会解决问题。
- 在类Unix系统中，编程文件行结束必须是Unix风格的。这相当重要，因为服务器会检查脚本文件的第一行(称为shebang)，并尝试运行那里指定的程序。如果是Windows的行结束(回车和换行Carriage Return&Line Feed, 所以称为CRLF)，服务器就很容易混淆。因而你要将文件转为Unix的行结束(只有换行Line Feed，LF)。在通过FTP上传文件时，选择文本模式而非二进制模式，转换就可以自动完成。但更好的方式是在编辑器中用Unix风格的行结束保存文件。目前大多数的编辑器都支持这一选项。
- 你的Web服务器必须能够读取文件，还要保证相关权限的正确。在类Unix系统中，服务器常在用户和用户组为`www-data`的状态下运行。所以可以试着去修改文件的所有权，或者用`chmod a+r your_script.py`命令将文件改为可读状态。
- 在类Unix系统中，shebang(#!/usr/bin/env python)中解释器的路径必须正确。这行代码在`/usr/bin/python`中寻找Python，但如果该目录不存在或者路径不正确，查找都会失败。你如果知道你的Python安装在哪里，可以使用绝对路径。命令`whereis python`和`type -p python`都能帮助你找到它的安装位置。一旦你知道了正确的路径，你就可以相应地修改shebang:`#!/usr/bin/python`。
- 文件中不能包含BOM(Byte Order Mark)。使用BOM意味着使用UTF-16或UTF-32编码，但有的编辑器也将这些内容写进UTF-8编码的文件。BOM干扰了shebang一行，所以要确保你的编辑器不要将BOM写到文件中。
- 如果Web服务器在使用[mod_python](https://docs.python.org/3/howto/webservers.html#mod-python)，`mod_python`可能会有问题。`mod_python`能够自己处理CGI脚本，但也能成为问题的源头。

## mod_python

从PHP来的人经常很难抓住用Python进行Web开发的要领。他们第一时间想到的通常是`mod_python`，因为他们想`mod_python`等价于`mod_php`。事实上，它们之间有很多不同。`mod_python`做的是将解释器嵌入到Apache的进程里，这样就不用再为每个请求各启动一个解释器，从而加快了运行速度。另一方面，PHP经常混合着HTML，但Python不是。实际上，在Python中与之相当的是模板引擎。比起`mod_php`,`mod_python`本身要强大得多，它提供了更多的权限来访问Apache的内部。在一个Python混合HTML的“Python服务器页面”模式(与JSP相似)下，它可以模拟CGI工作。它还有一个“发布者”，可以指定一个文件来接收所有请求并决定接下来如何处理它们。

`mod_python`确实有很多问题。不同于PHP解释器，Python解释器在运行文件时是使用缓存的，所以修改文件时需要重启服务器。另一个问题是关于Apache的工作原理 — Apache启动子进程来处理请求，即使用不到Python，每个子进程依然要加载整个Python解释器。这让整个服务器运行得更慢了。另一个问题则是，如果不重新编译`mod_python`，它就不能切换版本(例如从2.4升级到2.5)，理由是`mod_python`依赖于一个特定版本的`libpython`。还有，`mod_python`是绑定到Apache上的，所以用`mod_python`写的程序不能轻易移植到在其他Web服务器上。

已经有很多原因解释了应该避免用`mod_python`写新的程序。在特定情况下，使用`mod_python`进行开发还是不错的，但自从WSGI出现后，我们就可以在`mod_python`下运行WSGI程序了。

## FastCGI和SCGI

FastCGI和SCGI尝试以另一种方式解决CGI的性能问题。取代了在Web服务器中嵌入解释器的做法，它们使用了一个长时间运行的后台进程。这还是一个能让服务器与后台进程“说话”的模块。既然后台进程独立于服务器，它就可以用包括Python在内的任何语言来完成。使用的语言只需要一个能处理与Web服务器通信的库。

正如SCGI本质上就是一个“简单的FastCGI”，FastCGI和SCGI之间的差距非常小。因为仅有少数的服务器支持SCGI，大多数人使用工作方式相似的FastCGI。几乎所有能应用于SCGI的也能应用于FastCGI，所以我们只讨论后者。

如今，FastCGI不再被直接使用。就像`mod_python`,它只在WSGI的应用开发中使用。

### 安装配置FastCGI

每个Web服务器都需要一个特定的模块。

- Apache有[mod_fastcgi](http://www.fastcgi.com/drupal/)和[mod_fcgid](https://httpd.apache.org/mod_fcgid/)。`mod_fastcgi`是先出来的一个，但因为一些许可问题，有时候会被误认为是收费的。`mod_fcgid`是一个体积更小，可兼容的替代选择。
- lighttd发布了自己的[FastCGI](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModFastCGI)模块和[SCGI](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModSCGI)模块。
- [nginx](http://nginx.org/)也支持[FastCGI](https://www.nginx.com/resources/wiki/start/topics/examples/simplepythonfcgi/)。

一旦你将模块安装配置完成，就可以用下面的WSGI应用进行测试：

```python
#!/usr/bin/env python
# -*- coding: UTF-8 -*-

import sys, os
from html import escape
from flup.server.fcgi import WSGIServer

def app(environ, start_response):
    start_response('200 OK', [('Content-Type', 'text/html')])

    yield '<h1>FastCGI Environment</h1>'
    yield '<table>'
    for k, v in sorted(environ.items()):
         yield '<tr><th>{0}</th><td>{1}</td></tr>'.format(
             escape(k), escape(v))
    yield '</table>'

WSGIServer(app).run()
```

这是一个简单的WSGI应用，但你需要先安装[flup][https://pypi.python.org/pypi/flup/1.0]模块来处理底层的FastCGI访问。

**参见**：有一些关于[用WSGI部署Django](https://docs.djangoproject.com/en/dev/howto/deployment/wsgi/)的文档,其中多数的经验可以复用到其他WSGI兼容的框架和库。除了`manage.py`的部分需要修改，这里的例子可以直接使用。在Django中使用也是差不多的。

## mod_wsgi

[mod_wsgi](http://code.google.com/p/modwsgi/)是一次企图摆脱底层网关束缚的尝试。上文提到的FastCGI，SCGI和mod_python大多是用来部署WSGI应用的，mod_wsgi则是直接将WSGI应用嵌入到Apache服务器中。mod_wsgi是专门设计来托管WSGI应用。比起使用其他更底层，还需要胶水语言的模块，使用它开发WSGI应用程序更为简单。缺点是mod_wsgi仅限于Apache服务器；其他服务器则需要自己的mod_wsgi实现。

mod_wsgi支持两种模式：嵌入模式，直接整合到Apache的进程中；守护进程模式，工作方式与FastCGI相似。

# 后退一步：WSGI

WSGI已经提到过几次，这似乎意味着它很重要。事实上，它确实是。所以是时候来解释它了。

网络服务器网关接口(Web Server Gateway Interface)，或者简称WSGI，在[**PEP 333**](https://www.python.org/dev/peps/pep-0333)中有详细定义，是目前进行Python网络编程的最佳方式。虽然这对开发框架的程序员来说是一件好事，但一个普通的Web开发人员通常不需要跟它有直接的接触。当选择Web开发框架的时候，最好选择一个支持WSGI的。WSGI最大的优点就是统一了应用程序的接口。如果你的程序兼容WSGI，这就意味这你外层使用的框架支持WSGI，你的程序可以部署到任意支持WSGI的Web服务器。你不再需要关心用户使用的是mod_python，FastCGI，还是mod_wsgi，因为使用了WSGI的程序可以在任何的网关接口上运行。Python的标准库也包含了它自己的WSGI服务器——[wsgiref](https://docs.python.org/3/library/wsgiref.html#module-wsgiref)，一个可用作测试的小型服务器。

一个WSGI真正强大的特性是中间件。中间件是一个可以在软件上添加各种功能的层。现在可以使用的的中间件相当地多。例如，你不再需要为自己的程序单独编写会话管理(HTTP 是一个无状态协议，当一个用户关联数个HTTP请求时，你的应用程序必须使用会话创建和管理状态)。压缩也可以用类似的方式完成，已有中间件利用gzip压缩你的HTML从而节省服务器宽带。通过中间件，验证的问题也可以轻松解决。

虽然WSGI可能看起来很复杂，但开始学习WSGI的收益是很大的，因为WSGI和它关联的中间件已经解决了许多开发网站会遇到的问题。

## WSGI服务器

用来连接像CGI和mod_python这样的底层网关的代码就称为*WSGI服务器*。其中一个代表是`flup`，它支持FastCGI和SCGI，还有[AJP](https://en.wikipedia.org/wiki/Apache_JServ_Protocol)。有一些服务器是用Python写的，比如`flup`。但也存在用C完成的，可以作为替代使用。

现在可以使用的WSGI服务器有很多，所以一个用Python写的Web应用几乎可以部署在任何地方。这也是Python和其他web技术相比的一大优点。


**参见**：在[WSGI homepage](https://wsgi.readthedocs.org/)可以找到WSGI相关代码的概述，其中还包含了一个涵盖很广的[WSGI服务器](https://wsgi.readthedocs.org/en/latest/servers.html)列表。你可能对已经包含在标准库中支持WSGI的模块感兴趣，即：

- [wsgiref](https://docs.python.org/3/library/wsgiref.html#module-wsgiref) ——一些WSGI开发的小型实用工具和服务器

## 案例学习：MoinMoin

WSGI到底给web应用开发者带来了什么？让我们通过一个应用来了解。这个存在已久的Python应用最初并没有使用WSGI。

[MoinMoin](https://moinmo.in/)是使用最广的wiki软件包中的一个。它创建于2000年，比WSGI还早了3年。旧的版本运行在CGI，mod_python,FastCGI上时都需要不同的代码。

现在的版本添加了对WSGI的支持。通过WSGI，不需要胶水语言，MoinMoin可以部署到任意WSGI兼容的服务器。不同于前WSGI版本，现在MoinMoin作者可能在不知道的情况下就使用了WSGI服务器。

## 模板-视图-控制器(Model-View-Controller)

术语*MVC*常在“框架foo支持MVC”这样的描述中出现。比起具体特定的API，MVC更像是对代码整体的一种组织形式。许多web框架使用这个模型来帮助开发者，给他们的程序带来清晰的结构。稍大型的web应用就有相当多的代码，所以从一开始拥有一个有效的结构是非常重要的。通过这种方式，只要提前了解MVC结构，即使是其他框架的用户(或者甚至是其他语言，因为MVC不是Python独有的)也能轻松地理解代码。

MVC代表三个组件：

- 模型。能够显示和修改的数据。在Python的框架中，一般由对象关系映射器（OR-Mapper)中的类来代表。
- 视图。这个组件的工作是向用户展示模型中的数据。此组件通常由模板实现。
- 控制器。这是用户与模型之间的一层。控制器对用户的动作作出响应(例如打开一些特定的URL),如果需要就通知模型去修改数据，并告诉视图部分要显示什么内容。

虽然人们可能认为MVC是一个复杂的设计模式，但实际上它不是。它被用在Python中，是因为事实证明了它有助于创建简洁，可维护的网站。

**笔记**：虽然不是全部Python框架明确支持MVC，但这不重要。创建网站的时候依然可以按照MVC模式，从用户交互逻辑(控制器)和模板(视图)中分离数据逻辑(模型)。因此也建议不要在模板中添加不必要的Python代码。否则就违背了MVC模式的工作理念，令程序变得难以理解和修改。

**参见**：英文Wikipedia有一篇关于[MVC设计模式](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller)的文章。文中详细地列出了各种语言的web框架。

# 网站的组成成分

网站有着复杂的结构。为了减轻web开发者的负担，让项目更容易编写和维护，许多工具被开发了出来。在其他语言的各种框架中都存在着类似的工具。一般情况下不会有人强迫开发者使用这些工具，而且通常“最好”的工具都是不存在的。某些工具会简化开发网站的流程，所以适当选择学习一部分还是不错的。

**参见**：实际网站的组件要比这里提到的要多得多。Python的wiki中有一个叫[Web Components](https://wiki.python.org/moin/WebComponents)的页面，里面有关于这些组件的详细叙述。

## 模板

只有少数的库可以允许Python代码和HTML混合。虽然这样做很方便，但会导致代码非常地难以维护。基于这个原因，模板就诞生了。在最简单的情况下，模板只是带有占位符的HTML文件。在填充完占位符后，HTML会被发送到用户的浏览器上。

Python已经内置了一种方法来构建简单的模板：

```python
# a simple template
template = "<html><body><h1>Hello {who}!</h1></body></html>"
print(template.format(who="Reader"))
```

为了用庞杂的数据模型，判断和循环结构来生成复杂的HTML页面，像Python的*for*和*if*通常都是需要的。*模板引擎*正好支持这种复杂的模板。

许多用于Python的模板引擎都是独立于框架的。其中一些定义成了某种容易上手的纯文本编程语言，部分原因是它被限制在特定的作用域内。还有模板使用XML，这就保证了它的输出一定是有效的XML。当然，其他种类的还有很多。

有些框架发布了自己的模板引擎或者推荐特定的一个。使用框架自己的或者推荐的通常都是不错的。

流行的模板引擎包括：

- [Mako](http://www.makotemplates.org/)
- [Genshi](http://genshi.edgewall.org/)
- [Jinja](http://jinja.pocoo.org/)

**参见**：因为用Python来完成一个模板引擎是相当容易的，所以许多模板引擎为了引起开发者的关注而开始了相互竞争。在wiki页面[模板](https://wiki.python.org/moin/Templating)中列出了一个数量庞大且不断增长的模板引擎列表。上面列出的三个被认为是”第二代“引擎，是了解模板引擎的好例子。

## 数据持久性

*数据持久性*，听起来很复杂，其实就是储存数据。数据可能来自博客条目的文本，布告栏的帖子，或者wiki页面的正文。当然，在web服务器中有多种不同的方式来存储信息。

因为在处理百万级数据时有着有着良好的性能，像[MYSQL](http://www.mysql.com/)或者[PostgreSQL](http://www.postgresql.org/)这样的关系型数据库经常被使用。但还存在着像[SQLite](http://www.sqlite.org/)一样的小型数据库。SQLite只使用一个单独的文件，附带于Python的[sqlite3](https://docs.python.org/3/library/sqlite3.html#module-sqlite3)模块。它没有其他依赖。对于较小的站点，SQLite就足够了。

关系型数据库通过一种称为[SQL](https://en.wikipedia.org/wiki/SQL)的语言进行查询。一般来说，Python程序员不太喜欢SQL，因为他们喜欢使用对象。通过使用一种叫ORM(Object Relational Mapping)的技术，Python对象可以保存在数据库中。在后台，ORM将全部面向对象的访问转化为SQL代码，所以开发者不用注意太多。大多数的框架在使用各种ORM，而且使用的效果确实不错。

第二种可能就是将数据存储在普通的纯文本文件（有时候称为“flat files”）。对于简单的网站而言，这很容易实现，但如果网站经常更新数据，那就表现得不如尽人意了。

第三种可能则是使用面向对象的数据库（也称为”对象数据库“）。这种数据库存储对象数据的方式与程序运行时对象在内存中结构化的方式接近。（相比之下，ORM将对象数据存储为表中的数据行以及行之间的关系。）直接储存对象的优点是几乎所有的对象都可以直接保存。反观关系型数据库，一些特别的对象就很难被表达。

框架通常都会对选择哪种存储数据方式的问题上给点建议。除非有特殊的应用场合，遵循它给的建议一般都能很好地满足存储需求。

**参见**：

- [Persistence Tools](https://wiki.python.org/moin/PersistenceTools)列出了在文件系统中存储数据的各种方式。其中某些模块被包含在标准库中
- [Database Programing](https://wiki.python.org/moin/DatabaseProgramming)帮助开发者选择一种方式来保存数据
- [SQLAlchemy](http://www.sqlalchemy.org/)，Python中最强大的OR-Mapper。还有[Elixir](https://pypi.python.org/pypi/Elixir)，简化了SQLAlchemy的使用
- [SQLObject](http://www.sqlobject.org/)，另一个流行的OR-Mapper
- [ZODB](https://launchpad.net/zodb)和[Durus](https://www.mems-exchange.org/software/)，两个面向对象的数据库

# 框架

在为网站运行编写代码的过程中，需要涉及到多种服务。不管网站的复杂性如何，它的目标是什么，提供特殊服务的代码其工作方式都是一样的。在web开发中，将常见问题的解决方法抽象出来转化为可复用的代码就叫做框架。也许你听说过最著名的web开发框架是 Ruby on Rails， 但Python也有自己的框架。其中有部分是受Rails启发或者是借鉴了Rails的想法。不过在Rails诞生之前，许多框架就已经存在了很长时间。

原来Python Web框架倾向于整合开发网站需要的所有服务，并集成一系列的开发工具。但没有哪两个web框架能够相互协作：没有经过深思熟虑的重构后，用A框架的开发的程序是不能部署在B框架上的。这种趋势推动了“minimalist”（极简主意）web框架的发展。这类型的框架只保留了让代码与http协议通信的工具，其他服务则需要在上层通过分开的组件逐一添加。为了让框架之间能彼此协作，一些标准应运而生。比如某个标准，可以允许不同的模板引擎相互替换使用。

随着WSGI的出现，Python Web框架一直在向基于WSGI标准的互操作性上发展。现在不论是“全栈”的（提供开发最复杂网站需要的所有工具）还是微型的（minimalist），或者其他任意类型的web框架，都是由可运行在多个框架上的可复用组件集合而成。

多数的用户会可能选择一个拥有活跃社区的“全栈”框架。这些框架都渐渐地有了友好的文档，并且提供了一种最简流程来引导开发者在最短时间内完成功能齐全的网站。

## 一些值得关注的框架

现在框架的数量多到难以置信，所以这里不可能都一一提及。相对地，我们只简单地介绍几个最流行的框架。

### Django

[Django](https://www.djangoproject.com/)是一个包含了数个紧密耦合组件的框架。其中的组件都是重新写的，相互配合得很好。Django提供的ORM相当强大，而且简单易用。内置的在线用户管理界面能够让人们通过浏览器编辑数据库中的数据。为了照顾不会Python的网页设计人员，它的模板引擎是基于文本的。它还支持模板继承和过滤器（类似于Unix的管道）。Django附带了许多便利的特性，例如通过生成RSS feeds和generic views，几乎不用写Python代码就可以创建一个网站。

Django还拥有一个庞大的国际社区，里面的成员创建了无数的站点。为了拓展Django的常用功能，还存在着大量的插件。这部分归功于Django友好的[在线文档](https://docs.djangoproject.com/)和[Django book](http://www.djangobook.com/)。

**笔记**：虽然Django是MVC设计的框架，但它命名的方式有些不一样，你可以在[Django FAQ](https://docs.djangoproject.com/en/dev/faq/general/#django-appears-to-be-a-mvc-framework-but-you-call-the-controller-the-view-and-the-view-the-template-how-come-you-don-t-use-the-standard-names)中找到相关叙述。

### TurboGears

Python另一个流行的web框架是[TurboGears](http://www.turbogears.org/)。TurboGears使用现有的组件并用胶水语言组合它们，通过这种方法来实现无缝连接。在选择组件的时候，TurboGears给予了用户充分的自由。例如ORM和模板引擎都可以改为使用非默认的软件。

可以在[TurboGears documentation](https://turbogears.readthedocs.org/)种找到相关文档，里面还有视频教程。TurboGears也有一个活跃的社区，能回答最相关的问题。[TurboGears book](http://turbogears.org/1.0/docs/TGBooks.html)已经出版，这同样是一个学习TurboGears很好的起点。

TurboGears最新的版本是2.0，在WSGI支持和基于模组的架构的方向上更进一步。TurboGears2的WSGI技术栈是基于另一个流行的组件兼容的web框架——[Pylons](http://www.pylonsproject.org/)。

### Zope

框架Zope是一个“古老原始”的框架。它的化身Zope2是一个高度集成的全栈框架。它一个最有趣的特性是它与一个强大的面向对象数据库[ZODB](https://launchpad.net/zodb)（Zope Object Database）紧密结合。由于其高度的集成性，Zope最终的生态圈稍微有些孤立：为Zope编写的代码很难能在用在Zope以外的地方，反之亦然。Zope 3开始致力于解决这个问题。Zope 3将Zope重写成一套清晰独立的组件。这项工作开始于WSGI标准建立之前，但项目[Repoze](http://repoze.org/)为Zope 3添加了对WSGI的支持。Zope的组件已经在背后默默地工作了很多年，Zope 3则将这些组件开放给更广泛的Python社区。甚至促成一个新的基于Zope组件的框架：[Grok](http://grok.zope.org/)

当前最强大和最受欢迎的内容管理系统——[Plone](https://plone.org/)，就是基于Zope实现的。

## 其他值得关注的框架

实际可用的框架当然不止这些，还有许多其他的框架值得一试。

另一个被提到的框架是[Pylons](http://www.pylonsproject.org/)。Pylons很像TuroGears，但更强调灵活性，为此也牺牲了易用性。在Pylons中，几乎每一个组件都可以被替换。这就导致了每个单独的组件都需要很多文档。Pylons是建立在[Paste](http://pythonpaste.org/)的基础上，而Paste是一个方便WSGI使用的工具集。

这还不是所有。你可以在Python wiki中找到更多最新的信息。

**参见**：Python wiki包含了一个范围很广的[web 框架](https://wiki.python.org/moin/WebFrameworks)列表。大部分框架都有自己的邮件列表和IRC频道，在对应项目的网站就能找到这些信息。
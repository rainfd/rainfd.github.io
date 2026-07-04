---
author: RainFD
title: "HOWTO Use Python in the Web"
pubDatetime: 2017-02-23T00:00:00+08:00
draft: false
locale: en
translationKey: howto-python-web-dev
description: "A comprehensive overview of how Python fits into web development, covering different ways Python integrates with web servers and common practices for building websites."
tags:
  - Python
---
Original: [HOWTO Use Python in the Web](https://docs.python.org/3/howto/webservers.html)

*This document shows how Python fits into the web. It presents several ways Python can integrate with web servers, along with general practices for website development.*

<!--more-->

Since the rise of "Web 2.0" — where users drive content creation — web programming has become a hot topic. For a long time, building websites with Python was fairly cumbersome, so few people did it. As a result, people created many frameworks and tools to help developers build faster, more reliable websites. This HOWTO introduces several ways Python can work with web servers to generate dynamic content. The topic is too broad to cover in detail in a single document, so this is just a brief overview of some popular libraries.

**See also**: This HOWTO attempts to give an overview of Python web development, but it may not always be up to date. Python web development is evolving rapidly, so the wiki page on [Web Programming](https://wiki.python.org/moin/WebProgramming) may be closer to recent developments.

---

# The Low-Level View

When a user visits a website, their browser connects to the website's server (this is called a *request*). The server looks up a file on the filesystem and sends it back to the user's browser (this is called a *response*). That's roughly how the low-level HTTP protocol works. Dynamic websites aren't based on filesystem files — they're based on programs. When a request comes in, a program running on the server generates the content and sends it back. These programs can handle all kinds of user data: listing bulletin board posts, showing your email, configuring software, or just displaying the current time. These programs can be written in any language the server supports. Since most servers now support Python, creating dynamic websites with Python has become pretty straightforward.

Most HTTP servers are written in C or C++, so they can't execute Python code directly. That means there needs to be a bridge between the server and the program. This bridge — or more precisely, the interface — determines how the program interacts with the server.

There have been countless attempts to create the best possible interface, but only a few are worth noting.

Not every server supports every interface. Many servers only support older, now-outdated interfaces. However, they can often be extended through third-party modules to support newer ones.

## Common Gateway Interface

This interface, commonly called "CGI," is the oldest one and is well-supported by nearly all web servers. The program is started by the server when handling a single request, communicating with the server through CGI. This means a new Python interpreter is launched for every request, which makes the entire interface only workable under low load.

CGI's advantage is its simplicity — writing a CGI program in Python is about three lines of code. This simplicity has led to a misconception: that it offers little help to developers.

While it's still possible to write CGI programs, it's no longer recommended. Using WSGI, which I'll cover later, you can write programs in a CGI-like fashion, and when absolutely necessary, they can also run as CGI.

**See also**: The Python standard library includes some modules to help create simple CGI programs:

- [cgi](https://docs.python.org/3/library/cgi.html#module-cgi) — handle user input in CGI scripts

- [cgitb](https://docs.python.org/3/library/cgitb.html#module-cgitb) — instead of showing a "500 Internal Server Error" when things go wrong in a CGI application, display a proper error traceback

The Python wiki has a page dedicated to CGI scripts with additional information about CGI in Python.

### A Simple Script for Testing CGI

You can use this short CGI program to test whether your server supports CGI.

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

Depending on your server configuration, you may need to save this code with a `.py` or `.cgi` extension. For security reasons, the file may also need to be placed in a `cgi-bin` directory.

You might wonder what the `cgitb` line does. It displays nice error tracebacks instead of just showing "Internal Server Error" when a crash occurs. This helps with debugging, but it carries some risk of exposing sensitive data to users. For this reason, you shouldn't use the `cgitb` module in production. Also, end users don't want to see ugly "Internal Server Error" messages in their browsers, so you should catch all exceptions and display a proper error page.

### Setting Up CGI on Your Own Server

If you don't have your own server, this doesn't apply to you. You can check if your server is working properly, and if not, you may need to contact your website's administrator. If it's a large host, you can try submitting a ticket to request Python support.

If you're your own administrator, or if you want to set up CGI on your own machine for testing, you'll need to configure it yourself. There's no universal method for configuring CGI because each server's configuration options differ. The most widely used free server is [Apache HTTPd](http://httpd.apache.org/), or simply Apache. Apache can be easily installed on virtually any system using your system's package manager. [lighttpd](http://www.lighttpd.net/) is another option, reportedly offering better performance. On many systems, this server can be installed using the package manager as well, so there's no need to compile it manually.

- For Apache, you can find everything you need in the tutorial [Dynamic Content with CGI](http://httpd.apache.org/docs/2.2/howto/cgi.html). In most cases, just configuring `+ExecCGI` is enough. The tutorial also covers the most common issues.
- For lighttpd, you'll need to use the directly-configurable [CGI module](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModCGI). Generally speaking, just setting `cgi.assign` appropriately will do the trick.

### Common Problems with CGI Scripts

When running CGI scripts, small annoying issues often crop up. Sometimes a script that looks correct won't work as expected because of small hidden problems that are hard to spot.

Here are some potential issues:

- The Python script isn't marked as executable. When a CGI script can't be executed, most servers won't run it and send the result to the user — instead, they'll let the user download it. On Unix-like systems, for a CGI script to run properly, the `+x` bit needs to be set (modifying execute permissions). Running `chmod a+x your_script.py` will probably fix the problem.
- On Unix-like systems, the program file's line endings must be Unix-style. This is quite important because the server checks the first line of the script file (called the shebang) and tries to run the program specified there. If the line endings are Windows-style (Carriage Return & Line Feed, hence CRLF), the server can easily get confused. So you need to convert the file to Unix line endings (Line Feed only, LF). When uploading files via FTP, choosing text mode instead of binary mode does the conversion automatically. But a better approach is to save files with Unix-style line endings in your editor. Most editors today support this option.
- Your web server must be able to read the file, and the relevant permissions need to be correct. On Unix-like systems, the server often runs as the `www-data` user and group. So you can try changing the file's ownership, or use `chmod a+r your_script.py` to make the file readable.
- On Unix-like systems, the interpreter path in the shebang (`#!/usr/bin/env python`) must be correct. This line looks for Python at `/usr/bin/python`, but if that directory doesn't exist or the path is wrong, the lookup will fail. If you know where your Python is installed, you can use an absolute path. The commands `whereis python` and `type -p python` can both help you find its location. Once you know the correct path, you can update the shebang accordingly: `#!/usr/bin/python`.
- The file must not contain a BOM (Byte Order Mark). A BOM indicates UTF-16 or UTF-32 encoding, but some editors also write it into UTF-8 encoded files. The BOM interferes with the shebang line, so make sure your editor doesn't write a BOM to the file.
- If the web server is using [mod_python](https://docs.python.org/3/howto/webservers.html#mod-python), `mod_python` may cause problems. `mod_python` can handle CGI scripts on its own, but it can also be a source of issues.

## mod_python

People coming from PHP often struggle to grasp web development with Python. Their first instinct is usually `mod_python`, because they think `mod_python` is equivalent to `mod_php`. In reality, there are many differences. `mod_python` embeds the interpreter into the Apache process, so you no longer need to start a new interpreter for each request, which speeds things up. On the other hand, PHP is often mixed with HTML, but Python isn't. In Python, the equivalent is a template engine. Compared to `mod_php`, `mod_python` itself is much more powerful — it provides far greater access to Apache internals. It can emulate CGI working in a "Python Server Pages" mode (similar to JSP), where Python is mixed with HTML. It also has a "publisher" that can designate a single file to receive all requests and decide what to do next.

`mod_python` does have a number of problems. Unlike the PHP interpreter, the Python interpreter caches files when running, so you need to restart the server whenever you modify a file. Another issue relates to how Apache works — Apache spawns child processes to handle requests, and even if Python isn't needed, each child process still loads the entire Python interpreter. This makes the whole server run slower. Yet another problem is that without recompiling `mod_python`, you can't switch Python versions (e.g., from 2.4 to 2.5), because `mod_python` depends on a specific version of `libpython`. Also, `mod_python` is bound to Apache, so programs written with `mod_python` can't easily be ported to other web servers.

There are plenty of reasons to avoid writing new programs with `mod_python`. In certain cases, developing with `mod_python` can still be fine, but since WSGI came along, we can now run WSGI applications under `mod_python`.

## FastCGI and SCGI

FastCGI and SCGI try to solve CGI's performance problem in a different way. Instead of embedding an interpreter inside the web server, they use a long-running background process. There's still a module that lets the server "talk" to this background process. Since the background process is independent of the server, it can be written in any language, including Python. The language just needs a library that handles communication with the web server.

Since SCGI is essentially "simple FastCGI," the gap between FastCGI and SCGI is very small. Because few servers support SCGI, most people use FastCGI, which works similarly. Almost everything that applies to SCGI also applies to FastCGI, so we'll only discuss the latter.

Nowadays, FastCGI is no longer used directly. Like `mod_python`, it's only used for deploying WSGI applications.

### Setting Up FastCGI

Each web server needs a specific module.

- Apache has [mod_fastcgi](http://www.fastcgi.com/drupal/) and [mod_fcgid](https://httpd.apache.org/mod_fcgid/). `mod_fastcgi` came first, but due to some licensing issues, it's sometimes mistaken for paid software. `mod_fcgid` is a smaller, compatible alternative.
- lighttpd ships its own [FastCGI](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModFastCGI) module and [SCGI](http://redmine.lighttpd.net/projects/lighttpd/wiki/Docs_ModSCGI) module.
- [nginx](http://nginx.org/) also supports [FastCGI](https://www.nginx.com/resources/wiki/start/topics/examples/simplepythonfcgi/).

Once you've installed and configured the module, you can test with the following WSGI application:

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

This is a simple WSGI application, but you'll need to install the [flup](https://pypi.python.org/pypi/flup/1.0) module first to handle the low-level FastCGI access.

**See also**: There's some documentation on [deploying Django with WSGI](https://docs.djangoproject.com/en/dev/howto/deployment/wsgi/), and most of the advice there can be reused with other WSGI-compatible frameworks and libraries. Aside from the `manage.py` parts that need changing, the examples can be used directly. It's pretty similar in Django.

## mod_wsgi

[mod_wsgi](http://code.google.com/p/modwsgi/) is an attempt to break free from low-level gateway constraints. While FastCGI, SCGI, and mod_python are mostly used to deploy WSGI applications, mod_wsgi embeds WSGI applications directly into the Apache server. mod_wsgi was specifically designed to host WSGI applications. Compared to using lower-level modules that need glue code, developing WSGI applications with it is much simpler. The downside is that mod_wsgi is limited to the Apache server; other servers would need their own mod_wsgi implementation.

mod_wsgi supports two modes: embedded mode, integrated directly into Apache processes, and daemon mode, which works similarly to FastCGI.

# Stepping Back: WSGI

WSGI has been mentioned several times already, which suggests it's important. And indeed it is. So now is the time to explain it.

The Web Server Gateway Interface, or WSGI for short, defined in detail in [**PEP 333**](https://www.python.org/dev/peps/pep-0333), is currently the best way to do Python web programming. While this is great news for framework developers, an ordinary web developer usually doesn't need to interact with it directly. When choosing a web framework, it's best to pick one that supports WSGI. The biggest advantage of WSGI is that it unifies application interfaces. If your application is WSGI-compatible — meaning the framework you're using supports WSGI — your application can be deployed on any WSGI-compatible web server. You no longer need to worry about whether users use mod_python, FastCGI, or mod_wsgi, because a WSGI application can run on any gateway interface. Python's standard library also includes its own WSGI server — [wsgiref](https://docs.python.org/3/library/wsgiref.html#module-wsgiref), a small server you can use for testing.

A truly powerful feature of WSGI is middleware. Middleware is a layer that can add various functionalities to your software. There's a considerable amount of middleware available today. For example, you no longer need to write your own session management for your application (HTTP is a stateless protocol; when a user is associated with several HTTP requests, your application must create and manage state using sessions). Compression can be handled similarly — there's middleware that gzips your HTML to save server bandwidth. Authentication can also be easily solved through middleware.

Although WSGI may look complicated, the payoff from learning it is substantial, because WSGI and its associated middleware have already solved many of the problems you'll encounter when developing websites.

## WSGI Servers

The code that connects to low-level gateways like CGI and mod_python is called a *WSGI server*. One example is `flup`, which supports FastCGI, SCGI, and [AJP](https://en.wikipedia.org/wiki/Apache_JServ_Protocol). Some servers are written in Python, like `flup`. But there are also C-based alternatives available.

There are many WSGI servers available today, so a Python web application can be deployed almost anywhere. This is a major advantage of Python compared to other web technologies.

**See also**: The [WSGI homepage](https://wsgi.readthedocs.org/) has an overview of WSGI-related code, including a comprehensive list of [WSGI servers](https://wsgi.readthedocs.org/en/latest/servers.html). You might also be interested in the WSGI-supporting module already included in the standard library:

- [wsgiref](https://docs.python.org/3/library/wsgiref.html#module-wsgiref) — a set of small utility tools and server for WSGI development

## Case Study: MoinMoin

What does WSGI actually bring to web application developers? Let's see through one application. This long-standing Python application didn't originally use WSGI at all.

[MoinMoin](https://moinmo.in/) is one of the most widely used wiki software packages. It was created in 2000, three years before WSGI. Older versions needed different code to run on CGI, mod_python, and FastCGI.

The current version has added WSGI support. With WSGI, MoinMoin can be deployed on any WSGI-compatible server without glue code. Unlike the pre-WSGI versions, MoinMoin's authors might now be using WSGI servers without even knowing it.

## Model-View-Controller

The term *MVC* often appears in descriptions like "framework foo supports MVC." Rather than a specific API, MVC is more of an overall way to organize code. Many web frameworks use this model to help developers bring a clear structure to their applications. Larger web applications have a fair amount of code, so having an effective structure from the start is very important. This way, even users of other frameworks (or even other languages, since MVC isn't Python-specific) can easily understand the code if they know the MVC structure upfront.

MVC stands for three components:

- Model. The data that can be displayed and modified. In Python frameworks, this is typically represented by classes in an Object Relational Mapper (OR-Mapper).
- View. This component's job is to show the user the data from the model. It's usually implemented through templates.
- Controller. This sits between the user and the model. The controller responds to user actions (such as opening specific URLs), tells the model to modify data if needed, and tells the view what to display.

While people might think MVC is a complex design pattern, it actually isn't. It's used in Python because it has proven to help create clean, maintainable websites.

**Note**: Not all Python frameworks explicitly support MVC, but that doesn't matter. You can still follow the MVC pattern when building websites, separating data logic (model) from user interaction logic (controller) and templates (view). It's therefore recommended not to add unnecessary Python code into templates. Doing so goes against the philosophy of MVC and makes the program harder to understand and modify.

**See also**: English Wikipedia has an article on the [MVC design pattern](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93controller). The article lists web frameworks in various languages in detail.

# Ingredients for Websites

Websites have complex structures. To ease the burden on web developers and make projects easier to write and maintain, many tools have been developed. Similar tools exist in frameworks across other languages. Generally speaking, no one forces developers to use these tools, and there's usually no "best" tool. Some tools do simplify the process of developing websites, so it's a good idea to choose and learn a few.

**See also**: Real-world websites have many more components than mentioned here. Python's wiki has a page called [Web Components](https://wiki.python.org/moin/WebComponents) with detailed descriptions of these components.

## Templates

Only a few libraries allow Python code to be mixed with HTML. While this is convenient, it leads to code that's very difficult to maintain. For this reason, templates were born. In the simplest case, a template is just an HTML file with placeholders. After the placeholders are filled in, the HTML is sent to the user's browser.

Python already has a built-in way to build simple templates:

```python
# a simple template
template = "<html><body><h1>Hello {who}!</h1></body></html>"
print(template.format(who="Reader"))
```

To generate complex HTML pages with large data models, conditionals, and loop structures, Python's *for* and *if* are usually needed. *Template engines* support exactly this kind of complex templating.

Many template engines for Python are framework-independent. Some define a kind of plain-text programming language that's easy to pick up, partly because it's restricted to a specific scope. Others use XML, which guarantees the output will always be valid XML. There are many other variations, of course.

Some frameworks ship their own template engine or recommend a specific one. Using the framework's own or recommended one is generally a good idea.

Popular template engines include:

- [Mako](http://www.makotemplates.org/)
- [Genshi](http://genshi.edgewall.org/)
- [Jinja](http://jinja.pocoo.org/)

**See also**: Because it's fairly easy to build a template engine in Python, many template engines compete for developers' attention. The wiki page on [Templating](https://wiki.python.org/moin/Templating) lists a huge and growing number of template engines. The three listed above are considered "second generation" engines, and they're good examples to get started with.

## Data Persistence

*Data persistence* sounds complicated, but it's really just storing data. The data could be blog entry text, bulletin board posts, or wiki page content. Of course, there are many different ways to store information on a web server.

Relational databases like [MySQL](http://www.mysql.com/) or [PostgreSQL](http://www.postgresql.org/) are often used because of their good performance when handling millions of records. But there are also smaller databases like [SQLite](http://www.sqlite.org/). SQLite uses just a single file and comes with Python's [sqlite3](https://docs.python.org/3/library/sqlite3.html#module-sqlite3) module. It has no other dependencies. For smaller sites, SQLite is often enough.

Relational databases are queried through a language called [SQL](https://en.wikipedia.org/wiki/SQL). Generally, Python programmers aren't big fans of SQL because they prefer working with objects. Using a technique called ORM (Object Relational Mapping), Python objects can be saved to databases. Behind the scenes, the ORM translates all object-oriented access into SQL code, so the developer doesn't have to pay much attention. Most frameworks use various ORMs, and they work really well.

A second possibility is storing data in plain text files (sometimes called "flat files"). For simple websites, this is easy to implement, but if the site updates data frequently, it doesn't perform as well.

A third possibility is using object-oriented databases (also called "object databases"). These databases store object data in a way that's close to how objects are structured in memory when a program runs. (By contrast, an ORM stores object data as rows in tables and relationships between rows.) The advantage of directly storing objects is that almost any object can be saved directly. With relational databases, some special objects are hard to represent.

Frameworks usually offer guidance on which data storage approach to choose. Unless you have a special use case, following their recommendation generally works well.

**See also**:

- [Persistence Tools](https://wiki.python.org/moin/PersistenceTools) lists various ways to store data on the filesystem. Some of these modules are included in the standard library.
- [Database Programming](https://wiki.python.org/moin/DatabaseProgramming) helps developers choose a way to persist data.
- [SQLAlchemy](http://www.sqlalchemy.org/), the most powerful OR-Mapper in Python. Also [Elixir](https://pypi.python.org/pypi/Elixir), which simplifies using SQLAlchemy.
- [SQLObject](http://www.sqlobject.org/), another popular OR-Mapper.
- [ZODB](https://launchpad.net/zodb) and [Durus](https://www.mems-exchange.org/software/), two object-oriented databases.

# Frameworks

Writing code for running a website involves many different services. Regardless of the website's complexity or purpose, code that provides specific services works in similar ways. In web development, abstracting solutions to common problems into reusable code is called a framework. You've probably heard of the most famous web development framework, Ruby on Rails, but Python has its own frameworks too. Some of them are inspired by Rails or borrow ideas from Rails. However, many frameworks had existed long before Rails was born.

Originally, Python web frameworks tended to integrate all the services needed for website development, bundling a full set of development tools. But no two web frameworks could interoperate: without a careful rewrite, an application built with framework A couldn't be deployed on framework B. This trend drove the rise of "minimalist" web frameworks. These frameworks only provide the tools to let code communicate over the HTTP protocol; other services are added layer by layer through separate components. To make frameworks work together, standards emerged. For example, one standard allows different template engines to be swapped in and out.

With the advent of WSGI, Python web frameworks have been moving toward WSGI-based interoperability. Now, whether it's a "full-stack" framework (providing all the tools needed to build the most complex websites), a micro-framework (minimalist), or any other type of web framework, they're all composed of reusable components that can run across multiple frameworks.

Most users will likely choose a "full-stack" framework with an active community. These frameworks have increasingly friendly documentation and provide a streamlined process to help developers get a fully functional website up and running in the shortest time.

## Some Frameworks Worth Noting

There are an incredible number of frameworks out there now, so it's impossible to mention them all. Instead, I'll briefly introduce a few of the most popular ones.

### Django

[Django](https://www.djangoproject.com/) is a framework made up of several tightly coupled components. The components are all written from scratch and work well together. Django's ORM is quite powerful and easy to use. Its built-in admin interface lets people edit database data right through a browser. To accommodate web designers who don't know Python, its template engine is text-based. It also supports template inheritance and filters (similar to Unix pipes). Django comes with many convenient features, like generating RSS feeds and generic views, making it possible to create a website with almost no Python code.

Django also has a huge international community whose members have built countless sites. A large number of plugins exist to extend Django's common functionality. This is partly thanks to Django's friendly [online documentation](https://docs.djangoproject.com/) and the [Django book](http://www.djangobook.com/).

**Note**: Although Django is an MVC-designed framework, it names things a bit differently. You can read about it in the [Django FAQ](https://docs.djangoproject.com/en/dev/faq/general/#django-appears-to-be-a-mvc-framework-but-you-call-the-controller-the-view-and-the-view-the-template-how-come-you-don-t-use-the-standard-names).

### TurboGears

Another popular Python web framework is [TurboGears](http://www.turbogears.org/). TurboGears uses existing components and glues them together with glue code, achieving seamless integration. When choosing components, TurboGears gives users plenty of freedom. For example, both the ORM and template engine can be swapped for non-default alternatives.

Documentation can be found in the [TurboGears documentation](https://turbogears.readthedocs.org/), which also includes video tutorials. TurboGears also has an active community that can answer most relevant questions. The [TurboGears book](http://turbogears.org/1.0/docs/TGBooks.html) has been published, which is also a great starting point for learning TurboGears.

The latest version of TurboGears is 2.0, which pushes further in the direction of WSGI support and a component-based architecture. TurboGears 2's WSGI stack is built on another popular component-compatible web framework — [Pylons](http://www.pylonsproject.org/).

### Zope

The Zope framework is an "ancient and primordial" framework. Its incarnation Zope2 is a tightly integrated full-stack framework. One of its most interesting features is its tight integration with a powerful object-oriented database, [ZODB](https://launchpad.net/zodb) (Zope Object Database). Because of this high level of integration, Zope's ecosystem ended up somewhat isolated: code written for Zope is hard to use outside of Zope, and vice versa. Zope 3 set out to solve this problem. Zope 3 rewrote Zope as a set of clean, independent components. This work started before the WSGI standard was established, but the [Repoze](http://repoze.org/) project added WSGI support to Zope 3. Zope's components have been working quietly behind the scenes for many years, and Zope 3 opens these components up to the wider Python community. It even led to a new framework built on Zope components: [Grok](http://grok.zope.org/).

One of the most powerful and popular content management systems today — [Plone](https://plone.org/) — is implemented on top of Zope.

## Other Notable Frameworks

Of course, the available frameworks go far beyond these. There are many others worth trying.

Another framework worth mentioning is [Pylons](http://www.pylonsproject.org/). Pylons is a lot like TurboGears but emphasizes flexibility, at the cost of ease of use. In Pylons, almost every component can be replaced. This means each individual component needs a lot of documentation. Pylons is built on [Paste](http://pythonpaste.org/), a set of tools that make it easy to work with WSGI.

And that's still not all. You can find the latest information on the Python wiki.

**See also**: The Python wiki includes a broad list of [web frameworks](https://wiki.python.org/moin/WebFrameworks). Most frameworks have their own mailing lists and IRC channels; you can find this information on the corresponding project websites.

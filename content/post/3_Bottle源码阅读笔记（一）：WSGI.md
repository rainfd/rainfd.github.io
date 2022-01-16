+++
title = "Bottle源码阅读笔记（一）：WSGI"
description = ""
tags = [
  "python",
  "bottle",
  "web"
]
date = 2017-06-05

+++

**前言**
Bottle是一个Python Web框架。整个框架只有一个文件，不到4k行的代码，没有Python标准库以外的依赖，却包含了路由、模板和插件等Web框架常用功能。通过阅读Bottle源码来了解什么是Web框架和Web框架是怎么工作是再合适不过了。由于Bottle是一个支持WSGI的框架，在阅读源码之前，我们先来了解什么是WSGI。

注意：文中使用的Bottle版本为0.12.13。

# WSGI


一般的Web服务器只能处理静态页面。如果涉及到动态内容，服务器就需要与Java/Python/Ruby等服务器语言进行交互，将内容交给它们处理。由于大多数的Web服务器都是用C写，它们不能直接执行服务器语言，所以两者之间需要一座桥（在实际应用中，通常会在Web服务器和WSGI应用中间添加一个应用服务器来支持WSGI）。而在Python中，WSGI就是这么一座桥。WSGI的实现分两个部分，一是服务器，二是应用程序。下面来看一看它们各自是什么样子的，以及两者之间是如何协作的。

```python
class Server:

    def __init__(self, server_address):
        self.server_address = server_address

    def set_app(self, application):
        self.app = application

    def serve_forever(self):
        while True:
            # socket.accept()
            if request_comein():
                self.handle_request()

    def handle_request(self):
        request_data = self.get_request()
        self.parse_request(request_data)
        environ = self.get_environ()
        result = self.application(environ, self.start_response)
        self.send_response(result)

    def start_response(self, status, headers, exc_info):
        pass

    def get_environ(self):
        pass

    def get_request(self):
        pass

    def parse_request(self, text):
        pass

    def send_response(self, message):
        pass


def make_server(host, port, app, server=Server):
    server = server((host, port))
    server.set_app(app)
    return server

def simple_app(environ, start_response):
    status = '200 OK'
    response_headers = [('Content-type', 'text/plain')]
    start_response(status, response_headers)
    return 'Hello World!'

if __name__ == '__main__':
    server = make_server('localhost', 8080, simple_app)
    server.serve_forever()
```


限于篇幅，这个服务器模型省略了很多细节，如果你想要一个简单又能运行的WSGI服务器，可以参考这里[Let's Build A Web Server.Part 2](https://ruslanspivak.com/lsbaws-part2/).。

服务器在接收到请求后，对请求报文的信息进行解析，结果保存在一个名为environ的字典中。随后以environ与处理头信息的start_response函数作为参数，调用应用程序 application(environ, start_response) 。最后将应用的结果组成新的响应，发送回客户端。

在应用程序方面，WSGI应用是一个可调用的对象。它可以是一个函数，方法，类，或者是一个带有__call__方法的实例。上面的应用就是一个函数。

当各种服务器和应用程序/框架都按照WSGI的标准进行开发时，我们可以根据需求自由地组合不同的服务器和框架。

# Bottle最简应用
在简单了解完WSGI后，我们回到Bottle，来观察一个Bottle应用是什么样子的，如何运行，跟我们的模型有什么区别。

```python
from bottle import Bottle, run

app = Bottle()

@app.route('/hello')
def hello():
    return 'Hello World!'

run(app, host='localhost', port=8080, server='wsgiref')
```

现在运行这个程序，用浏览器访问地址'localhost:8080/hello'就会看到'Hello World!'。

1. 与上面的应用不同，Bottle应用是一个实例。按照WSGI规定，Bottle对象要实现__call__方法：

```python
def __call__(self, environ, start_response):
    ''' Each instance of :class:'Bottle' is a WSGI application. '''
    return self.wsgi(environ, start_response)
```

所以这个Bottle.wsgi方法就是服务器调用Bottle应用的入口，同时也是我们阅读源码的入口。

2. @app.route()这个装饰器将一个函数绑定到一个URL上。当我们访问'localhost:8080/hello'时，hello函数就会被调用。

3. Bottle默认的服务器是wsgiref（Python标准库里的一个WSGI简单实现）。当然Bottle还为许多服务器编写了适配器（Adapter），只需要改变server的值，run()函数会根据服务器的名字寻找相应的适配器。无需编写额外的代码。

run函数和适配器部分代码：

```python
def run(app=None, server='wsgiref', host='127.0.0.1', port=8080,
        interval=1, reloader=False, quiet=False, plugins=None,
        debug=None, **kargs):
    if server in server_names:
        server = server_names.get(server)
    if isinstance(server, basestring):
        server = load(server)
    if isinstance(server, type):
        server = server(host=host, port=port, **kargs)
    if not isinstance(server, ServerAdapter):
        raise ValueError("Unknown or unsupported server: %r" % server)
    ...
    server.run(app)

class MeinheldServer(ServerAdapter):
    def run(self, handler):
        from meinheld import server
        server.listen((self.host, self.port))
        server.run(handler)
```

# 最后

在本文中，我们简单介绍了在WSGI标准下服务器和应用如何进行交互。下一篇，我们继续围绕这个最简应用，讲讲与@app.route()有关的路由功能。
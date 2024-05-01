+++
title = "Bottle源码阅读笔记（二）：路由"
description = ""
tags = ["Python","Bottle"]
categories = ["Web"]
series = ["Bottle源码阅读笔记"]
date = 2017-06-14
+++

程序收到请求后，会根据URL来寻找相应的视图函数，随后由其生成页面发送回给客户端。其中，不同的URL对应着不同的视图函数，这就存在一个映射关系。而处理这个映射关系的功能就叫做路由。路由的实现分为两部分：

1. 生成URL映射关系
2. 根据请求匹配正确的视图函数
本文将围绕这两个部分进行分析。

<!--more-->

---

# 生成URL映射关系
在Bottle的示例程序中，我们使用@app.route修饰器来将地址'/hello'映射到视图函数hello：

```python
@app.route('/hello')
def hello():
    return 'Hello World!'
```

下面以'/hello'为例子来分析app.route的代码。

```python
def route(self, path=None, method='GET', callback=None, name=None,
          apply=None, skip=None, **config):
    """
        :param callback: An optional shortcut to avoid the decorator
          syntax. ``route(..., callback=func)`` equals ``route(...)(func)``
    """
    if callable(path): path, callback = None, path
    plugins = makelist(apply)
    skiplist = makelist(skip)
    def decorator(callback):
        if isinstance(callback, basestring): callback = load(callback)
        for rule in makelist(path) or yieldroutes(callback):
            for verb in makelist(method):
                verb = verb.upper()
                route = Route(self, rule, verb, callback, name=name,
                              plugins=plugins, skiplist=skiplist, **config)
                self.add_route(route)
        return callback
    return decorator(callback) if callback else decorator
```

注意注释和最后一行代码，这种形式的return意味着我们还可以使用app.route('/hello', callback=hello)来实现相同的功能。

route方法将我们定下的路由规则（'/hello')和与之相关的HTTP方法(默认为GET)、使用的插件等参数组合成一个Route路由对象，然后通过Router.add()将这个路由添加到处理映射关系的Router对象中。
Router.add()部分代码：

1 def add(self, rule, method, target, name=None):
2     # do some something
3     if is_static and not self.strict_order:
4         self.static.setdefault(method, {})
5         self.static[method][self.build(rule)] = (target, None)
6         retun
7     # dynamic path parse
在Router对象中，它维护着两个字典：static和dyna_route，分别用来存储静态路由和动态路由（动态路由的映射与静态相似，这里按下不表）。以我们的示例程序为例：

static = {
    'GET': {
        '/hello': hello,
    }
}
可以看出，Bottle最终是用一个字典来保存这个映射关系的，而且还添加了对HTTP方法的支持。所以在Bottle文档中看到可以用多个路由装饰器装饰同一个视图函数，也就不足为奇了。

```python
@app.route('/', method='POST')
@app.route('/', method='GET')
@app.route('/hello', method='GET')
def func():
    pass

static = {
    'GET': {
        '/': func,
        '/hello': func,
    }
    'POST': {
        '/': func,
    }
}
```

现在映射关系生成了，那么程序在处理请求的时候，它的内部是如何实现匹配的呢？

 

# 匹配视图函数
这里提个小插曲，之前在我阅读到这部分的时候，我还没有搞清楚WSGI是什么，所以我在分析这一步时并没有从Bottle.__call__开始，而是直接Ctrl+f寻找static来确定这个字典在哪里被调用了。虽然是个笨方法，但好歹找到了答案。:D
在Router.match中，可以找到关于static的调用。match()先是从envrion变量中取出请求的URL和请求方法，然后直接从static中取值。

```python
def match(self, environ):
    ''' Return a (target, url_agrs) tuple or raise HTTPError(400/404/405). '''
    verb = environ['REQUEST_METHOD'].upper()
    path = environ['PATH_INFO'] or '/'
    target = None
    if verb == 'HEAD':
        methods = ['PROXY', verb, 'GET', 'ANY']
    else:
        methods = ['PROXY', verb, 'ANY']

    for method in methods:
        if method in self.static and path in self.static[method]:
            target, getargs = self.static[method][path]
            return target, getargs(path) if getargs else {}
        elif method in self.dyna_regexes:
            for combined, rules in self.dyna_regexes[method]:
                match = combined(path)
                if match:
                    target, getargs = rules[match.lastindex - 1]
                    return target, getargs(path) if getargs else {}
```

接着我不断在用类似的方法寻找上级调用，最终画出了一个这样的函数调用关系链。

![callback.png](/img/4/callback.jpg)

以上内容很好地验证了我们上一篇所说的：请求的信息都存储在envrion中，以及Bottle.__call__是我们阅读源程序的入口。

在处理输出的Bottle._handle()中，找到对应的路由后，直接调用路由的call方法，也就是我们的视图函数hello。

```python
def _handle(self, envrion):
    route, args = self.router.match(environ)
    return route.call(**args)
```

# 错误页面
如果程序出错了，Bottl会显示一个默认的错误页面，例如我们熟悉的404页面。

在Bottle内部，对于错误页面的处理跟普通的页面差不多。在Bottle维护着一个专门处理错误页面映射关系的error_handler字典，不过它的键不是HTTP方法或者URL，而是HTTP错误状态码。
类似地，Bottle有专门的@error装饰器让我们自定义错误页面。

```python
def error(self, code=500)
    def wrapper(handler):
        self.error_handler[int(code)] = handler
        return handler
    return wrapper
```

当程序因找不到合适的视图函数，或者其他内部错误，Bottle._handle()会抛出一个HTTPError，然后在Bottle._cast()中会根据错误状态码在error_handler找到对应的错误处理函数，最后将这个结果当作普通页面来处理

```python
Bottle.wsgi()
    out = self._cast(self._handle(environ))
Bottle._cast()
    if isinstance(out, HTTPError):
        out = self.error_handler.get(out.status_code, self.default_error_handler)(out)
    return self._cast(out)
```

# 最后
Bottle用字典来保存URL映射关系来实现路由和错误页面。现在按照相同的思路，我们来为最简单的WSGI应用添加路由功能和一个简单的错误页面。

```python
class WSGIApp(object):

    def __init__(self):
        self.routes = {}

    def route(self, path, method='GET'):
        def wrapper(callback):
            self.routes.setdefault(method, {})
            self.routes[method][path] = callback
            return callback
        return wrapper

    def error_handler(self, envrion, start_response):
        out = [b'Somethind Wrong!']
        status = '404 NotFound'
        response_headers = [("content-type", "text/plain")]
        start_response(status, response_headers)
        return out

    def __call__(self, envrion, start_response):
        path = envrion['PATH_INFO']
        method = envrion['REQUEST_METHOD'].upper()
        if method in self.routes and path in self.routes[method]:
            handler = self.routes[method][path]
        else:
            handler = self.error_handler
        return handler(envrion, start_response)


app = WSGIApp()

@app.route('/')
def simple_app(envrion, start_response):
    out = [b'Hello World!']
    status = '200 OK'
    response_headers = [("content-type", "text/plain")]
    start_response(status, response_headers)
    return out


if __name__ == '__main__':
    from wsgiref.simple_server import make_server
    with make_server('', 8000, app) as httpd:
        print("Server is Running...")
        httpd.serve_forever()
```

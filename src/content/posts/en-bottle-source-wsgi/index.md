---
author: RainFD
title: "Bottle Source Code Reading Notes (Part 1): WSGI"
pubDatetime: 2017-06-05T00:00:00+08:00
draft: false
locale: en
translationKey: bottle-source-wsgi
description: "A deep dive into the WSGI protocol by reading Bottle's source code — how it works, how requests are processed, and how Python web frameworks interact with web servers through the WSGI interface."
tags:
  - Python
  - Bottle
  - WSGI
---

Bottle is a Python web framework. The entire framework lives in a single file, under 4k lines of code, with no dependencies outside the Python standard library — yet it includes routing, templates, plugins, and all the features you'd expect from a web framework. It's the perfect candidate for learning what a web framework is and how it works. Since Bottle is a WSGI-compatible framework, let's first understand WSGI before diving into the source code.

<!--more-->

Note: The Bottle version used in this article is 0.12.13.

# WSGI

Regular web servers can only serve static pages. When dynamic content is involved, the server needs to communicate with languages like Java, Python, or Ruby to hand off the processing. Since most web servers are written in C, they can't directly execute these languages — so you need a bridge between them (in practice, an application server is usually placed between the web server and WSGI application to support WSGI). In Python, WSGI is that bridge. WSGI has two sides: the server and the application. Let's see what each looks like and how they work together.

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

For brevity, this server model skips a lot of details. If you want a simple but actually runnable WSGI server, check out [Let's Build A Web Server. Part 2](https://ruslanspivak.com/lsbaws-part2/).

After receiving a request, the server parses the request information and stores the results in a dictionary called `environ`. It then calls the application with `environ` and the `start_response` function (which handles response headers) as arguments: `application(environ, start_response)`. Finally, it wraps the application's result into a new response and sends it back to the client.

On the application side, a WSGI application is a callable object. It can be a function, method, class, or an instance with a `__call__` method. The application above is a function.

When servers and applications/frameworks all follow the WSGI standard, you can freely mix and match different servers and frameworks.

# A Minimal Bottle Application

Now that we understand the basics of WSGI, let's return to Bottle and see what a Bottle application looks like, how it runs, and how it differs from our model.

```python
from bottle import Bottle, run

app = Bottle()

@app.route('/hello')
def hello():
    return 'Hello World!'

run(app, host='localhost', port=8080, server='wsgiref')
```

Run this program, open your browser at `localhost:8080/hello`, and you'll see "Hello World!".

1. Unlike the example above, a Bottle application is an instance. Per the WSGI spec, the `Bottle` class must implement `__call__`:

```python
def __call__(self, environ, start_response):
    ''' Each instance of :class:'Bottle' is a WSGI application. '''
    return self.wsgi(environ, start_response)
```

So `Bottle.wsgi` is the entry point the server uses to call the Bottle application — and our entry point for reading the source code.

2. The `@app.route()` decorator binds a function to a URL. When you visit `localhost:8080/hello`, the `hello` function gets called.

3. Bottle's default server is `wsgiref` (a simple WSGI implementation from Python's standard library). Bottle also includes adapters for many other servers — just change the `server` value and `run()` will look up the appropriate adapter. No extra code required.

The `run` function and adapter code:

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

# Wrapping Up

In this article, we covered the basics of how servers and applications interact under the WSGI standard. In the next post, we'll build on this minimal application and explore the routing functionality behind `@app.route()`.

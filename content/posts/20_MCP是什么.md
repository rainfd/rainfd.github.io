---
title: "MCP是什么？"
date: 2025-04-18
tags:
- MCP
- LLM
categories:
typora-root-url: ../../static/
mermaid: true
---

最近在LLM Agent开发里面有个新的概念很火，叫MCP，是[Model Context Protocol](https://modelcontextprotocol.io/introduction)的缩写，意思是模型上下文协议。看了一下官方的解释，就是一个类似USB-C的协议，能让各种数据源、工具按照MCP的标准来连接LLM应用。就是想着统一了规范，LLM应用接入新功能就容易很多了。

<!--more-->

## MCP架构

MCP的架构设计就是简单的CS模型，各种功能封装在MCP Server下，Host对应的LLM应用，Host内部使用MCP Client与MCP Server进行交互。

![mcp-arch](/img/20/mcp-arch.png?) 

## 协议内容

快速看下大概内容

- 传输方式：

  - 本地使用标准输入输出

  - HTTP
  - 内容格式都为JSON-RPC 2.0规范

- 消息类型

  - Request
  - Result
  - Errors
  - Notification 单向消息提示，不用响应

- Server提供的功能

  - Resources 文件内容、数据库查询等 
  - Prompts 
  - Tools 本地命令行工具、第三方API调用等

可以看到协议的核心是很简单的，很容易实现。主要是看Server提供的功能，给一个Python SDK实现的例子。

```
import sqlite3

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Explorer")

@mcp.resource("schema://main")
def get_schema() -> str:
    """Provide the database schema as a resource"""
    conn = sqlite3.connect("database.db")
    schema = conn.execute("SELECT sql FROM sqlite_master WHERE type='table'").fetchall()
    return "\n".join(sql[0] for sql in schema if sql[0])
    
@mcp.tool()
def echo_tool(message: str) -> str:
    """Echo a message as a tool"""
    return f"Tool echo: {message}"

@mcp.prompt()
def echo_prompt(message: str) -> str:
    """Create an echo prompt"""
    return f"Please process this message: {message}"
```

Resource通过`[protocol]://[host]/[path]`的URI来描述任意的资源，对上层应用来说，相比直接访问文件或者数据库，更直观了。

## 为什么需要MCP？

到这里你就大致了解MCP是什么东西了。那么问题来了，为什么需要MCP？

先来思考下，没有MCP，LLM应用是怎么开发的？假设使用LangChain开发，需要规划整个调用Workflow，接入向量数据库，接入各种各样的工具、第三方服务。在有了MCP之后，这些接入的数据库、服务和工具都可以使用MCP统一规范起来。在使用其他框架、或者其他语言开发其他的LLM应用时，可以直接接入MCP Server。

有人会问，LangChain本来就适配了很多第三方服务，而且用了LangChain后也不会随意换框架，新的应用不还是复用旧代码，改成MCP不是脱裤子放屁？

如果你是一个普通的应用开发者，这么说也没错，MCP这里没有解决任何关键问题，也没有新增什么特殊功能，LLM应用原来能做的，换了MCP照样还是怎么做。我看到一篇文章[Notes on MCP](https://taoofmac.com/space/notes/2025/03/22/1900)也是这么看的。而且MCP Server还需要额外开启一个Server，增加了维护成本。

## MCP 生态

MCP刚火了几个月，协议内容也在不断更新。目前我还没有觉得有什么突出的作用和看到一些革命性的应用，但我们可以观察目前市场上面MCP的生态怎么发展，有什么具体的应用。

**MCP社区**

[mcpflow](https://mcpflow.io/) 类似的社区应用还有很多，就像MCP版本的API应用市场。

**自动化工具**

![zapier](/img/20/zapier.png)

[zapier](https://zapier.com/app/home) 将常见的应用通过自动话工具串联起来，加入LLM和MCP支持更多服务后，可能会丰富部分场景。

**插件**

Cursor、Windsurf、IDEA等编辑器都有MCP的支持，可以想象以后很多插件都能通过MCP来实现，这样就可以轻松支持所有编辑器。例如做一个根据提交代码生成commit message的插件，只要规定MCP的输入是这次提交的代码，那么这个插件的大部分功能都脱离了编辑器的实现。

除了上面几个场景，我自己想到的还有：第三方API的应用需要实现MCP Server，这样让用户的LLM应用能快速接入。

# 总结

非常草率地说下结论，如果你没有大量LLM异构的应用需要开发，也没有需要提供API类的服务，那么在日常开发基本可以无视MCP。

不过这个协议发展得太快了，还是拉一下期待值，最少可以想象一下未来Cursor类似的编辑支持了大量实用的MCP后，能不能再进一步智能化我们的工作流。

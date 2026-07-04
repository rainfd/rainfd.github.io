---
author: RainFD
title: "Setting Up Python: Environment and Project Scaffolding"
locale: en
translationKey: python-project-setup
pubDatetime: 2020-06-15T00:00:00+08:00
draft: false
description: "From pyenv version management to Poetry dependency management to Makefile automation — a complete walkthrough of Python project setup on macOS/Linux, with an example project repo."
tags:
  - Python
---

I've been writing Python bare on remote servers for a while and haven't touched it on my Mac in ages. Recently I had a task that needed Python, so I took the opportunity to properly sort out the Python environment setup and project scaffolding issues I've encountered.

<!--more-->

---

Example project: <https://github.com/rainfd/python-example-project>

## ENVIRONMENT

### Installing Python

```bash
brew install python
```

This installs both Python 2 and 3. Although Python 2 officially reached end-of-life this year, many systems still running in production default to Python 2. CentOS 7.6, for instance, only started defaulting to Python 3. So for the next few years, Python 2 is still unavoidable.

### IDE

Python isn't my primary language, so buying PyCharm doesn't make much sense. Among the other common IDEs (VSCode, Sublime Text 3, Atom), I went with VSCode. Main reason: I also do Golang development in VSCode. Setting up Python-related config barely requires any tinkering.

#### Installing the Python Plugin

Search for the official Python plugin in the marketplace and install it directly.

### [pipenv](https://pipenv.pypa.io/)

```bash
brew install pipenv
```

Compared to pyenv, I personally find pipenv easier to install and use, plus it has thorough documentation.

#### Creating a Virtual Environment

```bash
$ cd python-example-project
$ pipenv --three

$ pipenv shell
(python-example-project) $ pipenv install package

(python-example-project) $ pipenv --venv
/Users/rainfd/.local/share/virtualenvs/python-example-project-9IUo4aoR
```

#### Configuring the Virtual Environment in VSCode

Press `⇧⌘P/F1`, type `select interpreter`, and choose the venv path listed above.
Or add this to your workspace settings:

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

Python files typically start with a shebang and author/comment notes. Use VSCode's built-in Snippets for this. Go to Preferences > User Snippets, enter `python.json`, and add:

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

There are many unit test frameworks for Python, but the standard library ships with a solid one — unittest. No need to pull in extra dependencies.

#### Configuring unittest in VSCode

```json
{
  "python.testing.unittestArgs": ["-v", "-s", ".", "-p", "*_test.py"],
  "python.testing.pytestEnabled": false,
  "python.testing.nosetestsEnabled": false,
  "python.testing.unittestEnabled": true
}
```

##### Mock

When using unittest, `unittest.mock` is indispensable. Compared to mock support in other languages, I find Python's mock to be the easiest to use.
Note: `unittest.mock` was added to the standard library in Python 3.3. If you're using Python 2, you'll need to install it separately: `pipenv install mock`

### Log

For global logging, you can reference this gist: `https://gist.github.com/kingspp/9451566a5555fb022215ca2b7b802f19`
Configure each module's log format and level via YAML.

In each module, just import the logger and you're good to go:

```python
logger = logging.getLogger(__name__)
logger.info("msg")
```

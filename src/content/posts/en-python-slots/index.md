---
author: RainFD
title: "Python __slots__ in Depth"
pubDatetime: 2017-04-07T00:00:00+08:00
draft: false
locale: en
translationKey: python-slots
description: "A deep dive into Python __slots__ — implementation details, performance gains, memory savings, and practical considerations."
tags:
  - Python
---

When a class needs to create a large number of instances, you can use `__slots__` to declare the attributes those instances require.

For example, `class Foo(object): __slots__ = ['foo']`. This brings two key benefits:

1. Faster attribute access
2. Reduced memory consumption

<!--more-->

------

*The following tests were run on Ubuntu 16.04, Python 2.7*

# How Slots Are Implemented

Let's first look at how to implement `__slots__` in pure Python (to differentiate from the built-in version, I'll use single-underscore `_slots_` in the code below):

```python
class Member(object):
    # A descriptor that handles slot attribute lookups
    def __init__(self, i):
        self.i = i
    def __get__(self, obj, type=None):
        return obj._slotvalues[self.i]
    def __set__(self, obj, value):
        obj._slotvalues[self.i] = value

class Type(type):
    # A metaclass that implements slots
    def __new__(self, name, bases,  namespace):
        slots = namespace.get('_slots_')
        if slots:
            for i, slot in enumerate(slots):
                namespace[slot] = Member(i)
            original_init = namespace.get('__init__')
            def __init__(self, *args, **kwargs):
                # Create the _slotvalues list and call the original __init__
                self._slotvalues = [None] * len(slots)
                if original_init(self, *args, **kwargs):
                    original_init(self, *args, **kwargs)
            namespace['__init__'] = __init__
        return type.__new__(self, name, bases, namespace)

# Python 2 vs Python 3 metaclass syntax
try:
    class Object(object): __metaclass__ = Type
except:
    class Object(metaclass=Type): pass

class A(Object):
    _slots_ = 'x', 'y'

a = A()
a.x = 10
print(a.x)
```

In CPython, when a class A defines `__slots__ = ('x', 'y')`, `A.x` becomes a `member_descriptor` with `__get__` and `__set__` methods, and each instance can access it through direct memory access. (The implementation uses offset addresses to track descriptors — the actual memory address is calculated via a formula. [Accessing `__dict__` works the same way](https://docs.python.org/2/c-api/typeobj.html#c.PyTypeObject.tp_dictoffset), meaning `A.__dict__` and `A.x` descriptor access are similarly fast.)

In the example above, we've implemented an equivalent of slots in pure Python. When the metaclass sees `_slots_` defining x and y, it creates two class variables: `x = Member(0)` and `y = Member(1)`. It then wraps the `__init__` method so new instances create a `_slotvalues` list.

The differences between this implementation and CPython's are:

- In our example, `_slotvalues` is a list stored outside the instance object, whereas in CPython it's stored alongside the instance object, accessible through direct memory access. Correspondingly, the `member descriptor` isn't stored in an external list either — it's accessed the same way.

- By default, `__new__` creates a `__dict__` dictionary for each instance to store attributes. But when `__slots__` is defined, `__new__` skips creating this dictionary.

- Since there's no `__dict__` to hold new attributes, using an attribute not listed in `__slots__` raises an error.

```python
>>> class A(object): __slots__ = ('x')
>>> a = A()
>>> a.y = 1
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
Attribute: 'A' object has no attribute 'y'
```
*You can leverage this behavior to restrict an instance's attributes.*

------

# Faster Attribute Access

By default, accessing an instance attribute goes through the instance's `__dict__`. Accessing `a.x` is equivalent to accessing `a.__dict__['x']`. To simplify, I'll break it down into four steps:

1. `a.x`  2. `a.__dict__`  3. `a.__dict__['x']`  4. result

From the slots implementation, we know that classes with `__slots__` create a descriptor for each attribute. Attribute access calls this descriptor directly. Here I'll break it into three steps:

1. `b.x`  2. `member descriptor`  3. result

As mentioned, accessing `__dict__` and descriptors are similarly fast, but `__dict__`-based attribute access adds the extra step of `a.__dict__['x']` (a hash function overhead). This suggests that classes using `__slots__` should have faster attribute access. Let's verify:

```python
from timeit import repeat

class A(object): pass

class B(object): __slots__ = ('x')

def get_set_del_fn(obj):
	def get_set_del():
		obj.x = 1
		obj.x
		del obj.x
	return get_set_del

a = A()
b = B()
ta = min(repeat(get_set_del_fn(a)))
tb = min(repeat(get_set_del_fn(b)))
print("%.2f%%" % ((ta/tb - 1)*100))
```

On my machine, the speed improvement is around 0-20%.

------

# Reduced Memory Consumption

Python's built-in dict is essentially a hash table — a space-for-time data structure. To handle collisions, Python expands the dict by 2-4x whenever usage exceeds 2/3. This means eliminating `__dict__` can significantly reduce per-instance memory usage.

Below, I use the `pympler` module to test per-instance memory consumption with different numbers of attributes, with and without `__slots__`:

```python
from string import ascii_letters
from pympler.asizeof import asizesof

def slots_memory(num=0):
    attrs = list(ascii_letters[:num])
    class Unslotted(object): pass
    class Slotted(object): __slots__ = attrs
    unslotted = Unslotted()
    slotted = Slotter()
    for attr in attrs:
        unslotted.__dict__[attr] = 0
        exec('slotted.%s = 0' % attr, globals(), locals())
    memory_use = asizesof(slotted, unslotted, unslotted.__dict__)
    return memory_use

def slots_test(nums):
    return [slots_memory(num) for num in nums]
```

Test results (in bytes):

| Attribute count | slotted | unslotted (`__dict__`) |
| --------------- | ------- | ---------------------- |
| 0               | 80      | 334 (280)              |
| 1               | 152     | 408 (344)              |
| 2               | 168     | 448 (384)              |
| 8               | 264     | 1456 (1392)            |
| 16              | 392     | 1776 (1712)            |
| 25              | 536     | 4440 (4376)            |

As you can see, `__slots__` dramatically reduces memory consumption — this is its most common use case.

------

# Usage Notes

## 1. Only non-string iterables can be assigned to `__slots__`
```python
>>> class A(object): __slots__ = ('a', 'b', 'c')
>>> class B(object): __slots__ = 'abcd'
>>> B.__slots__
'abc'
```
Assigning a string directly results in only one attribute.

## 2. Slots and inheritance

In general, classes using slots should directly inherit from `object`, e.g., `class Foo(object): __slots__ = ()`.

When inheriting custom classes, I categorize the behavior into six scenarios based on whether parent and child classes define `__slots__`:

1.  Parent has slots, child doesn't:
    The child's instances will still automatically create `__dict__` for storing attributes, but the parent's `__slots__` attributes remain unaffected.
```python
>>> class Father(object): __slots__ = ('x')
>>> class Son(Base): pass
>>> son = Son()
>>> son.x, son.y = 1, 1
>>> son.__dict__
>>> {'y': 1}
```
2.  Parent doesn't have slots, child does:
    Although the child disables `__dict__`, inheriting from the parent causes it to be generated anyway. As above, `__slots__` attributes are unaffected.
```python
>>> class Father(object): pass
>>> class Son(Father): __slots__ = ('x')
>>> son = Son()
>>> son.x, son.y = 1, 1
>>> son.__dict__
>>> {'y': 1}
```
3.  Both have slots:
    Only the child's `__slots__` takes effect. Accessing a parent-slot attribute that the child doesn't include still raises an error.
```python
>>> class Father(object): __slots__ = ('x', 'y')
>>> class Son(Father): __slots__ = ('x', 'z')
>>> son = Son()
>>> son.x, son.y, son.z = 1, 1, 1
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
AttributeError: 'Son' object has no attribute 'y'
```
4.  Multiple parents with non-empty slots:
    Because `__slots__` isn't implemented as a simple list or dict, multiple parents' non-empty `__slots__` can't be merged directly — this raises an error at class definition time (even if the parents' slots are identical).
```python
>>> class Father(object): __slots__ = ('x')
>>> class Mother(object): __slots__ = ('x')
>>> class Son(Father, Mother): pass
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: Error when calling the metaclass bases
    multiple bases have instance lay-out conflict
```
5.  Multiple parents with empty slots:
    This is the only workable scenario for multiple inheritance with slots.

6.  Some parents have slots, some don't:
    Similar to case 1.

  **Summary**: To use `__slots__` correctly, it's best to inherit directly from `object`. If you need other parent classes, both the parent and child should define slots, and remember that the child's slots will override the parent's.
            Unless all parent slots are empty, avoid multiple inheritance.

## 3. Adding `__dict__` for dynamic features

In special cases, you can add `__dict__` to `__slots__` to regain the same dynamic behavior as a regular instance.

```python
>>> class A(object): __slots__ = ()
>>> class B(A): __slots__ = ('__dict__', 'x')
>>> b = B()
>>> b.x, b.y = 1, 1
>>> b.__dict__
{'y': 1}
```

## 4. Adding `__weakref__` for weak reference support

The `__slots__` implementation not only disables `__dict__` creation but also prevents `__weakref__` creation. Similarly, adding it to `__slots__` restores weak reference functionality.

## 5. You can't set default values through class attributes

Once `__slots__` is defined, all class attributes become descriptors. Assigning to a class attribute would overwrite the descriptor.

## 6. namedtuple

Combine the immutability of `namedtuple` with slots to create a lightweight, immutable instance (roughly the size of a tuple).

```python
>>> from collections import namedtuple
>>> class MyNt(namedtupele('MyNt', 'bar baz')): __slots__ = ()
>>> nt = MyNt('r', 'z')
>>> nt.bar
'r'
>>> nt.baz
'z'
```

# Summary

When a class needs to create many instances, use `__slots__` to reduce memory consumption. If you have speed requirements for attribute access, it's worth considering too. You can also leverage slots to restrict instance attributes. For ordinary classes, however, using `__slots__` means losing dynamic attribute addition and weak reference support, which can lead to other errors — so don't use it casually.

**References**:

[Usage of slots?](http://stackoverflow.com/questions/472000/usage-of-slots)

[How slots are implemented](http://code.activestate.com/recipes/532903-how-__slots__-are-implemented/)

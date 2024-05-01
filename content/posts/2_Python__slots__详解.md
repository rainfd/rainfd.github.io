+++
title = "Python \"__slots__\" 详解"
description = ""
tags = ["Python"]
categories = ["Programming Language"]
date = 2017-04-07
+++

当一个类需要创建大量实例时，可以通过`__slots__`声明实例所需要的属性，

例如，`class Foo(object): __slots__ = ['foo']`。这样做带来以下优点：

1. 更快的属性访问速度
2. 减少内存消耗

<!--more-->

------

*以下测试环境为Ubuntu16.04 Python2.7*

# Slots的实现

我们首先来看看用纯Python是如何实现`__slots__`（为了将以下实现的slots与原slots区分开来，代码中用单下划线的`_slots_`来代替)

```python
class Member(object):
    # 定义描述器实现slots属性的查找
    def __init__(self, i):
        self.i = i
    def __get__(self, obj, type=None):
        return obj._slotvalues[self.i]
    def __set__(self, obj, value):
        obj._slotvalues[self.i] = value
        
class Type(type):
    # 使用元类实现slots
    def __new__(self, name, bases,  namespace):
        slots = namespace.get('_slots_')
        if slots:
            for i, slot in enumerate(slots):
                namespace[slot] = Member(i)
            original_init = namespace.get('__init__')
            def __init__(self, *args, **kwargs):
                # 创建_slotvalues列表和调用原来的__init__
                self._slotvalues = [None] * len(slots)
                if original_init(self, *args, **kwargs):
                    original_init(self, *args, **kwargs)
            namespace['__init__'] = __init__
        return type.__new__(self, name, bases, namespace)
    
# Python2与Python3使用元类的区别    
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

在CPython中，当一个A类定义了`__slots__ = ('x', 'y')`，`A.x`就是一个有`__get__`和`__set__`方法的`member_descriptor`，并且在每个实例中可以通过直接访问内存（direct memory access）获得。（具体实现是用偏移地址来记录描述器，通过公式可以直接计算出其在内存中的实际地址 ，[访问`__dict__`也是用相同的方法](https://docs.python.org/2/c-api/typeobj.html#c.PyTypeObject.tp_dictoffset)，也就是说访问`A.__dict__`和`A.x`描述器的速度是相近的）

在上面的例子中，我们用纯Python实现了一个等价的slots。当一个元类看到`_slots_`定义了x和y，它会创建两个的类变量，`x = Member(0)`和`y = Member(1)`。然后，装饰`__init__`方法让新的实例创建一个`_slotvalues`列表。

例子中的实现和CPython不同的是：

- 例子中`_slotvalues`是一个存储在类对象外部的列表，而在CPython中它与实例对象存储在一起，可以通过直接访问内存获得。相应地，`member decriptor`也不是存在外部列表中，而同样可以通过直接访问内存获得。

- 默认情况下，`__new__`方法会为每个实例创建一个字典`__dict__`来存储实例的属性。但如果定义了`__slots__`，`__new__`方法就不会再创建这个字典。

- 由于不存在`__dict__`来存储新的属性，所以使用一个不在`__slots__`中的属性时，程序会报错。

```python
>>> class A(object): __slots__ = ('x')
>>> a = A()
>>> a.y = 1
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
Attribute: 'A' object has no attribute 'y'
```
*可以利用这种特性来限制实例的属性。*


------

# 更快的属性访问速度

默认情况下，访问一个实例的属性是通过访问该实例的`__dict__`来实现的。如访问`a.x`就相当于访问`a.__dict__['x']`。为了便于理解，我粗略地将它拆分为四步：

1. `a.x`  2. `a.__dict__`  3. `a.__dict__['x']`  4. 结果

从`__slots__`的实现可以得知，定义了`__slots__`的类会为每个属性创建一个描述器。访问属性时就直接调用这个描述器。在这里我将它拆分为三步：

1. `b.x`  2. `member decriptor`  3. 结果

我在上文提到，访问`__dict__`和描述器的速度是相近的，而通过`__dict__`访问属性多了`a.__dict__['x']`字典访值一步（一个哈希函数的消耗）。由此可以推断出，使用了`__slots__`的类的属性访问速度比没有使用的要快。下面用一个例子验证：

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

在本人电脑上测试速度有0-20%左右的提升。

------

# 减少内存消耗

Python内置的字典本质是一个哈希表，它是一种用空间换时间的数据结构。为了解决冲突的问题，当字典使用量超过2/3时，Python会根据情况进行2-4倍的扩容。由此可预见，取消`__dict__`的使用可以大幅减少实例的空间消耗。

下面用`pympler`模块测试在不同属性数目下，使用`__slots__`前后单个实例占用内存大小：

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

测试结果:（单位：字节）

| 属性数量 | slotted | unslotted(`__dict__`) |
| -------- | ------- | --------------------- |
| 0        | 80      | 334(280)              |
| 1        | 152     | 408(344)              |
| 2        | 168     | 448(384)              |
| 8        | 264     | 1456(1392)            |
| 16       | 392     | 1776(1712)            |
| 25       | 536     | 4440(4376)            |

从上述结果可看到使用`__slots__`能极大地减少内存空间的消耗，这也是最常见到的用法。

------

# 使用笔记

## 1. 只有非字符串的迭代器可以赋值给`__slots__`
```python
>>> class A(object): __slots__ = ('a', 'b', 'c')
>>> class B(object): __slots__ = 'abcd'
>>> B.__slots__
'abc'
```
若直接将字符串赋值给它，就只有一个属性。

## 2. 关于slots的继承问题

在一般情况下，使用slots的类需要直接继承`object`，如`class Foo(object): __slots__ = ()`

在继承自己创建的类时，我根据子类父类是否定义了`__slots__`，将它细分为六种情况:

1.    父类有，子类没有：
    子类的实例还是会自动创建`__dict__`来存储属性，不过父类`__slots__`已有的属性不受影响。
```python
>>> class Father(object): __slots__ = ('x')
>>> class Son(Base): pass
>>> son = Son()
>>> son.x, son.y = 1, 1
>>> son.__dict__
>>> {'y': 1}
```
2.    父类没有，子类有：
    虽然子类取消了`__dict__`，但继承父类后它会继续生成。同上面一样，`__slots__`已有的属性不受影响。
```python
>>> class Father(object): pass
>>> class Son(Father): __slots__ = ('x')
>>> son = Son()
>>> son.x, son.y = 1, 1
>>> son.__dict__
>>> {'y': 1}
```
3.    父类有，子类有：
    只有子类的`__slots__`有效，访问父类有子类没有的属性依然会报错。
```python
>>> class Father(object): __slots__ = ('x', 'y')
>>> class Son(Father): __slots__ = ('x', 'z')
>>> son = Son()
>>> son.x, son.y, son.z = 1, 1, 1
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
AttributeError: 'Son' object has no attribute 'y'
```
4.    多个拥有非空slots的父类：
    由于`__slots__`的实现不是简单的列表或字典，多个父类的非空`__slots__`不能直接合并，所以使用时会报错（即使多个父类的非空`__slots__`是相同的）。
```python
>>> class Father(object): __slots__ = ('x')
>>> class Mother(object): __slots__ = ('x')
>>> class Son(Father, Mother): pass
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: Error when calling the metaclass bases
    multiple bases have instance lay-out conflict
```
5.    多个空slots的父类：
    这是关于slots使用多继承唯一办法。

6.    某些父类有，某些父类没有：
    跟第一种情况类似。

  **小结**：为了正确使用`__slots__`，最好直接继承`object`。如有需要用到其他父类，则父类和子类都要定义slots，还要记得子类的slots会覆盖父类的slots。
            除非所有父类的slots都为空，否则不要使用多继承。

##  3. 添加`__dict__`获取动态特性

在特殊情况下，可以在`__slots__`里添加`__dict__`来获取与普通实例同样的动态特性。

```python
>>> class A(object): __slots__ = ()
>>> class B(A): __slots__ = ('__dict__', 'x')
>>> b = B()
>>> b.x, b.y = 1, 1
>>> b.__dict__
{'y': 1}
```

## 4. 添加`__weakref__`获取弱引用功能

`__slots__`的实现不仅取消了`__dict__`的生成，也取消了`__weakref__`的生成。同样的，在`__slots__`将其添加可以重新获取弱引用这一功能。

## 5. 不能通过类属性给实例设定默认值

定义了`__slots__`后，这个类的类属性都变为了描述器。如果给类属性赋值，就会把描述器给覆盖了。

## 6. namedtuple

利用内置的namedtuple不可变的特性，结合slots，能创建出一个轻量不可变的实例。(约等于一个元组的大小)

```python
>>> from collections import namedtuple
>>> class MyNt(namedtupele('MyNt', 'bar baz')): __slots__ = ()
>>> nt = MyNt('r', 'z')
>>> nt.bar
'r'
>>> nt.baz
'z'
```



# 总结

当一个类需要创建大量实例时，可以使用`__slots__`来减少内存消耗。如果对访问属性的速度有要求，也可以酌情使用。另外可以利用slots的特性来限制实例的属性。而用在普通类身上时，使用`__slots__`后会丧失动态添加属性和弱引用的功能，进而引起其他错误，所以在一般情况下不要使用它。



**参考资料**：

[Usage of slots?](http://stackoverflow.com/questions/472000/usage-of-slots)

[How slots are implemented](http://code.activestate.com/recipes/532903-how-__slots__-are-implemented/)
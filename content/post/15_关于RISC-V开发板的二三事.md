---
title: 关于RISC-V开发板的二三事
date: 2020-12-10
tags:
typora-root-url: ../../static/
---

最近再刷MIT的6.S081操作系统课程。今年的课是基于RISC-V架构讲的，运行的系统是跑在qemu模拟器上。随着对RISC-V的了解不断加深，我对这个ISA就越感兴趣，所以想着买一块RISC-V的开发板过来，直接在上面跑课程lab，或者试试移植linux来玩玩。但现实还是说明这个ISA还是太年轻了。

<!--more-->

---

## 前置要求

要让Linux或者xv6跑在RISC-V上，必须满足两个条件：

1. 芯片必须带MMU

   一般的RISC-V芯片都是MCU芯片，目标是嵌入式的场景，许多程序直接裸跑，最多也是上RTOS这类实时操作系统。它们完全不需要MMU。

2. 支持3种特权模式

    RISC-V文档中定义了machine mode、supervisor mode和user mode 3种特权模式。假设运行Linux，machine mode一般用于机器初始化，supervisor mode用于运行系统内核，user mode运行用户程序。基于以上同样的理由，一般RISC-V的芯片只会实现machine mode和user mode。

## 相关信息

### HiFive Unmatched

<https://www.sifive.com/boards/hifive-unleashed>

第一块能运行完成Linux的RISC-V开发板。用FPGA做的，看到这个基本就死心了。再看看价格，2000刀...

### 芯来的UX600芯片

<https://www.nucleisys.com/product/site/ux600/>

一家国产公司。产品页面介绍UX600系列对标ARM Cortex-A7等内核。其中UX608即包含MMU又实现了3种特权模式，但可惜的是，找不到相关公开的开发板资源。

### 阿里的玄铁906

<https://www.nucleisys.com/product/site/ux600/>

又是国产公司。Sipeed（矽速科技）11月6号在Twitter发布了这个芯片，号称12.5刀就能买到开发板。很明显，现在是没有的。

### PicoRio

<http://www.eepw.com.cn/article/202007/415955.htm>

对标树莓派的RISC-V开发板。可惜消息还是今年下半年的出来的，还不知道什么时候能出来。

### Sipeed的M1 K210

跟上面跟阿里合作玄铁906的同一家公司。这块开发板18年的时候就已经出来了，但这块K210的芯片不支持MMU。（有网友传出说是支持MMU的，但是没放出文档）

### 蜂鸟的E203

还是芯来科技的，这家公司在RISC-V领域好像还可以呀。一款开源的芯片，还伴有《手把手教你设计CPU RISC-V处理器篇》这本书。可惜的是，这还是一个嵌入式的MCU。

### 总结&题外话

其实在网上搜的时候已经发现，不少人已经将不同版本的Linux往RISC-V上迁移了，最近的Linux5.7也有支持RISC-V的patch，只不过他们都是用qemu模拟的。所以最终结论还是老老实实用qemu来做lab吧（*老老实实学学qemu怎么用*），也许再等几个月玄铁906或者PicoRio能出来？

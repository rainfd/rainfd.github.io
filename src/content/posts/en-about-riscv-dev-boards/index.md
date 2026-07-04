---
author: RainFD
title: "A Few Things About RISC-V Dev Boards"
locale: en
translationKey: about-riscv-dev-boards
pubDatetime: 2020-12-10T00:00:00+08:00
draft: false
description: "Starting from MIT's 6.S081 course, surveying RISC-V development boards on the market (SiFive, Allwinner D1, K210, etc.), sharing the selection process and observations on the current state of the RISC-V ecosystem."
tags:
  - RISC-V
---

I've been going through MIT's 6.S081 operating system course recently. This year's course is taught on the RISC-V architecture, with the system running inside the qemu emulator. The more I learn about RISC-V, the more interested I become in this ISA, so I thought about buying a RISC-V dev board to run the course labs directly on it, or maybe try porting Linux for fun. But reality quickly reminded me that this ISA is still very young.

<!--more-->

---

## Prerequisites

To run Linux or xv6 on RISC-V, two conditions must be met:

1. The chip must have an MMU

   Most RISC-V chips are MCU-class chips targeting embedded scenarios. Many programs run bare-metal, or at most on an RTOS. They simply don't need an MMU.

2. Support for three privilege modes

   The RISC-V spec defines three privilege modes: machine mode, supervisor mode, and user mode. When running Linux, machine mode is typically used for machine initialization, supervisor mode for running the kernel, and user mode for user programs. For the same reasons as above, most RISC-V chips only implement machine mode and user mode.

## Relevant Options

### HiFive Unmatched

<https://www.sifive.com/boards/hifive-unleashed>

The first RISC-V dev board capable of running a full Linux system. It's built on an FPGA — that alone kills the dream. And the price? $2,000...

### Nuclei UX600

<https://www.nucleisys.com/product/site/ux600/>

A domestic company. The product page describes the UX600 series as comparable to ARM Cortex-A7 cores. The UX608 includes both an MMU and all three privilege modes, but unfortunately, there's no publicly available dev board for it.

### Alibaba's Xuantie 906

<https://www.nucleisys.com/product/site/ux600/>

Another domestic company. Sipeed announced this chip on Twitter on November 6th, claiming you could get a dev board for $12.50. Obviously, it's not available yet.

### PicoRio

<http://www.eepw.com.cn/article/202007/415955.htm>

A RISC-V dev board positioned as a Raspberry Pi competitor. Unfortunately, news about it only surfaced in the second half of this year, and there's no release date in sight.

### Sipeed M1 (K210)

The same company working with Alibaba on the Xuantie 906. This board came out back in 2018, but the K210 chip doesn't support MMU. (Some forum posts claim it does support MMU, but no documentation has been released.)

### Hummingbird E203

Also from Nuclei — seems like this company has a solid presence in the RISC-V space. It's an open-source chip, accompanied by a book titled "A Step-by-Step Guide to Designing a CPU: RISC-V Edition." The catch? It's still an embedded MCU.

### Summary & Side Notes

While searching online, I found that many people have already ported various Linux versions to RISC-V — the recent Linux 5.7 even includes RISC-V patches. The catch is they all used qemu for emulation. So the final conclusion is: stick with qemu for the labs (and seriously learn how to use qemu properly). Maybe in a few months the Xuantie 906 or PicoRio will actually ship?

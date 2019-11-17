---
title: 记一次线上K8s临时存储与驱逐的问题
filename: K8s-Disk-Resource-Consumption
date: 2019-10-31 15:32:12
tags: 
- kubernetes
categories:
- 疑难杂症
typora-copy-images-to: K8s-Disk-Resource-Consumption
---

线上容器被驱逐引出的一系列问题。

<!--more-->

# 问题症状

一个应用有几十个实例，显示大量的实例不断重启

已经死掉的实例显示Evited状态



## 问题追寻









参考资料



- [logging drivers](https://docs.docker.com/config/containers/logging/configure/)
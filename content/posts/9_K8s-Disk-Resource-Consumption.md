---
title: 记一次线上K8s临时存储与驱逐的问题
description:
date: 2019-10-31
tags: 
- Kubernetes
categories:
- Operations
typora-root-url: ../../static/
---

线上容器被驱逐引出的一系列问题。

<!--more-->

---

## 问题症状

线上平台是Openshift3，应用昨天刚上线，今天就收到警报 ，系统提示一个应用大量的实例在短时间不断重启。这个应用是ETL相关的应用，部署了几十个实例。到了现场，在监控界面发现了大量状态为Evited的容器。查看Pod的事件，其类型有两种：

```plain
The node was low on resource: ephemeral-storage. Container xxx was using 217277240Ki, which exceeds its request of 0.
```

```plain
The node had condition: [DiskPressure].
```

事件提示磁盘资源紧张，看了其他应用都显示正常，那么可以初步判定是该应用有写入大量的文件把磁盘占满了。

## 问题追寻&&尝试解决

初步判定后，先直接进入了容器内部，看了一下现在磁盘占用情况。发现应用不仅把日志输出到标准输出，还把日志输出的本地。容器10G临时空间全被占满了。

> 注：平台采用filebeat+ELK的日志采集方案，规定应用日志输出到标准输出。

初步判定后，先看了这个应用的日志，发现监控平台上显示的日志时间有些滞后。平台上的日志为日志采集后的结果。再看日志量，峰值近400w/min。回来重看日志，发现基本都是DEBUG，那么现在就可以确定是应用的日志级别太低，日志量太大导致的磁盘空间不足。

找到问题后，立即联系开发人员，得知因应用的特殊性，线上的DEBUG级别要保留。但不是所有日志都需要DEBUG级别，他们在logback中调整了部分组件的日志级别。经过一段时间观察候，日志量降到了200w/min，应用不再驱逐重启了。此时监控界面显示着大量之前被驱逐的容器，只能让管理员手动删除。

> 注： 容器平台为合作方的基础设施，我们无权查看任何机器信息。

几天后，回到线上发现容器驱逐现象只是降低了频率。我们讨论了解决方案，决定暂时申请使用PVC来滚动存储近期DEBUG级别的日志，标准输出输出INFO级别的日志，此时问题还没有彻底根治。

最后，应用业务上趋于稳定，把全部的日志级别调为INFO，容器驱逐不再发生。

## 问题回顾

### 使用了PVC后为什么还没有彻底解决问题？

我们来分析有什么东西可能会导致磁盘占满？

#### 1. docker日志

docker默认使用json-logger-driver，容器标准输出的日志会落到磁盘

在主机`/var/log/pods/$(pod-name)/$(container-name)/`可以看到容器日志

```json
{"log":"2019-11-28 13:35:30,749 WARN  akka.remote.ReliableDeliverySupervisor                        - Association with remote system [akka.tcp://flink@flink-taskmanager-754bb4f48-xw8cb:6122] has failed, address is now gated for [50] ms. Reason: [Association failed with [akka.tcp://flink@flink-taskmanager-754bb4f48-xw8cb:6122]] Caused by: [flink-taskmanager-754bb4f48-xw8cb]\n","stream":"stdout","time":"2019-11-28T13:35:31.26009921Z"}
{"log":"2019-11-28 13:35:41,065 INFO  org.apache.flink.runtime.resourcemanager.StandaloneResourceManager  - The heartbeat of TaskManager with id d1b3771c4b71910cc323f0c61759f908 timed out.\n","stream":"stdout","time":"2019-11-28T13:35:41.265769985Z"}
```

在daemon.js的配置文件中可以设置这个日志大小

```json
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "100m", # Max size of the log files.
        "max-file": "5" # The maximum number of log files that can be present.
    }
}
```

#### 2. ~~容器镜像~~

在本地的开发环境经常会遇到docker镜像占用了大量空间，但在kubernetes中不一样。kubelet默认每分钟进行容器GC和每5分钟进行镜像GC。

#### 3. ~~PVC缓存~~

平台PVC只有一种资源类型：GlusterFS，而GlusterFS只有只读缓存。应用不断写入日志，没有读文件的操作。所以可以排除一个因素的影响。

- docker logger driver / stdout
- PVC gluster fs 本地缓存
- 主机磁盘资源紧张(镜像占用空间，k8s管理镜像策略)

### 磁盘资源紧张。为什么只有这一个应用发生驱逐？

Kubernetes存在两种驱逐阈值（threshold）。

#### 1. 软阈值

应用定义的阈值。例如limit cpu: 400m。而在K8s 1.15+版本中才加入了支持对ephemeral-storage设置软阈值。

#### 2. 硬件阈值

根据主机的配置的阈值。例如nodefs.available低于20%。

在这个例子中，当磁盘资源紧张，nodefs.available低于阈值，触发了驱逐。

kubelet会对Pod中所有容器当前local volumes和日志所占用的容量来排序，优先驱逐占用磁盘多的Pod。

### 有没有其他的解决方法？

#### 1. hostPath

如果只是临时应急，可以把应用部署到特定几台磁盘大的机器，通过hostPath把主机目录挂到应用上来快速解决。

#### 2. 加大集群日志吞吐

如果应用长期需要输出大量日志，则需要考虑当前日志采集的方式是否能从SideCar改用为DaemonSet集中采集。

如果使用的是ELK方案，还需考虑Logstash和Kafka的配置，是否需要调整。

#### 3. PVC

当然日志直接输出到PVC还是最简单粗暴的办法。

## 参考资料

[logging drivers](https://docs.docker.com/config/containers/logging/configure/)

[Evited Policy](https://kubernetes.io/docs/tasks/administer-cluster/out-of-resource/#eviction-policy)

[Local ephemeral storage](https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/#local-ephemeral-storage)

[Kubelet garbage collection](https://kubernetes.io/docs/concepts/cluster-administration/kubelet-garbage-collection/)

[Manager compute resource container](https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/)

[谈一下Docker与Kubernetes集群的日志和日志管理](https://www.cnblogs.com/cocowool/p/Docker_Kubernetes_Log_Location.html)

[kubernetes-issue-1：ephemeral-storage引发的pod驱逐问题](https://cloud.tencent.com/developer/article/1456389)
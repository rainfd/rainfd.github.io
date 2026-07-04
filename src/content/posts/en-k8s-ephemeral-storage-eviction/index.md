---
author: RainFD
title: "A Production K8s Ephemeral Storage and Eviction Incident"
locale: en
translationKey: k8s-ephemeral-storage-eviction
pubDatetime: 2019-10-31T00:00:00+08:00
draft: false
description: "Troubleshooting a production Kubernetes incident where containers were evicted due to ephemeral storage exhaustion — analyzing the ephemeral storage mechanism, eviction policies, and the final solution."
tags:
  - Kubernetes
---

A series of problems triggered by container eviction in production.

<!--more-->

---

## Symptoms

The production platform is OpenShift 3. An application had just gone live the day before, and today an alarm came in — the system reported that a large number of instances were continuously restarting in a short period. This was an ETL-related application with dozens of deployed instances. On arriving at the scene, the monitoring dashboard showed a large number of containers in the Evicted state. Checking Pod events revealed two types:

```plain
The node was low on resource: ephemeral-storage. Container xxx was using 217277240Ki, which exceeds its request of 0.
```

```plain
The node had condition: [DiskPressure].
```

The events indicated disk resource pressure. Other applications appeared normal, so the initial assessment was that this application was writing a large number of files and filling up the disk.

## Tracing and Attempted Fixes

After the initial assessment, I first entered the container to check the current disk usage. I found that the application was not only outputting logs to stdout but also writing logs locally. The container's 10 GB ephemeral storage was completely full.

> Note: The platform uses a filebeat + ELK log collection setup, with a policy that application logs should go to stdout.

After the initial assessment, I checked the application logs and noticed the timestamps on the monitoring platform were lagging. The platform's displayed logs are post-collection. Looking at the log volume — peak rates were nearly 4 million lines per minute. Reviewing the logs again, I found they were almost entirely DEBUG-level. So it was clear: the log level was too low, and the sheer volume caused the disk to run out of space.

Once the problem was identified, I immediately contacted the developers. They explained that due to the application's unique characteristics, DEBUG-level logging had to be kept in production. However, not all components needed DEBUG — they adjusted log levels for specific components in logback. After observing for a while, log volume dropped to 2 million lines per minute and the application stopped evicting and restarting. The monitoring dashboard still showed a large number of previously evicted containers, which the admin had to manually clean up.

> Note: The container platform is our partner's infrastructure — we have no access to any machine information.

A few days later, I returned to the production environment and found that container eviction had only decreased in frequency, not stopped. We discussed solutions and decided to temporarily apply for PVCs to store recent DEBUG-level logs with rotation, while stdout would only output INFO-level logs. At this point, the problem still wasn't fully solved.

Eventually, as the application's business stabilized, we switched all log levels to INFO. Container eviction stopped entirely.

## Retrospective

### Why wasn't the problem completely solved after using PVC?

Let's analyze what could have been filling up the disk.

#### 1. Docker Logs

Docker uses the json-file log driver by default. Container stdout logs are written to disk.

On the host, container logs are at `/var/log/pods/$(pod-name)/$(container-name)/`:

```json
{"log":"2019-11-28 13:35:30,749 WARN  akka.remote.ReliableDeliverySupervisor                        - Association with remote system [akka.tcp://flink@flink-taskmanager-754bb4f48-xw8cb:6122] has failed, address is now gated for [50] ms. Reason: [Association failed with [akka.tcp://flink@flink-taskmanager-754bb4f48-xw8cb:6122]] Caused by: [flink-taskmanager-754bb4f48-xw8cb]\n","stream":"stdout","time":"2019-11-28T13:35:31.26009921Z"}
{"log":"2019-11-28 13:35:41,065 INFO  org.apache.flink.runtime.resourcemanager.StandaloneResourceManager  - The heartbeat of TaskManager with id d1b3771c4b71910cc323f0c61759f908 timed out.\n","stream":"stdout","time":"2019-11-28T13:35:41.265769985Z"}
```

You can configure log size in the daemon.json config file:

```json
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "100m",
        "max-file": "5"
    }
}
```

#### 2. ~~Container Images~~

In local dev environments, Docker images often consume a lot of space, but Kubernetes is different. The kubelet performs container GC every minute and image GC every 5 minutes by default.

#### 3. ~~PVC Cache~~

The platform only offers one PVC type: GlusterFS, and GlusterFS only has read caching. The application was continuously writing logs with no read operations. So this factor can be ruled out.

Summary of possible causes:
- Docker log driver / stdout
- PVC GlusterFS local cache
- Host disk resource pressure (image space, K8s image management policy)

### Disk pressure: why was only this one application evicted?

Kubernetes has two types of eviction thresholds.

#### 1. Soft Thresholds

Application-defined thresholds. For example, `limit cpu: 400m`. Support for ephemeral-storage soft thresholds was only added in K8s 1.15+.

#### 2. Hard Thresholds

Host-level thresholds. For example, `nodefs.available` below 20%.

In this case, when disk resources became tight and `nodefs.available` dropped below the threshold, eviction was triggered.

The kubelet sorts all containers in a Pod by the combined capacity of their current local volumes and logs, and evicts the Pod consuming the most disk space first.

### Are there other solutions?

#### 1. hostPath

As a quick emergency measure, you can deploy the application to specific machines with large disks and use `hostPath` to mount the host directory into the application.

#### 2. Scale Up Cluster Log Throughput

If the application needs to output large volumes of logs long-term, consider whether the current log collection approach can be switched from SideCar to DaemonSet for centralized collection.

If using the ELK stack, also consider whether Logstash and Kafka configurations need adjustment.

#### 3. PVC

Writing logs directly to PVC remains the simplest and most brute-force approach.

## References

[logging drivers](https://docs.docker.com/config/containers/logging/configure/)

[Eviction Policy](https://kubernetes.io/docs/tasks/administer-cluster/out-of-resource/#eviction-policy)

[Local ephemeral storage](https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/#local-ephemeral-storage)

[Kubelet garbage collection](https://kubernetes.io/docs/concepts/cluster-administration/kubelet-garbage-collection/)

[Manage compute resource container](https://kubernetes.io/docs/concepts/configuration/manage-compute-resources-container/)

[Docker and Kubernetes Cluster Logging](https://www.cnblogs.com/cocowool/p/Docker_Kubernetes_Log_Location.html)

[kubernetes-issue-1: Pod eviction caused by ephemeral-storage](https://cloud.tencent.com/developer/article/1456389)

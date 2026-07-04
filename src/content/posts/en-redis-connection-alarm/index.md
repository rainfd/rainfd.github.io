---
author: RainFD
title: "A Production Redis Connection Alarm Incident"
locale: en
translationKey: redis-connection-alarm
pubDatetime: 2019-12-16T00:00:00+08:00
draft: false
description: "Troubleshooting a production Redis cluster alarm where connections exceeded 80% capacity — analyzing the root cause, investigation steps, and how to optimize Redis client connection pool configuration."
tags:
  - Redis
---

On Friday, I received Redis cluster alarms from two different systems. Coincidentally, both reported that the number of connections had exceeded 80%. This is a fairly common issue in other systems at the company, so I'm documenting it here.

<!--more-->

---

## Investigation

### Background

- App A is a Node.js application deployed on VMware VMs, running in production for over 400 days.

- App B is a Scala application deployed on a private Azure Container Service (ACS), updated just last Wednesday.

- Apps A and B have no physical or business relationship.

- The Redis clusters use a one-master-two-slave setup, with 5 GB per node, version 3.2. System A's Redis cluster is 15 GB; System B's is 120 GB.

- The alarm indicated that Redis server connections had exceeded 3,200, with the original cap at 4,000.

### Live Situation

From the monitoring dashboard, we could see that several nodes across both Redis clusters had exceeded 3,200 connections, with varying counts across nodes.

This suggested the problem wasn't with the application — since an app connecting to a Redis cluster connects to all nodes, each node should have roughly the same number of connections under normal circumstances. We then checked the TCP connection count on the hosts running Apps A and B, and sure enough, Redis-related connections were very few.

Next, we logged into Redis and used `CLIENT LIST` to inspect the current server connections. We found a large number of idle connections, some with up to nearly 400 days of uptime.

```plain
redis x.x.x.x:6379> CLIENT LIST
id=x addr=x.x.x.x:xx fd=6 age=19089992 idle=19089992 flags=N db=0 sub=0 psub=0 multi=-1 qbuf=0 qbuf-free=32768 obl=0 oll=0 omem=0 events=r cmd=cluster
...
```

This reminded me of a notice from the ACS team a while back. The notice warned that, due to underlying platform characteristics, TCP connections would be automatically dropped after 240 seconds of idleness. The platform team advised developers to check whether this would affect their applications.

Back to the issue: those idle connections were likely the result of applications exiting abnormally without sending a FIN packet, or network issues preventing the FIN packet from being delivered. The Redis server never realized these connections were dead. Over time, these useless connections accumulated until they triggered the alarm.

I checked the relevant Redis parameters — `timeout` and `tcp-keepalive`:

- When `timeout` is non-zero, the server automatically closes idle connections after a set period.
- When `tcp-keepalive` is non-zero, the server periodically sends ACK packets to clients to check if the connection is still alive.

Both parameters on the server were set to 0, meaning they were disabled. So as long as a FIN packet didn't reach the server properly, the connection would stick around forever.

Once we found the root cause, the fix was straightforward. Since Redis supports hot configuration changes, we set `timeout` to 240s and `tcp-keepalive` to 30s directly. A few seconds later, connection counts across the Redis cluster dropped back to normal. Problem solved.

## Lessons and Improvements

The ACS team had actually warned us about this — we just didn't think it would affect the Redis server. To prevent this from happening again, all Redis cluster default configurations should include these two parameters.

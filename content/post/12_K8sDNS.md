---
title: K8sDNS 和 CoreDNS
date: 2020-04-03
tags: 
  - k8s
  - network
typora-root-url: ../../static/
---

最近看到一篇文章[CoreDNS生产案：pod出现dns解析大量失败的问题](^1)，发现自己对DNS和K8s的DNS使用机制都不是很了解，这里就来深入一下。

![coredns](/img/12/coredns.png)

<!--more-->

## DNS常用记录

### A/AAAA 记录

使用DNS时，那么返回IPv4地址的记录就是A记录，而AAAA记录则对应IPv6地址。

### CNAME记录

如果域名解析的结果是另一个域名，那么这个记录就是CNAME。

### MX记录

MX是针对邮件服务器的记录。

### TXT记录

一般指某个域名或者主机名的说明

### PTR记录

PTR是Pointer的缩写，代表反向的域名解析。

### SRV记录

记录什么服务提供了什么服务，例如`_example-server._tcp`。

## 常用DNS查询工具

- dig
- nslookup

## 普通主机怎么接入DNS？

Linux主机一般通过`/etc/resolv.conf`来查询默认的DNS服务器。

```plain
nameserver 192.168.10.1
nameserver 114.114.114.114
```

## K8s 怎么接入DNS的？

由于DNS原来的机制就很简单，K8s这里也没有做什么黑魔法。

Kubelet在启动参数`--cluster-dns=<dns-service-ip>`中指定一个固定的IP，然后我们将DNS服务通过Deployment部署到集群中，用Service暴露到这个IP。相当于在集群设置了一个默认的DNS地址，在Pod在部署时，都修改其`/etc/reslov.conf`的nameserver为该地址。

这样做就把DNS与K8s完全抽象分离，我们可以自由地选择不同的DNS服务，甚至自己来定制开发[^2]。

## CoreDNS vs K8sDNS

CoreDNS和K8sDNS都是K8s常用的DNS服务[^5]。CoreDNS由于在集群外的解析速度超过K8sDNS很多，从1.12版本就作为了K8s推荐使用的DNS服务器。详细性能的比较可以看[Cluster DNS: CoreDNS vs Kube-DNS](https://coredns.io/2018/11/27/cluster-dns-coredns-vs-kube-dns/)。

除了作为K8s的DNS服务，CoreDNS也可以作为普通的DNS服务来使用，配合etcd还可以轻松实现服务发现的功能[^3]。

## Pod的DNS使用

Pod的默认DNS使用策略为`dnsPolicy: ClusterFirst`，及域名先在集群内进行解析，解析失败才向集群外的DNS服务器(例如114.114.114.114)请求域名解析。

我们来看看一般Pod的`/etc/resolv.conf`

```plain
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

- nameserver： 代表DNS服务器地址
- options ndots: 5 代表当域名的`.`符号不足5个时，会将当前域名加上search列表的一个域来查询域名。如果查询都失败，才用原来的域名进行查询。

例如，我们用在一个Pod上执行`ping baidu.com`，可以在CoreDNS的日志上看到对应的4条日志。

(NXDOMAIN:失败，NOERROR: 成功)

```plain
[INFO] 172.17.0.2:52356 - 31488 "A IN baidu.com.default.svc.cluster.local. udp 53 false 512" NXDOMAIN qr,aa,rd 146 0.000199086s
[INFO] 172.17.0.2:58024 - 2110 "A IN baidu.com.svc.cluster.local. udp 45 false 512" NXDOMAIN qr,aa,rd 138 0.000186528s
[INFO] 172.17.0.2:36382 - 1509 "A IN baidu.com.cluster.local. udp 41 false 512" NXDOMAIN qr,aa,rd 134 0.00007401s
[INFO] 172.17.0.2:53961 - 15464 "A IN baidu.com. udp 27 false 512" NOERROR qr,rd,ra 77 0.034337692s
```

为了满足不同的应用解析需求，你也可以修改每一个Pod中的`dnsConfig`和`dnsPolicy`字段[^4]。当然，修改完后，最终的落地还是通过修改Pod中的`/etc/resolve.conf`来实现的。

## DNS线上问题

回到[CoreDNS生产案：pod出现dns解析大量失败的问题](^1)，还有相似的问题[Kubernetes pods /etc/resolv.conf ndots:5 option and why it may negatively affect your application performances](https://pracucci.com/kubernetes-dns-resolution-ndots-options-and-why-it-may-affect-application-performances.html)。

当出来需要大量解析集群外域名时，默认的解析机制将流量放大到了4倍。

解决的方法大致有以下几种：

### 1. 使用完整的域名

即域名最后带上`.`, 例如`taobao.com`就换成`taobao.com.`。这样会直接使用集群外的DNS服务器。

这是最快最简单的方法，但有点不太直观。

### 2. 自定义`dnsPolicy`或者`dnsConfig`

修改`dnsPolicy`为`Default`来让应用只解析集群外的域名，或者修改dnsConfig的`ndots`和`searches`列表来降低集群内解析的数目。

这种方法会影响应用集群内的域名解析，所以需要根据业务场景来设置。

``` yaml
apiVersion: v1
kind: Pod
metadata:
  namespace: default
  name: dns-example
spec:
  containers:
    - name: test
      image: nginx
  dnsPolicy: "Default"
  dnsConfig:
    searches:
      - ns1.svc.cluster-domain.example
    options:
      - name: ndots
        value: "2"
```

### 3. 使用node local dns来提升ClusterDNS服务质量[^6]

阿里云提供的一个方案，通过DaemonSet在每个节点部署一个CoreDNS来提升总clusterDNS的性能。

[^1]: https://mp.weixin.qq.com/s/UTESN6Q3R_ROah8X6XT_BA
[^2]: https://github.com/kubernetes/dns/blob/master/docs/specification.md
[^3]: https://coredns.io/plugins/etcd
[^4]: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service
[^5]: https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/#inheriting-dns-from-the-node
[^6]: https://yq.aliyun.com/articles/709471

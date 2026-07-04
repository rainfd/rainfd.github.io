---
author: RainFD
title: "Kubernetes DNS Internals and CoreDNS Deep Dive"
pubDatetime: 2020-04-03T00:00:00+08:00
draft: false
locale: en
translationKey: k8s-dns-coredns
description: "Starting from DNS fundamentals, a deep dive into how DNS works inside Kubernetes clusters, CoreDNS architecture and configuration, and practical troubleshooting for common DNS resolution failures in production."
tags:
  - Kubernetes
---

I recently came across an article about [a CoreDNS production incident: massive DNS resolution failures in pods](^1), and realized I didn't have a solid understanding of DNS or how Kubernetes handles it. So let's dig in.

<!-- ![coredns](./assets/coredns.png) -->

<!--more-->

---

## Common DNS Record Types

### A / AAAA Records

When you query DNS and get an IPv4 address back, that's an A record. AAAA records correspond to IPv6 addresses.

### CNAME Records

If the DNS resolution result is another domain name, that's a CNAME record.

### MX Records

MX records are for mail servers.

### TXT Records

Generally descriptive text associated with a domain or hostname.

### PTR Records

PTR stands for Pointer — it's reverse DNS resolution.

### SRV Records

Records that specify which service provides what, e.g., `_example-server._tcp`.

## Common DNS Query Tools

- dig
- nslookup

## How Does a Regular Host Use DNS?

Linux hosts typically query their default DNS servers through `/etc/resolv.conf`.

```plain
nameserver 192.168.10.1
nameserver 114.114.114.114
```

## How Does Kubernetes Use DNS?

Since DNS's original mechanism is already simple, Kubernetes doesn't do any black magic here.

Kubelet specifies a fixed IP through the startup parameter `--cluster-dns=<dns-service-ip>`. You then deploy a DNS service into the cluster as a Deployment and expose it at that IP via a Service. This effectively sets a default DNS address for the cluster — when Pods are deployed, their `/etc/resolv.conf` nameserver is set to that address.

This completely decouples DNS from Kubernetes, so you can freely choose different DNS services or even build your own[^2].

## CoreDNS vs. Kube-DNS

Both CoreDNS and Kube-DNS are commonly used DNS services for Kubernetes[^5]. CoreDNS significantly outperforms Kube-DNS for external resolution, and has been the recommended DNS server since Kubernetes 1.12. For detailed performance comparisons, see [Cluster DNS: CoreDNS vs Kube-DNS](https://coredns.io/2018/11/27/cluster-dns-coredns-vs-kube-dns/).

Beyond serving as Kubernetes's DNS, CoreDNS can also function as a standalone DNS service. Paired with etcd, it easily enables service discovery[^3].

## DNS Behavior in Pods

The default DNS policy for Pods is `dnsPolicy: ClusterFirst` — meaning domain names are first resolved within the cluster, and only on failure does it fall back to external DNS servers (e.g., 114.114.114.114).

Let's look at a typical Pod's `/etc/resolv.conf`:

```plain
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

- `nameserver`: the DNS server address
- `options ndots:5`: when a domain name has fewer than 5 dots, it appends each domain from the search list and tries resolving. Only if all fail does it try the original domain name.

For example, running `ping baidu.com` inside a Pod produces these four entries in CoreDNS logs:

(NXDOMAIN: failure, NOERROR: success)

```plain
[INFO] 172.17.0.2:52356 - 31488 "A IN baidu.com.default.svc.cluster.local. udp 53 false 512" NXDOMAIN qr,aa,rd 146 0.000199086s
[INFO] 172.17.0.2:58024 - 2110 "A IN baidu.com.svc.cluster.local. udp 45 false 512" NXDOMAIN qr,aa,rd 138 0.000186528s
[INFO] 172.17.0.2:36382 - 1509 "A IN baidu.com.cluster.local. udp 41 false 512" NXDOMAIN qr,aa,rd 134 0.00007401s
[INFO] 172.17.0.2:53961 - 15464 "A IN baidu.com. udp 27 false 512" NOERROR qr,rd,ra 77 0.034337692s
```

To accommodate different application resolution needs, you can also modify `dnsConfig` and `dnsPolicy` on individual Pods[^4]. But ultimately, these all work by modifying the Pod's `/etc/resolv.conf`.

## DNS Issues in Production

Going back to [the CoreDNS production case](^1) and a similar issue: [Kubernetes pods /etc/resolv.conf ndots:5 option and why it may negatively affect your application performances](https://pracucci.com/kubernetes-dns-resolution-ndots-options-and-why-it-may-affect-application-performances.html).

When an application needs to resolve a large number of external domain names, the default resolution mechanism amplifies traffic by 4x.

Here are a few solutions:

### 1. Use Fully Qualified Domain Names

Add a trailing `.` to domain names — e.g., use `taobao.com.` instead of `taobao.com`. This bypasses the search list and goes straight to external DNS.

This is the fastest and simplest approach, though it's not very intuitive.

### 2. Customize `dnsPolicy` or `dnsConfig`

Set `dnsPolicy` to `Default` so the application only resolves external names, or tweak the `ndots` and `searches` in `dnsConfig` to reduce the number of internal resolution attempts.

This approach affects internal cluster name resolution, so you'll need to configure it based on your workload.

```yaml
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

### 3. Use Node Local DNS to Improve ClusterDNS Service Quality[^6]

A solution from Alibaba Cloud — deploy a CoreDNS instance on each node via DaemonSet to boost overall ClusterDNS performance.

[^1]: https://mp.weixin.qq.com/s/UTESN6Q3R_ROah8X6XT_BA
[^2]: https://github.com/kubernetes/dns/blob/master/docs/specification.md
[^3]: https://coredns.io/plugins/etcd
[^4]: https://kubernetes.io/docs/concepts/services-networking/dns-pod-service
[^5]: https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/#inheriting-dns-from-the-node
[^6]: https://yq.aliyun.com/articles/709471

---
title: "MIME导致的BUG"
date: 2022-08-09T20:08:59+08:00
draft: true
---

<https://github.com/swagger-api/swagger-codegen-generators/compare/master...rainfd:swagger-codegen-generators:master>

```go
/ TypeByExtension returns the MIME type associated with the file extension ext.
// The extension ext should begin with a leading dot, as in ".html".
// When ext has no associated type, TypeByExtension returns "".
//
// Extensions are looked up first case-sensitively, then case-insensitively.
//
// The built-in table is small but on unix it is augmented by the local
// system's MIME-info database or mime.types file(s) if available under one or
// more of these names:
//
//   /usr/local/share/mime/globs2
//   /usr/share/mime/globs2
//   /etc/mime.types
//   /etc/apache2/mime.types
//   /etc/apache/mime.types
//
// On Windows, MIME types are extracted from the registry.
//
// Text types have the charset parameter set to "utf-8" by default.
func TypeByExtension(ext string) string {
```

```HTTP
HTTP/1.1 100 Continue

POST /v1/gender HTTP/1.1
Host: localhost:8080
User-Agent: curl/7.47.0
Accept: */*
Content-Length: 6951
Expect: 100-continue
Content-Type: multipart/form-data; boundary=------------------------03055648464feab3

--------------------------03055648464feab3
Content-Disposition: form-data; name="file"; filename="world.wav"
Content-Type: audio/wave
```

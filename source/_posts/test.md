---
title: test
date: 2019-10-16 20:12:12
tags:
---

{% asset_img backgroud.jpeg backgroud %}

![backgroud](backgroud.jpeg)

---

```sequence
Alice->Bob: Hello Bob, how are you?
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks!
```

```flow
st=>start: Start|past:>http://www.google.com[blank]
e=>end: End:>http://www.google.com
op1=>operation: My Operation|past
op2=>operation: Stuff|current
sub1=>subroutine: My Subroutine|invalid
cond=>condition: Yes
or No?|approved:>http://www.google.com
c2=>condition: Good idea|rejected
io=>inputoutput: catch something...|request

st->op1(right)->cond
cond(yes, right)->c2
cond(no)->sub1(left)->op1
c2(yes)->io->e
c2(no)->op2->e
```

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}
```

```golang
package main
import "fmt"

func main() {
    fmt.Println("Hello World")
}
```

```python
def main:
    print("Hello World")
```

```bash
main() {
  echo "hello: $1"
}
```

---
the famous matter-energy equation $\eqref{eq1}$ proposed by Einstein ...

$$\begin{equation}
e=mc^2
\end{equation}\label{eq1}$$

$$
\begin{equation}
\begin{aligned}
a &= b + c \\
  &= d + e + f + g \\
  &= h + i
\end{aligned}
\end{equation}\label{eq2}
$$

---

# H1
## H2
### H3
#### H4
##### H5
##### H6
---
hello

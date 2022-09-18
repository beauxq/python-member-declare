# python-member-declare README

This is bad python:
```python
class C:
    def __init__(self) -> None:
        self.b = 3
```

This is good python:
```python
class C:
    b: int

    def __init__(self) -> None:
        self.b = 3
```

This extension checks to make sure you declare class members.

## Known Issues

```python
class C:
    def __init__(self) -> None:
        a = "self.b = 3"
```

```python
class C:
    """
    b: int
    """

    def __init__(self) -> None:
        self.b = 3
```

```python
class B:
    b: int

class C(B):
    def __init__(self) -> None:
        # not reported because we don't look at what members are inherited
        self.b = 3
        self.a = 3
```

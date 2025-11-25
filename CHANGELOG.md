# Change Log

All notable changes to the "dspy-intellisense" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3] - 2025-11-24

- Fixed bug where instance attributes were not being introspected correctly.
- Added support for fields without type annotations in signatures, such as:

```python
class MySignature(dspy.Signature):
    input = dspy.InputField()
    output = dspy.OutputField()
```

and

```python
predict = dspy.Predict("question -> answer")
```

## [0.0.2] - 2025-11-16

- Docs cleanup

## [0.0.1] - 2025-11-16

- Initial release

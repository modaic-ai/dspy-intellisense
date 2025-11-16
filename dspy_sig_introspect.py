#!/usr/bin/env python
"""
dspy_sig_introspect.py

Usage:
    python dspy_sig_introspect.py path/to/file.py

Prints JSON of the form:

{
  "file": "/abs/path/to/file.py",
  "signatures": { ... },
  "modules": { ... },
  "predictions": { ... }
}
"""

import ast
import json
import pathlib
import sys
from dataclasses import dataclass, asdict
from typing import Dict, List, Literal, Optional


FieldKind = Literal["input", "output"]
RECOGNIZED_DSPY_MODULES = {
    "Predict",
    "ReAct",
    "ChainOfThought",
    "CodeAct",
    "MultiChainComparison",
    "ProgramOfThought",
}


@dataclass
class FieldInfo:
    name: str
    kind: FieldKind
    annotation: Optional[str]
    description: Optional[str]


@dataclass
class SignatureInfo:
    name: str
    inputs: List[FieldInfo]
    outputs: List[FieldInfo]
    docstring: Optional[str]


@dataclass
class ModuleInfo:
    """A DSPy module / predictor variable, e.g. my_predict = dspy.Predict(MySignature)."""

    name: str  # variable name, e.g. "my_predict"
    signature: str  # signature class name, e.g. "MySignature"
    line: int
    column: int  # 1-based


@dataclass
class PredictionInfo:
    """A variable that holds the result of calling a DSPy module, e.g. result = my_predict(...)."""

    name: str  # variable name, e.g. "result"
    signature: str  # signature class name, e.g. "MySignature"
    line: int
    column: int  # 1-based


class DSpyIntrospector(ast.NodeVisitor):
    def __init__(self, filename: str) -> None:
        self.filename = filename
        self.signatures: Dict[str, SignatureInfo] = {}
        self.modules: Dict[str, ModuleInfo] = {}
        self.predictions: Dict[str, PredictionInfo] = {}

    # ------- Helpers -----------------------------------------------------

    def _parse_signature_side(self, side_text: str, kind: FieldKind) -> List[FieldInfo]:
        """
        Parse one side of an inline signature string.
        Supports:
          - "a, b: str"  (group type)
          - "a: str, b: int" (per-field types)
          - "a, b" (no types)
        """
        side = side_text.strip()
        if not side:
            return []

        # If exactly one colon on the side, treat it as a group annotation
        if side.count(":") == 1:
            names_part, type_part = side.split(":", 1)
            annotation = type_part.strip() or None
            names = [n.strip() for n in names_part.split(",") if n.strip()]
            return [
                FieldInfo(name=name, kind=kind, annotation=annotation, description=None)
                for name in names
            ]

        # Otherwise, parse per-item (each item may or may not have its own annotation)
        fields: List[FieldInfo] = []
        for token in (t.strip() for t in side.split(",") if t.strip()):
            if ":" in token:
                name_part, type_part = token.split(":", 1)
                name = name_part.strip()
                annotation = type_part.strip() or None
            else:
                name = token
                annotation = None
            fields.append(
                FieldInfo(name=name, kind=kind, annotation=annotation, description=None)
            )
        return fields

    def _parse_inline_signature(self, text: str) -> SignatureInfo:
        """
        Parse an inline signature string, e.g.:
          "in1, in2: str -> out1, out2: int"
        The returned SignatureInfo.name is the raw inline string.
        """
        raw = text.strip()
        if "->" in raw:
            left, right = raw.split("->", 1)
        else:
            left, right = raw, ""
        inputs = self._parse_signature_side(left, "input")
        outputs = self._parse_signature_side(right, "output")
        return SignatureInfo(name=raw, inputs=inputs, outputs=outputs, docstring=None)

    def _is_dspy_signature_base(self, node: ast.AST) -> bool:
        """
        Match: class X(dspy.Signature) or class X(Signature)
        """
        if isinstance(node, ast.Attribute):
            # e.g. dspy.Signature
            return node.attr == "Signature"
        if isinstance(node, ast.Name):
            # e.g. Signature
            return node.id == "Signature"
        return False

    def _is_input_field_call(self, node: ast.expr) -> bool:
        """
        Match: dspy.InputField(...) or InputField(...)
        """
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute):
                return func.attr == "InputField"
            if isinstance(func, ast.Name):
                return func.id == "InputField"
        return False

    def _is_output_field_call(self, node: ast.expr) -> bool:
        """
        Match: dspy.OutputField(...) or OutputField(...)
        """
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute):
                return func.attr == "OutputField"
            if isinstance(func, ast.Name):
                return func.id == "OutputField"
        return False

    def _annotation_str(self, node: Optional[ast.expr]) -> Optional[str]:
        if node is None:
            return None
        try:
            # Python 3.9+
            return ast.unparse(node)  # type: ignore[attr-defined]
        except Exception:
            if isinstance(node, ast.Name):
                return node.id
            return None

    def _expr_to_text(self, node: Optional[ast.expr]) -> Optional[str]:
        """
        Best-effort conversion of an expression to human-readable text.
        Prefers raw string value for constants; falls back to ast.unparse.
        """
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        try:
            # Python 3.9+
            return ast.unparse(node)  # type: ignore[attr-defined]
        except Exception:
            if isinstance(node, ast.Name):
                return node.id
            return None

    def _extract_field_description(self, call: ast.Call) -> Optional[str]:
        """
        Tries to extract a description string from InputField/OutputField calls.
        Common keyword names seen in DSPy: 'desc' or 'description'.
        If not present, falls back to the first string literal positional arg.
        """
        # Check keyword arguments first
        for kw in call.keywords:
            if kw.arg in ("desc", "description"):
                return self._expr_to_text(kw.value)

        # Fallback: first positional string literal (if any)
        for arg in call.args:
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                return arg.value

        return None

    # ------- Visitors: Signatures ---------------------------------------

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        # Detect Signature subclasses
        if any(self._is_dspy_signature_base(b) for b in node.bases):
            inputs: List[FieldInfo] = []
            outputs: List[FieldInfo] = []
            class_doc = ast.get_docstring(node)

            for stmt in node.body:
                # field: str = dspy.InputField(...)
                if isinstance(stmt, ast.AnnAssign) and isinstance(
                    stmt.target, ast.Name
                ):
                    field_name = stmt.target.id
                    kind: Optional[FieldKind] = None
                    description: Optional[str] = None

                    if stmt.value is not None:
                        if self._is_input_field_call(stmt.value):
                            kind = "input"
                            if isinstance(stmt.value, ast.Call):
                                description = self._extract_field_description(
                                    stmt.value
                                )
                        elif self._is_output_field_call(stmt.value):
                            kind = "output"
                            if isinstance(stmt.value, ast.Call):
                                description = self._extract_field_description(
                                    stmt.value
                                )

                    if kind is not None:
                        f = FieldInfo(
                            name=field_name,
                            kind=kind,
                            annotation=self._annotation_str(stmt.annotation),
                            description=description,
                        )
                        if kind == "input":
                            inputs.append(f)
                        else:
                            outputs.append(f)

            self.signatures[node.name] = SignatureInfo(
                name=node.name,
                inputs=inputs,
                outputs=outputs,
                docstring=class_doc,
            )

        self.generic_visit(node)

    # ------- Visitors: Modules & Predictions -----------------------------

    def visit_Assign(self, node: ast.Assign) -> None:
        """
        Handle both:
            my_predict = dspy.Predict(MySignature)
            result = my_predict(name="John", age=30)

        1) If RHS is a call to a known DSPy builder (Predict, ChainOfThought, etc.),
           register a ModuleInfo (builder variable -> Signature).

        2) If RHS is a call to a known module variable (e.g. my_predict(...)),
           register a PredictionInfo (result variable -> Signature).
        """
        # Case 1: builder call -> module variable
        if isinstance(node.value, ast.Call):
            call = node.value
            func = call.func

            # Try to get base function name: dspy.Predict -> "Predict", Predict -> "Predict"
            func_name: Optional[str] = None
            if isinstance(func, ast.Attribute):
                func_name = func.attr
            elif isinstance(func, ast.Name):
                func_name = func.id

            if func_name in RECOGNIZED_DSPY_MODULES:
                # e.g. dspy.Predict(MySignature)
                if call.args:
                    sig_expr = call.args[0]
                    if isinstance(sig_expr, ast.Name):
                        sig_name = sig_expr.id
                        for target in node.targets:
                            if isinstance(target, ast.Name):
                                var_name = target.id
                                self.modules[var_name] = ModuleInfo(
                                    name=var_name,
                                    signature=sig_name,
                                    line=node.lineno,
                                    column=node.col_offset + 1,
                                )
                    elif isinstance(sig_expr, ast.Constant) and isinstance(
                        sig_expr.value, str
                    ):
                        # Inline signature string, e.g. "a, b: str -> c: int"
                        inline_sig_text = sig_expr.value
                        sig_info = self._parse_inline_signature(inline_sig_text)
                        # Store under the raw inline string as the identifier
                        self.signatures[sig_info.name] = sig_info
                        for target in node.targets:
                            if isinstance(target, ast.Name):
                                var_name = target.id
                                self.modules[var_name] = ModuleInfo(
                                    name=var_name,
                                    signature=sig_info.name,
                                    line=node.lineno,
                                    column=node.col_offset + 1,
                                )

            # Case 2: prediction variable: result = my_predict(...)
            # Here func is typically a Name like "my_predict"
            if isinstance(func, ast.Name):
                callee_name = func.id
                if callee_name in self.modules:
                    sig_name = self.modules[callee_name].signature
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            var_name = target.id
                            self.predictions[var_name] = PredictionInfo(
                                name=var_name,
                                signature=sig_name,
                                line=node.lineno,
                                column=node.col_offset + 1,
                            )

        self.generic_visit(node)


# ------- CLI -------------------------------------------------------------


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: dspy_sig_introspect.py <file.py>", file=sys.stderr)
        return 1

    filename = sys.argv[1]
    path = pathlib.Path(filename).resolve()

    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(
            json.dumps(
                {"file": str(path), "signatures": {}, "modules": {}, "predictions": {}}
            )
        )
        return 0

    try:
        tree = ast.parse(text, filename=str(path))
    except SyntaxError:
        # If the file is currently half-typed / invalid, just return empty
        print(
            json.dumps(
                {"file": str(path), "signatures": {}, "modules": {}, "predictions": {}}
            )
        )
        return 0

    visitor = DSpyIntrospector(str(path))
    visitor.visit(tree)

    result = {
        "file": str(path),
        "signatures": {
            name: {
                "name": sig.name,
                "docstring": sig.docstring,
                "inputs": [asdict(f) for f in sig.inputs],
                "outputs": [asdict(f) for f in sig.outputs],
            }
            for name, sig in visitor.signatures.items()
        },
        "modules": {name: asdict(mod) for name, mod in visitor.modules.items()},
        "predictions": {
            name: asdict(pred) for name, pred in visitor.predictions.items()
        },
    }

    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Resolve the source scripts' direct, object-like VAR aliases at import.

This deliberately is not a C preprocessor or a runtime variable heuristic.
Numeric constants, labels, arithmetic macros and function macros keep their
existing meaning. The native source currently has five such aliases, in Ilex.
"""
import re


def variable_aliases(source):
    return dict(re.findall(
        r'^#define[ \t]+([A-Za-z_]\w*)[ \t]+(VAR_[A-Za-z0-9_]+)[ \t]*(?://[^\n]*)?$',
        source, re.M))


def canonicalize_variable_aliases(instructions, aliases):
    """Replace complete operand identifiers; never commands or script labels."""
    return [[command, [re.sub(r'\b[A-Za-z_]\w*\b',
                             lambda token: aliases.get(token[0], token[0]), argument)
                       for argument in arguments]]
            for command, arguments in instructions]

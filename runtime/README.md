# runtime

Files the PC copies onto the stick so Feather runs on any laptop with nothing installed.

- The `*.dll` files are Microsoft's Visual C++ runtime. The Vault reader (libzim) and the model engine need them, and many laptops don't have them. They are redistributable under Microsoft's Visual C++ Redistributable licence.
- `wheels/` holds pure-Python packages for the stick's Python: SymPy and mpmath (BSD), used by the math tutor.

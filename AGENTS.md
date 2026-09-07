# Implementation guidelines

- Do not use Node.js primitives directly. Always strive to use the Effect
  equivalent or abstraction, including in tests (for example, `FileSystem`,
  `Path`, `Clock`, and Effect's process abstractions).
- Provide platform implementations through Effect layers at runtime or test
  boundaries. Before introducing a direct Node.js API, look for an existing
  Effect service or abstraction.

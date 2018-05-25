# RXA

An lib to create an application which is based on React + Redux + Rxjs + Ramda + Reselect.
It supports developer to build React app faster.
## Cool features:
1. Support auto prefetch components
2. Support lazy module loading, dynamic actions
3. No reducer needed
4. Support async redux action
5. Simple action dispatching

## Examples:
### 1. Hello world !!! (<a href="https://codesandbox.io/s/43kn33ko0x">Codesandbox</a>)
```js

import React from "react";
import { render } from "react-dom";
import { create } from "rxa";

const app = create({ name: "World" }).action("hello", (name, postfix) =>
  alert(`Hello ${name}${postfix}`)
);

const HelloButton = app.connect(({ name }, { hello }) => ({ name, hello }))(
  ({ name, hello }) => (
    <button onClick={() => hello(name, " !!!")}>Click me</button>
  )
);

render(
  <app.Provider>
    <HelloButton />
  </app.Provider>,
  document.body
);


```

## Docs:

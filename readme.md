# RXA

An lib to create an application which is based on React + Redux + Rxjs + Ramda + Reselect.
It supports developer to build React app faster.
## Cool features:
1. Support auto prefetch components
2. Support lazy module loading, dynamic actions
3. No reducer needed
4. Support async redux action
5. Simple action dispatching
6. Auto applying reselect to improve app rendering performance

## Examples:
### Hello world
<a href="https://codesandbox.io/s/43kn33ko0x">codesandbox.io</a>
```jsx

import React from "react";
import { render } from "react-dom";
import { create } from "rxa";

// create app with intial state
const app = create({ name: "World" })
  // register hello action
  .action("hello", (name, postfix) => alert(`Hello ${name}${postfix}`));

// create connection
const helloButtonConnect = app.connect(
  // properties mapper, it retrieves 3 arguments state, actions, ownProps
  ({ name }, { hello }) => ({
    name,
    hello
  })
);

const HelloButton = helloButtonConnect(({ name, hello }) => (
  <button onClick={() => hello(name, " !!!")}>Click me</button>
));

render(
  <app.Provider>
    <HelloButton />
  </app.Provider>,
  document.body
);

```

## Docs:

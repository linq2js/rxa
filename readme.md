# RXA

An lib to create an application which is based on React + Redux + Rxjs + Ramda + Reselect.
It supports developer to build React app faster.
## Cool features:
1. Support auto prefetch components
1. Support lazy module loading, dynamic actions
1. No reducer needed
1. Support async redux action
1. Simple action dispatching
1. Auto applying reselect to improve app rendering performance
1. Auto load/save app state using localStorage

## Examples:
1. <a href="#hello-world">Hello world</a>
1. <a href="#prefetchable-component">Prefetchable component</a>
1. <a href="#auto-loadsave-app-state">Auto load/save app state</a>

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
  // properties mapper, it receives 3 arguments state, actions, ownProps
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

### Prefetchable component
<a href="https://codesandbox.io/s/7j3x7qq5x0">codesandbox.io</a>
```jsx

import React from "react";
import { render } from "react-dom";
import { create } from "rxa";

// create app with intial state
const app = create({ user: "linq2js" }).action(
  "user", // state prop
  x => x.toLowerCase(),
  "updateUser" // action name
);

const userInfoConnect = app.connect(
  // extract user from store
  ({ user }) => ({ user }),
  // pass user to fetching action
  ({ user }) => user,
  // extract user from props and pass it to fetching action
  user => fetch(`https://api.github.com/users/${user}`).then(x => x.json())
);

// create user info component
const UserInfo = userInfoConnect(({ $fetch }) => (
  <div>
    <pre>
      {$fetch.error
        ? JSON.stringify($fetch.error)
        : $fetch.loading
          ? "Fetching user data"
          : JSON.stringify($fetch.payload, null, 4)}
    </pre>
    {$fetch.payload && (
      <a href={$fetch.payload.html_url} target="_blank">
        <img src={$fetch.payload.avatar_url} width={200} alt="User Avatar" />
      </a>
    )}
  </div>
));

const userInputConnect = app.connect(
  // extract user from store and updateUser from action collection
  ({ user }, { updateUser }) => ({ user, updateUser })
);

// create user input  component
const UserInput = userInputConnect(({ user, updateUser }) => (
  <input type="text" onChange={e => updateUser(e.target.value)} value={user} />
));

render(
  <app.Provider>
    <div>
      <UserInput />
      <UserInfo />
    </div>
  </app.Provider>,
  document.getElementById("root") || document.body
);

```
### Auto load/save app state
<a href="https://codesandbox.io/s/y2qqzxm19v">codesandbox.io</a>
```jsx

import React from "react";
import { render } from "react-dom";
import { create } from "rxa";

// create app with intial state
const app = create("appState", { counter: 0 })
  // register hello action
  .action("counter", () => getState => getState().counter + 1, "updateCounter");

// create connection
const counterConnect = app.connect(
  // properties mapper, it receives 3 arguments state, actions, ownProps
  ({ counter }, { updateCounter }) => ({
    counter,
    updateCounter
  })
);

const Counter = counterConnect(({ counter, updateCounter }) => (
  <button onClick={updateCounter}>Counter: {counter}</button>
));

render(
  <app.Provider>
    <Counter />
  </app.Provider>,
  document.getElementById("root") || document.body
);

```


## API References:
1. <a href="#create">create</a>
1. <a href="#app-action">app.action</a>
1. <a href="#app-actions">app.actions</a>
1. <a href="#app-actions">app.autoSave</a>
1. <a href="#app-connect">app.connect</a>
1. <a href="#app-debounce">app.debounce</a>
1. <a href="#app-dispatch">app.dispatch</a>
1. <a href="#app-getstate">app.getState</a>
1. <a href="#app-provider">app.Provider</a>
1. <a href="#app-reducers">app.reducers</a>
1. <a href="#app-selector">app.selector</a>
1. <a href="#app-subscribe">app.subscribe</a>
1. <a href="#app-test">app.test</a>

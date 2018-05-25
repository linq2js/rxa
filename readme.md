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
1. <a href="#hello-world">Hello world</a>
2. <a href="#prefetchable-component">Prefetchable component</a>

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
      <img src={$fetch.payload.avatar_url} width={200} alt="User Avatar" />
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

## API References:

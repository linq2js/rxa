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
1. <a href="https://codesandbox.io/s/74l5kzxyx0">Todo list</a>
1. <a href="https://codesandbox.io/s/8klzr8q558">$async usage</a>
1. <a href="https://codesandbox.io/s/ol7ylyqw5y">Free drawing component</a>
1. <a href="https://codesandbox.io/s/oj9kx80xrz">Dots game</a>
1. <a href="https://codesandbox.io/s/y3l52mrvp9">Huge Form (200 inputs)</a>
1. <a href="https://codesandbox.io/s/qk7jx80616">Form and react-select</a>

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
  document.getElementById("root") || document.body
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
  "updateUser:user", // state prop
  x => x.toLowerCase()
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
  .action("updateCounter:counter", () => ({ $current }) =>
    $current() + 1
  );

// create connection
const counterConnect = app.connect(
  // properties mapper, it retrieves 3 arguments state, actions, ownProps
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
1. <a href="#appaction">app.action</a>
1. <a href="#appactions">app.actions</a>
1. <a href="#appautosave">app.autoSave</a>
1. <a href="#appconnect">app.connect</a>
1. <a href="#appdebounce">app.debounce</a>
1. <a href="#appdispatch">app.dispatch</a>
1. <a href="#appgetstate">app.getState</a>
1. <a href="#appinvoke">app.invoke</a>
1. <a href="#appprovider">app.Provider</a>
1. <a href="#appreducer">app.reducer</a>
1. <a href="#appselector">app.selector</a>
1. <a href="#appsubscribe">app.subscribe</a>

### create
**create(initialState: object): app**<br/>
Create new application with initial state

**create(localStorageKey: string, defaultState: object): app**<br/>
Create new application and load state from localStorage with give key. If nothing loaded, defaultState will be used

### app.action
**app.action(statePropAndActionName: string, action: function): app**<br/>
Register new action. Action result will update to given state property name automatically. Supports object property path

**app.action(stateProp: string, action: function, actionName: string): app**<br/>
Register new action with specified actionName. Action result will update to given state property name automatically. Supports object property path

**app.action(stateProp: string, action: function, options: ActionOptions): app**<br/>
Register new action with specified options. Action result will update to given state property name automatically. Supports object property path. Available options:
- **single: bool** For async action only. Action only executes once at the same time. The previous execution will be stopped if there is new execution.
- **dispatchStatus** For async action only. Will dispatch executing status of this action when it is changed (loading, success, fail...).
```js
    app.connect((state, actions) => {
       const { submitAsync } = actions;
       console.log(submitAsync.status);
       console.log(submitAsync.loading);
       console.log(submitAsync.success);
       console.log(submitAsync.fail);
    });
``` 
Instead of returning a partial state object directly, an action can return a function that takes action collection. Action collection contains margin actions ($state, $current, $done, $fail, $success)
```js

app.action('test', () => ( actions ) => {
   const { $state, $current, $done, $fail, $success, $async } = actions;
   
   $state(); // get current state
   $current(); // get current state prop value
   $done(() => alert('done')); // execute callback once current action done
   $success(() => alert('success')); // execute callback once current action success
   $fail(() => alert('fail')); // execute callback once current action fail
   
   return fetch(url);
});

For $async magic action, see <a href="https://codesandbox.io/s/8klzr8q558">$async usage</a>

```


### app.actions
**app.actions(actionModel: object): app**<br/>
Register multiple actions at once
```js
    app.actions({
        username: x => x, // change user
        password: x => x, // change password
        __: [x => x, { single: true, name: 'submit' }], // register action with an options
        account: { // can register new action under specified action group/namespace
            create: x => x
        }
    });
``` 

### app.autoSave
**app.autoSave(): app**<br/>
Enable auto save with default options

**app.autoSave(localStorageKey: string): app**<br/>
Enable auto save with specified localStorageKey

**app.autoSave(options: object): app**<br/>
Enable auto save with an options. Available options:
- **key: string** localStorage key to be used for saving app state
- **debounce: number** specific debounce time to delay saving

### app.connect
**app.connect(propsMapper: (state, actions) => object): ReduxConnection**<br/>
Create Redux Connection with specified propsMapper

**app.connect(propsMapper: (state, actions) => object, prefetch: () => Promise: ReduxConnection**<br/>
Create Redux Connection with specified propsMapper and specific prefetch action. 

**app.connect(propsMapper: (state, actions) => object, prefetchArgsSelector: (props) => prefetchArgs, prefetch: prefetchArgs => Promise): ReduxConnection**<br/>
Create Redux Connection with specified propsMapper and specific prefetch action. prefetchArgsSelector will be called to select args for prefetch action 

See <a href="#prefetchable-component">Prefetchable component</a> for usage.

### app.debounce
**app.debounce(func: function, delay: number)**<br/>
Create debounced function wrapper with specified delay time

### app.dispatch
**app.dispatch(action): app**<br/>
Call redux store.dispatch(action)


### app.getState
**app.getState(): state**<br/>
Call redux store.getState()

### app.invoke

**app.Provider**<br/>
Return binded Redux Provider

### app.reducer
#### app.reducer(reducer: function)
Register redux reducer for special purpose


### app.selector
**app.selector(...args): Selector**<br/>
Call reselect.createSelector(...args)

### app.subscribe
**app.subscribe(state => any): Subscription**<br/>
Adds a change listener. It will be called any time an action is dispatched, and some part of the state tree may potentially have changed
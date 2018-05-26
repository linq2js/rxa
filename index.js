import React from "react";
import {connect, Provider} from "react-redux";
import {createStore, combineReducers} from "redux";
import {createSelector} from "reselect";
import {
    forEachObjIndexed as each,
    set,
    view,
    lensPath,
    equals,
    map,
    identity,
    contains
} from "ramda";

const noop = () => {
};
const cancellationToken = {};

function debounce(f, delay = 0) {
    let timerId;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(f, delay, ...args);
    };
}

function parsePath(path) {
    return path.split(/[.[\]]/);
}

/**
 * create lens from path
 */
function pathToLens(path) {
    return lensPath(parsePath(path));
}

function createCancellablePromise(promise) {
    if (promise.isCancellable) return promise;

    let ct;

    const cancellablePromise = promise.then(
        result => {
            if (ct) {
                return Promise.reject(ct);
            }
            return result;
        },
        reason => {
            return ct || reason;
        }
    );

    cancellablePromise.cancel = function (value = cancellationToken) {
        if (ct) return this;
        //console.log('cancelled');
        if (promise.abort) {
            promise.abort();
        }
        if (promise.cancel) {
            promise.cancel();
        }
        ct = value;
        return this;
    };

    cancellablePromise.isCancellable = true;

    return cancellablePromise;
}

export function create(initialState = {}, defState = {}) {
    let storageOptions = {};
    let autoSaveSubscription;

    function autoSave() {
        const state = store.getState();
        localStorage.setItem(storageOptions.key, JSON.stringify(state));
    }

    function subscribeAutoSave() {
        if (autoSaveSubscription) {
            autoSaveSubscription();
            if (!storageOptions.key) {
                return;
            }
        }
        autoSaveSubscription = store.subscribe(
            debounce(autoSave, storageOptions.debounce || 200)
        );
    }

    if (typeof initialState === "string") {
        storageOptions = {key: initialState};

        const serializedAppData = localStorage.getItem(storageOptions.key);
        if (serializedAppData) {
            initialState = JSON.parse(serializedAppData) || defState;
        } else {
            initialState = defState;
        }
    }

    function defaultReducer(state = initialState, action) {
        // extract action info
        const {[actionKey]: key, payload} = action;
        if (key) {
            // is merge action, merge state and payload
            // need to improve this logic, avoid update call if state is not changed
            if (key === "@") {
                // extract properties to compare
                const stateToCompare = map((v, k) => state[k], payload);
                if (equals(stateToCompare, payload)) {
                    return state;
                }

                return {
                    ...state,
                    ...payload
                };
            }

            // if there is any change with this key/prop, clone current state and apply the changes
            if (equals(view(pathToLens(key), state), payload)) return state;

            //console.log(action);

            return set(pathToLens(key), payload, state);
        }

        // call custom reducers if any
        return customReducer ? customReducer(state, action) : state;
    }

    // create random action key
    const actionKey = new Date().getTime().toString();
    const store = createStore(defaultReducer);

    subscribeAutoSave();

    function dispatch(action) {
        //console.log('[dispatch]', action);
        store.dispatch(action);
    }

    let actionWrappers = {
        /**
         * update state
         */
        $(changes = {}) {
            dispatch({
                type: "merge",
                [actionKey]: "@",
                payload: changes
            });
        }
    };

    let customReducer = null;

    function dummyDispatch() {
        dispatch({
            type: "@dummy",
            [actionKey]: "__dummy__",
            payload: Math.random() * new Date().getTime()
        });
    }

    function registerActions(parentKey, model) {
        each((x, k) => {
            const originalKey = k;
            const originalKeyParts = originalKey.split(":");
            let originalActionName;
            let options = {};

            // supports named actionName:stateProp
            if (originalKeyParts.length > 1) {
                k = originalKeyParts[1];
                originalActionName = originalKeyParts[0];
            }

            if (parentKey) {
                k = parentKey + "." + k;
            }

            // action setting can be Function or Array
            // prop: Function
            // prop: [actionName, Function]
            if (x instanceof Function || x instanceof Array) {
                // try to get action name
                let actionName = originalActionName || x.name || originalKey;

                if (x instanceof Array) {
                    options = x[1] || options;
                    if (typeof options === "string") {
                        options = {name: options};
                    }
                    actionName = options.name || actionName;

                    x = x[0];
                }

                const actionPath = (parentKey ? parentKey + "." : "") + actionName;
                // create action wrapper
                const actionWrapper = (...args) => {
                    const currentOptions = actionWrapper.options || options;
                    const dispatchQueue = [];
                    delete actionWrapper.options;

                    if (currentOptions.dispatchStatus) {
                        currentOptions.single = true;
                    }

                    // cancel prev executing
                    if (
                        currentOptions.single &&
                        actionWrapper.lastResult &&
                        actionWrapper.lastResult.cancel
                    ) {
                        actionWrapper.lastResult.cancel();
                    }

                    delete actionWrapper.lastResult;

                    function addToDispatchQueue(type, callback) {
                        dispatchQueue.push({type, callback});
                    }

                    function trigger(dispatchData, ...types) {
                        dispatchData && dispatch(dispatchData);

                        dispatchQueue.forEach(i => {
                            if (contains(i.type, types)) {
                                i.callback();
                            }
                        });
                    }

                    const dispatchStatus = !currentOptions.dispatchStatus
                        ? noop
                        : dummyDispatch;

                    let actionResult;
                    delete actionWrapper.error;
                    actionWrapper.executing = true;
                    actionWrapper.success = false;
                    actionWrapper.fail = false;

                    try {
                        actionResult = x(...args);

                        // is lazy call, (...args) => (getState, actions) => actionBody
                        if (actionResult instanceof Function) {
                            actionResult = actionResult({
                                ...actionWrappers,
                                $done: x => addToDispatchQueue("done", x),
                                $fail: x => addToDispatchQueue("fail", x),
                                $success: x => addToDispatchQueue("success", x),
                                $state: store.getState,
                                // provide get current value
                                $current: def => {
                                    const state = store.getState();
                                    const current = view(pathToLens(k), state);
                                    if (typeof current === "undefined") return def;
                                    return current;
                                }
                            });
                        }
                    } catch (ex) {
                        actionWrapper.fail = true;
                        actionWrapper.error = ex;
                        throw ex;
                    } finally {
                        actionWrapper.executing = false;
                    }

                    // is then-able object
                    if (actionResult && actionResult.then) {
                        actionWrapper.executing = true;

                        actionWrapper.lastResult = actionResult = createCancellablePromise(
                            actionResult
                        );

                        dispatchStatus();

                        // handle async action call
                        actionResult.then(
                            asyncResult => {
                                //console.log('[success]');
                                actionWrapper.success = true;
                                actionWrapper.executing = false;

                                trigger(
                                    {
                                        type: actionPath,
                                        [actionKey]: k,
                                        payload: asyncResult
                                    },
                                    "success",
                                    "done"
                                );

                                // make sure state changed if payload is undefined
                                if (typeof payload === "undefined") {
                                    dispatchStatus();
                                }
                            },
                            ex => {
                                if (ex === cancellationToken) return;
                                //console.log('[fail]');
                                actionWrapper.executing = false;
                                actionWrapper.fail = true;
                                actionWrapper.error = ex;
                                dispatchStatus();
                                trigger(null, "fail", "done");
                            }
                        );
                    } else {
                        actionWrapper.success = true;

                        // handle sync action call
                        trigger(
                            {
                                type: actionPath,
                                [actionKey]: k,
                                payload: actionResult
                            },
                            "done"
                        );
                    }

                    return actionResult;
                };

                Object.assign(actionWrapper, {
                    success: undefined,
                    fail: undefined,
                    executing: false,
                    with: options => (...args) => {
                        actionWrapper.options = options;
                        return actionWrapper(...args);
                    }
                });

                actionWrappers = set(
                    pathToLens(actionPath),
                    actionWrapper,
                    actionWrappers
                );
            } else {
                registerActions(k, x);
            }
        }, model);
    }

    const app = {
        /**
         * create provider
         */
        Provider: props => <Provider store={store}>{props.children}</Provider>,
        autoSave(options = {key: "appState"}) {
            if (typeof options === "string") {
                options = {key: options};
            }

            storageOptions = options;

            subscribeAutoSave();
            return app;
        },
        /**
         * connect component
         * connect(mapper, component)
         * connect(mapper, prefetch, component)
         * connect(mapper, [argsSelector, prefetch], component)
         */
        connect(...args) {
            if (args.length < 1) {
                throw new Error("Argument count mismatch");
            }
            let mapper, prefetch, prefetchArgsSelector;
            if (args.length === 1) {
                [mapper] = args;
            } else if (args.length === 2) {
                [mapper, prefetch] = args;
            } else if (args.length === 3) {
                [mapper, prefetchArgsSelector, prefetch] = args;
            }

            // prefetch enabled
            if (prefetch) {
                prefetch = createSelector(prefetch, identity);

                if (prefetchArgsSelector) {
                    prefetchArgsSelector = createSelector(prefetchArgsSelector, identity);
                }
            }

            // create selector to memoize props
            const reselect = createSelector(identity, props => {
                if (prefetch) {
                    let result = prefetchArgsSelector
                        ? prefetch(prefetchArgsSelector(props))
                        : prefetch();

                    if (result) {
                        if (!result.isFetchResult) {
                            if (result.then) {
                                // init fetching status
                                result.isFetchResult = true;
                                result.status = "loading";
                                result.loading = true;

                                // handle async fetching
                                result.then(
                                    x => {
                                        result.success = true;
                                        result.loading = false;
                                        result.status = "success";
                                        result.payload = x;
                                        dummyDispatch();
                                    },
                                    x => {
                                        result.fail = true;
                                        result.loading = false;
                                        result.status = "fail";
                                        result.payload = x;
                                        dummyDispatch();
                                    }
                                );
                            } else {
                                result = {
                                    isFetchResult: true,
                                    status: "success",
                                    success: true,
                                    payload: result
                                };
                            }
                        } else {
                            // do not touch
                        }
                    } else {
                        result = {
                            status: "success",
                            success: true,
                            payload: result
                        };
                    }

                    // clone fetching result to make sure mergedProps changed
                    if (result && result.then && (result.success || result.fail)) {
                        result = {
                            isFetchResult: true,
                            fail: result.fail,
                            success: result.success,
                            status: result.status,
                            payload: result.payload
                        };
                    }

                    props.$fetch = result;
                }
                return props;
            });
            const connection = connect(
                state => ({state}),
                null,
                ({state}, dispatchProps, ownProps) =>
                    reselect(mapper(state, actionWrappers, ownProps)) || ownProps
            );

            // add shortcut 'to'
            connection.to = connection;

            return connection;
        },
        /**
         * register single action
         */
        action(key, action, options) {
            if (!(action instanceof Function)) {
                options = action;
                action = identity;
            }

            registerActions(null, set(pathToLens(key), [action, options], {}));
            return app;
        },
        /**
         * add custom reducers. This is helpful for 3rd lib which need reducer (Router, Log...)
         */
        reducer(value) {
            customReducer =
                value instanceof Function ? value : combineReducers(value);
            return app;
        },
        /**
         * dispatch custom action
         */
        dispatch(...args) {
            dispatch(...args);
            return app;
        },
        debounce,
        /**
         *
         */
        subscribe(subscriber) {
            return store.subscribe((...args) =>
                subscriber(store.getState(), ...args)
            );
        },
        /**
         * register multiple actions
         */
        actions(model) {
            registerActions(null, model);
            return app;
        },
        /**
         * create new selector
         */
        selector(...args) {
            return createSelector(...args);
        },
        /**
         * get current state
         */
        getState() {
            return store.getState();
        },
        /**
         *
         */
        invoke(actionPath, ...args) {
            //console.log('[test]', actionPath);
            const action = view(pathToLens(actionPath), actionWrappers);
            return action(...args);
        }
    };

    return app;
}

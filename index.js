import React from 'react';
import {connect, Provider} from 'react-redux';
import {createStore, combineReducers} from 'redux';
import {createSelector} from 'reselect';
import {forEachObjIndexed as each, set, view, lensPath, equals, map, identity} from 'ramda';

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
        (result) => {
            if (ct) {
                return Promise.reject(ct);
            }
            return result;
        },
        (reason) => {
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

export function create(initialState = {}) {
    // create random action key
    const actionKey = new Date().getTime().toString();
    const store = createStore((state = initialState, action) => {
        // extract action info
        const {[actionKey]: key, payload} = action;
        if (key) {
            // is merge action, merge state and payload
            // need to improve this logic, avoid update call if state is not changed
            if (key === '@') {
                // extract properties to compare
                const stateToCompare = map((v, k) => state[k], payload);
                if (equals(stateToCompare, payload)) {
                    return state;
                }

                return {
                    ...state,
                    ...payload,
                };
            }

            // if there is any change with this key/prop, clone current state and apply the changes
            if (equals(view(pathToLens(key), state), payload)) return state;

            //console.log(action);

            return set(pathToLens(key), payload, state);
        }

        // call custom reducers if any
        return customReducers ? customReducers(state, action) : state;
    });

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
                type: 'merge',
                [actionKey]: '@',
                payload: changes,
            });
        },
    };

    let customReducers = null;

    function dummyDispatch() {
        dispatch({
            type: '@dummy',
            [actionKey]: '__dummy__',
            payload: Math.random() * new Date().getTime(),
        });
    }

    function registerActions(parentKey, model) {
        each((x, k) => {
            const originalKey = k;
            let options = {};
            if (parentKey) {
                k = parentKey + '.' + k;
            }

            // action setting can be Function or Array
            // prop: Function
            // prop: [actionName, Function]
            if (x instanceof Function || x instanceof Array) {
                let name = x.name || originalKey;

                if (x instanceof Array) {
                    options = x[1] || options;
                    if (typeof options === 'string') {
                        options = {name: options};
                    }
                    name = options.name || name;

                    x = x[0];
                }

                const actionPath = (parentKey ? parentKey + '.' : '') + name;
                // create action wrapper
                const actionWrapper = (...args) => {
                    const currentOptions = actionWrapper.options || options;
                    delete actionWrapper.options;

                    // cancel prev executing
                    if (currentOptions.single && actionWrapper.lastResult && actionWrapper.lastResult.cancel) {
                        actionWrapper.lastResult.cancel();
                    }

                    delete actionWrapper.lastResult;

                    const dispatchStatus = !currentOptions.dispatchStatus ? noop : dummyDispatch;

                    let actionResult;
                    delete actionWrapper.error;
                    actionWrapper.executing = true;
                    actionWrapper.success = false;
                    actionWrapper.fail = false;

                    try {
                        actionResult = x(...args);

                        // is lazy call, (...args) => (getState, actions) => actionBody
                        if (actionResult instanceof Function) {
                            actionResult = actionResult(store.getState, actionWrappers);
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

                        actionWrapper.lastResult = actionResult = createCancellablePromise(actionResult);

                        dispatchStatus();

                        // handle async action call
                        actionResult.then(
                            (asyncResult) => {
                                //console.log('[success]');
                                actionWrapper.success = true;
                                actionWrapper.executing = false;

                                dispatch({
                                    type: actionPath,
                                    [actionKey]: k,
                                    payload: asyncResult,
                                });

                                // make sure state changed if payload is undefined
                                if (typeof payload === 'undefined') {
                                    dispatchStatus();
                                }
                            },
                            (ex) => {
                                if (ex === cancellationToken) return;
                                //console.log('[fail]');
                                actionWrapper.executing = false;
                                actionWrapper.fail = true;
                                actionWrapper.error = ex;
                                dispatchStatus();
                            }
                        );
                    } else {
                        actionWrapper.success = true;

                        // handle sync action call
                        dispatch({
                            type: actionPath,
                            [actionKey]: k,
                            payload: actionResult,
                        });
                    }

                    return actionResult;
                };

                Object.assign(actionWrapper, {
                    success: undefined,
                    fail: undefined,
                    executing: false,
                    with: (options) => (...args) => {
                        actionWrapper.options = options;
                        return actionWrapper(...args);
                    },
                });

                actionWrappers = set(pathToLens(actionPath), actionWrapper, actionWrappers);
            } else {
                registerActions(k, x);
            }
        }, model);
    }

    const app = {
        /**
         * create provider
         */
        Provider: (props) => <Provider store={store}>{props.children}</Provider>,
        /**
         * connect component
         * connect(mapper, component)
         * connect(mapper, prefetch, component)
         * connect(mapper, [argsSelector, prefetch], component)
         */
        connect(...args) {
            if (args.length < 1) {
                throw new Error('Argument count mismatch');
            }
            let mapper, prefetch, prefetchArgsSelector;
            if (args.length === 1) {
                [mapper] = args;
            } else if (args.length === 2) {
                [mapper, prefetch] = args;
            } else if (args.length === 3) {
                [mapper, prefetch, prefetchArgsSelector] = args;
            }

            // prefetch enabled
            if (prefetch) {
                // support prefetch args selector
                if (prefetch instanceof Array) {
                    [prefetchArgsSelector, prefetch] = prefetch;
                }

                prefetch = createSelector(prefetch, identity);

                if (prefetchArgsSelector) {
                    prefetchArgsSelector = createSelector(prefetchArgsSelector, identity);
                }
            }

            // create selector to memoize props
            const reselect = createSelector((props) => {
                if (prefetch) {
                    let fetchResult = prefetchArgsSelector ? prefetch(prefetchArgsSelector(props)) : prefetch();

                    if (fetchResult) {
                        if (!fetchResult.isFetchResult) {
                            if (fetchResult.then) {
                                // init fetching status
                                fetchResult.isFetchResult = true;
                                fetchResult.status = 'loading';
                                fetchResult.loading = true;

                                // handle async fetching
                                fetchResult.then(
                                    (x) => {
                                        fetchResult.success = true;
                                        fetchResult.loading = false;
                                        fetchResult.status = 'success';
                                        fetchResult.payload = x;
                                        dummyDispatch();
                                    },
                                    (x) => {
                                        fetchResult.fail = true;
                                        fetchResult.loading = false;
                                        fetchResult.status = 'fail';
                                        fetchResult.payload = x;
                                        dummyDispatch();
                                    }
                                );
                            } else {
                                fetchResult = {
                                    isFetchResult: true,
                                    status: 'success',
                                    success: true,
                                    payload: fetchResult,
                                };
                            }
                        } else {
                            // do not touch
                        }
                    } else {
                        fetchResult = {
                            status: 'success',
                            success: true,
                            payload: fetchResult,
                        };
                    }

                    props.$fetch = fetchResult;
                }
                return props;
            }, identity);
            return connect(
                (state) => ({state}),
                null,
                ({state}, dispatchProps, ownProps) => reselect(mapper(state, actionWrappers, ownProps)) || ownProps
            );
        },
        /**
         * register single action
         */
        action(key, action, options) {
            registerActions(null, set(pathToLens(key), [action, options], {}));
            return app;
        },
        /**
         * add custom reducers. This is helpful for 3rd lib which need reducer (Router, Log...)
         */
        reducers(value) {
            customReducers = combineReducers(value);
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
            return store.subscribe((...args) => subscriber(store.getState(), ...args));
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
         * run test for specific action
         */
        test(actionPath, ...args) {
            //console.log('[test]', actionPath);
            const action = view(pathToLens(actionPath), actionWrappers);
            return action(...args);
        },
    };

    return app;
}

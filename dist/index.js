"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.create = create;

var _react = require("react");

var _react2 = _interopRequireDefault(_react);

var _reactRedux = require("react-redux");

var _redux = require("redux");

var _reselect = require("reselect");

var _ramda = require("ramda");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var noop = function noop() {};
var cancellationToken = {};

function debounce(f) {
    var delay = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    var timerId = void 0;
    return function () {
        clearTimeout(timerId);

        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        timerId = setTimeout.apply(undefined, [f, delay].concat(args));
    };
}

function parsePath(path) {
    return path.split(/[.[\]]/);
}

/**
 * create lens from path
 */
function pathToLens(path) {
    return (0, _ramda.lensPath)(parsePath(path));
}

function createCancellablePromise(promise) {
    if (promise.isCancellable) return promise;

    var ct = void 0;

    var cancellablePromise = promise.then(function (result) {
        if (ct) {
            return Promise.reject(ct);
        }
        return result;
    }, function (reason) {
        return ct || reason;
    });

    cancellablePromise.cancel = function () {
        var value = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : cancellationToken;

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

function create() {
    var initialState = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var defState = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    var storageOptions = {};
    var autoSaveSubscription = void 0;

    function autoSave() {
        var state = store.getState();
        localStorage.setItem(storageOptions.key, JSON.stringify(state));
    }

    function subscribeAutoSave() {
        if (autoSaveSubscription) {
            autoSaveSubscription();
            if (!storageOptions.key) {
                return;
            }
        }
        autoSaveSubscription = store.subscribe(debounce(autoSave, storageOptions.debounce || 200));
    }

    if (typeof initialState === "string") {
        storageOptions = { key: initialState };

        var serializedAppData = localStorage.getItem(storageOptions.key);
        if (serializedAppData) {
            initialState = JSON.parse(serializedAppData) || defState;
        } else {
            initialState = defState;
        }
    }

    function defaultReducer() {
        var state = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : initialState;
        var action = arguments[1];

        // extract action info
        var key = action[actionKey],
            payload = action.payload;

        if (key) {
            // is merge action, merge state and payload
            // need to improve this logic, avoid update call if state is not changed
            if (key === "@") {
                // extract properties to compare
                var stateToCompare = (0, _ramda.map)(function (v, k) {
                    return state[k];
                }, payload);
                if ((0, _ramda.equals)(stateToCompare, payload)) {
                    return state;
                }

                return _extends({}, state, payload);
            }

            // if there is any change with this key/prop, clone current state and apply the changes
            if ((0, _ramda.equals)((0, _ramda.view)(pathToLens(key), state), payload)) return state;

            //console.log(action);

            return (0, _ramda.set)(pathToLens(key), payload, state);
        }

        // call custom reducers if any
        return customReducer ? customReducer(state, action) : state;
    }

    // create random action key
    var actionKey = new Date().getTime().toString();
    var store = (0, _redux.createStore)(defaultReducer);

    subscribeAutoSave();

    function _dispatch3(action) {
        //console.log('[dispatch]', action);
        store.dispatch(action);
    }

    var actionWrappers = {
        /**
         * update state
         */
        $: function $() {
            var _dispatch;

            var changes = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

            _dispatch3((_dispatch = {
                type: "merge"
            }, _defineProperty(_dispatch, actionKey, "@"), _defineProperty(_dispatch, "payload", changes), _dispatch));
        }
    };

    var customReducer = null;

    function dummyDispatch() {
        var _dispatch2;

        _dispatch3((_dispatch2 = {
            type: "@dummy"
        }, _defineProperty(_dispatch2, actionKey, "__dummy__"), _defineProperty(_dispatch2, "payload", Math.random() * new Date().getTime()), _dispatch2));
    }

    function registerActions(parentKey, model) {
        (0, _ramda.forEachObjIndexed)(function (x, k) {
            var originalKey = k;
            var originalKeyParts = originalKey.split(":");
            var originalActionName = void 0;
            var options = {};

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
                var actionName = originalActionName || x.name || originalKey;

                if (x instanceof Array) {
                    options = x[1] || options;
                    if (typeof options === "string") {
                        options = { name: options };
                    }
                    actionName = options.name || actionName;

                    x = x[0];
                }

                var actionPath = (parentKey ? parentKey + "." : "") + actionName;
                // create action wrapper
                var actionWrapper = function actionWrapper() {
                    var currentOptions = actionWrapper.options || options;
                    var dispatchQueue = [];
                    delete actionWrapper.options;

                    if (currentOptions.dispatchStatus) {
                        currentOptions.single = true;
                    }

                    // cancel prev executing
                    if (currentOptions.single && actionWrapper.lastResult && actionWrapper.lastResult.cancel) {
                        actionWrapper.lastResult.cancel();
                    }

                    delete actionWrapper.lastResult;

                    function addToDispatchQueue(type, callback) {
                        dispatchQueue.push({ type: type, callback: callback });
                    }

                    function trigger(dispatchData) {
                        for (var _len2 = arguments.length, types = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                            types[_key2 - 1] = arguments[_key2];
                        }

                        dispatchData && _dispatch3(dispatchData);

                        dispatchQueue.forEach(function (i) {
                            if ((0, _ramda.contains)(i.type, types)) {
                                i.callback();
                            }
                        });
                    }

                    var dispatchStatus = !currentOptions.dispatchStatus ? noop : dummyDispatch;

                    var actionResult = void 0;
                    delete actionWrapper.error;
                    actionWrapper.executing = true;
                    actionWrapper.success = false;
                    actionWrapper.fail = false;

                    try {
                        actionResult = x.apply(undefined, arguments);

                        // is lazy call, (...args) => (getState, actions) => actionBody
                        if (actionResult instanceof Function) {
                            actionResult = actionResult(_extends({}, actionWrappers, {
                                $done: function $done(x) {
                                    return addToDispatchQueue("done", x);
                                },
                                $fail: function $fail(x) {
                                    return addToDispatchQueue("fail", x);
                                },
                                $success: function $success(x) {
                                    return addToDispatchQueue("success", x);
                                },
                                $state: store.getState,
                                // provide get current value
                                $current: function $current(def) {
                                    var state = store.getState();
                                    var current = (0, _ramda.view)(pathToLens(k), state);
                                    if (typeof current === "undefined") return def;
                                    return current;
                                }
                            }));
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
                        actionResult.then(function (asyncResult) {
                            var _trigger;

                            //console.log('[success]');
                            actionWrapper.success = true;
                            actionWrapper.executing = false;

                            trigger((_trigger = {
                                type: actionPath
                            }, _defineProperty(_trigger, actionKey, k), _defineProperty(_trigger, "payload", asyncResult), _trigger), "success", "done");

                            // make sure state changed if payload is undefined
                            if (typeof payload === "undefined") {
                                dispatchStatus();
                            }
                        }, function (ex) {
                            if (ex === cancellationToken) return;
                            //console.log('[fail]');
                            actionWrapper.executing = false;
                            actionWrapper.fail = true;
                            actionWrapper.error = ex;
                            dispatchStatus();
                            trigger(null, "fail", "done");
                        });
                    } else {
                        var _trigger2;

                        actionWrapper.success = true;

                        // handle sync action call
                        trigger((_trigger2 = {
                            type: actionPath
                        }, _defineProperty(_trigger2, actionKey, k), _defineProperty(_trigger2, "payload", actionResult), _trigger2), "done");
                    }

                    return actionResult;
                };

                Object.assign(actionWrapper, {
                    success: undefined,
                    fail: undefined,
                    executing: false,
                    with: function _with(options) {
                        return function () {
                            actionWrapper.options = options;
                            return actionWrapper.apply(undefined, arguments);
                        };
                    }
                });

                actionWrappers = (0, _ramda.set)(pathToLens(actionPath), actionWrapper, actionWrappers);
            } else {
                registerActions(k, x);
            }
        }, model);
    }

    var app = {
        /**
         * create provider
         */
        Provider: function Provider(props) {
            return _react2.default.createElement(
                _reactRedux.Provider,
                { store: store },
                props.children
            );
        },
        autoSave: function autoSave() {
            var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : { key: "appState" };

            if (typeof options === "string") {
                options = { key: options };
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
        connect: function connect() {
            for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
                args[_key3] = arguments[_key3];
            }

            if (args.length < 1) {
                throw new Error("Argument count mismatch");
            }
            var mapper = void 0,
                prefetch = void 0,
                prefetchArgsSelector = void 0;
            if (args.length === 1) {
                var _args = _slicedToArray(args, 1);

                mapper = _args[0];
            } else if (args.length === 2) {
                var _args2 = _slicedToArray(args, 2);

                mapper = _args2[0];
                prefetch = _args2[1];
            } else if (args.length === 3) {
                var _args3 = _slicedToArray(args, 3);

                mapper = _args3[0];
                prefetchArgsSelector = _args3[1];
                prefetch = _args3[2];
            }

            // prefetch enabled
            if (prefetch) {
                prefetch = (0, _reselect.createSelector)(prefetch, _ramda.identity);

                if (prefetchArgsSelector) {
                    prefetchArgsSelector = (0, _reselect.createSelector)(prefetchArgsSelector, _ramda.identity);
                }
            }

            // create selector to memoize props
            var reselect = (0, _reselect.createSelector)(_ramda.identity, function (props) {
                if (prefetch) {
                    var result = prefetchArgsSelector ? prefetch(prefetchArgsSelector(props)) : prefetch();

                    if (result) {
                        if (!result.isFetchResult) {
                            if (result.then) {
                                // init fetching status
                                result.isFetchResult = true;
                                result.status = "loading";
                                result.loading = true;

                                // handle async fetching
                                result.then(function (x) {
                                    result.success = true;
                                    result.loading = false;
                                    result.status = "success";
                                    result.payload = x;
                                    dummyDispatch();
                                }, function (x) {
                                    result.fail = true;
                                    result.loading = false;
                                    result.status = "fail";
                                    result.payload = x;
                                    dummyDispatch();
                                });
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
            var connection = (0, _reactRedux.connect)(function (state) {
                return { state: state };
            }, null, function (_ref, dispatchProps, ownProps) {
                var state = _ref.state;
                return reselect(mapper(state, actionWrappers, ownProps)) || ownProps;
            });

            // add shortcut 'to'
            connection.to = connection;

            return connection;
        },

        /**
         * register single action
         */
        action: function action(key, _action, options) {
            if (!(_action instanceof Function)) {
                options = _action;
                _action = _ramda.identity;
            }

            registerActions(null, (0, _ramda.set)(pathToLens(key), [_action, options], {}));
            return app;
        },

        /**
         * add custom reducers. This is helpful for 3rd lib which need reducer (Router, Log...)
         */
        reducer: function reducer(value) {
            customReducer = value instanceof Function ? value : (0, _redux.combineReducers)(value);
            return app;
        },

        /**
         * dispatch custom action
         */
        dispatch: function dispatch() {
            _dispatch3.apply(undefined, arguments);
            return app;
        },

        debounce: debounce,
        /**
         *
         */
        subscribe: function subscribe(subscriber) {
            return store.subscribe(function () {
                for (var _len4 = arguments.length, args = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
                    args[_key4] = arguments[_key4];
                }

                return subscriber.apply(undefined, [store.getState()].concat(args));
            });
        },

        /**
         * register multiple actions
         */
        actions: function actions(model) {
            registerActions(null, model);
            return app;
        },

        /**
         * create new selector
         */
        selector: function selector() {
            return _reselect.createSelector.apply(undefined, arguments);
        },

        /**
         * get current state
         */
        getState: function getState() {
            return store.getState();
        },

        /**
         *
         */
        invoke: function invoke(actionPath) {
            //console.log('[test]', actionPath);
            var action = (0, _ramda.view)(pathToLens(actionPath), actionWrappers);

            for (var _len5 = arguments.length, args = Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
                args[_key5 - 1] = arguments[_key5];
            }

            return action.apply(undefined, _toConsumableArray(args));
        }
    };

    return app;
}
//# sourceMappingURL=index.js.map
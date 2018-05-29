"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.fieldArray = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.create = create;
exports.Field = Field;
exports.form = form;
exports.validateForm = validateForm;

var _react = require("react");

var _react2 = _interopRequireDefault(_react);

var _reactRedux = require("react-redux");

var _redux = require("redux");

var _reselect = require("reselect");

var _ramda = require("ramda");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

var noop = function noop() {};
var cancellationToken = {};
var fieldArrayMethods = "append prepend push pop shift unshift remove removeAt sort swap removeAll move".split(" ");

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
    return path.toString().split(/[.[\]]/);
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

    function _dispatch5(action) {
        //console.log('[dispatch]', action);
        store.dispatch(action);
    }

    var actionWrappers = {
        /**
         * get/update state
         */
        $state: function $state(changes) {
            if (arguments.length < 1) return store.getState();
            if (changes) {
                var _dispatch;

                _dispatch5((_dispatch = {
                    type: "merge"
                }, _defineProperty(_dispatch, actionKey, "@"), _defineProperty(_dispatch, "payload", changes), _dispatch));
            }
        }
    };

    var customReducer = null;

    function dummyDispatch() {
        var _dispatch2;

        _dispatch5((_dispatch2 = {
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

                        dispatchData && _dispatch5(dispatchData);

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
                                $async: function $async(promise) {
                                    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                                    if (promise && promise.then) {
                                        promise.__asyncOptions = options;
                                    }
                                    return promise;
                                },

                                $done: function $done(x) {
                                    return addToDispatchQueue("done", x);
                                },
                                $fail: function $fail(x) {
                                    return addToDispatchQueue("fail", x);
                                },
                                $success: function $success(x) {
                                    return addToDispatchQueue("success", x);
                                },
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
                        var asyncOptions = actionResult.__asyncOptions;

                        actionWrapper.executing = true;

                        actionWrapper.lastResult = actionResult = createCancellablePromise(actionResult);

                        if (asyncOptions && "loading" in asyncOptions) {
                            var _dispatch3;

                            _dispatch5((_dispatch3 = {
                                type: actionPath
                            }, _defineProperty(_dispatch3, actionKey, k), _defineProperty(_dispatch3, "payload", asyncOptions.loading), _dispatch3));
                        }

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
                            if (typeof asyncResult === "undefined") {
                                dispatchStatus();
                            }
                        }, function (ex) {
                            if (ex === cancellationToken) return;
                            //console.log('[fail]');
                            actionWrapper.executing = false;
                            actionWrapper.fail = true;
                            actionWrapper.error = ex;

                            if (asyncOptions && "fail" in asyncOptions) {
                                var _dispatch4;

                                _dispatch5((_dispatch4 = {
                                    type: actionPath
                                }, _defineProperty(_dispatch4, actionKey, k), _defineProperty(_dispatch4, "payload", asyncOptions.fail), _dispatch4));
                            }

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

                var actionLens = pathToLens(actionPath);

                actionWrappers = (0, _ramda.set)(actionLens, actionWrapper, actionWrappers);

                if (!(0, _ramda.view)(actionLens, app)) {
                    Object.assign(app, actionWrappers);
                }
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
            _dispatch5.apply(undefined, arguments);
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

/**
 * Component wrapper for field rendering
 */
function Field(_ref2) {
    var $binder = _ref2.$binder,
        $name = _ref2.$name,
        Comp = _ref2.$comp,
        $props = _ref2.$props,
        customProps = _objectWithoutProperties(_ref2, ["$binder", "$name", "$comp", "$props"]);

    if (!$binder || !$name || !Comp) return null;
    return $binder($name, function (params) {
        return _react2.default.createElement(Comp, _extends({}, params.props, $props && $props(_extends({ name: $name, comp: Comp }, params)), customProps));
    });
}

/**
 * Create form
 */
function form() {
    var formMeta = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    var data = arguments[1];
    var formRender = arguments[2];

    var initialData = data;

    return formRender({
        meta: formMeta,
        props: {
            onReset: function onReset(e) {
                if (e && e.preventDefault) {
                    e.preventDefault();
                }

                if (formMeta.initialData) {
                    formChangeWrapper(formMeta.initialData, formMeta.initialData, { onChange: formMeta.onChange }, "value");
                }
            },
            onSubmit: function onSubmit(e) {
                if (e && e.preventDefault) {
                    e.preventDefault();
                }

                formSubmitWrapper(data, formMeta);
            }
        },
        /**
         * process field array
         */
        fieldArray: function fieldArray(fieldName, method) {
            for (var _len6 = arguments.length, args = Array(_len6 > 2 ? _len6 - 2 : 0), _key6 = 2; _key6 < _len6; _key6++) {
                args[_key6 - 2] = arguments[_key6];
            }

            return _fieldArray({
                meta: formMeta,
                data: data,
                onChange: function onChange(newData, newMeta, changeType) {
                    formChangeWrapper(initialData, newData, newMeta, changeType);
                }
            }, fieldName, method, args);
        },

        // process single field
        field: function field(fieldName, fieldRender) {
            var fieldLens = pathToLens(fieldName);
            var fieldView = (0, _ramda.view)(fieldLens);
            var fieldMeta = fieldView(formMeta.fields);

            function updateValue(newValue, triggerChange) {
                data = (0, _ramda.set)(fieldLens, newValue, data);
                fieldMeta.dirty = true;
                formMeta.dirty = true;
                if (triggerChange) {
                    formChangeWrapper(initialData, data, formMeta, "value");
                }
            }

            function updateMeta(newMeta, triggerChange) {
                formMeta.fields = (0, _ramda.set)(fieldLens, fieldMeta = newMeta, formMeta.fields);

                if (triggerChange) {
                    formChangeWrapper(initialData, data, formMeta, "meta");
                }
            }

            // field(name): fieldMeta
            if (arguments.length === 1) {
                return {
                    // value getter/setter
                    value: function value(newValue) {
                        if (!arguments.length) return (0, _ramda.view)(fieldLens, data);
                        updateValue(newValue, true);
                    },

                    // meta getter/setter
                    meta: function meta(newMeta) {
                        if (!arguments.length) return fieldMeta || {};
                        if (typeof newMeta === "string") {
                            return (fieldMeta || {})[newMeta];
                        }
                        updateMeta(newMeta, true);
                    }
                };
            }

            if (!fieldMeta) {
                // mutate fields, dont fire meta change event to improve performance
                updateMeta({
                    type: "field"
                });
            }

            return renderField({
                name: fieldName,
                meta: fieldMeta,
                data: data,
                render: fieldRender,
                onMetaChange: function onMetaChange(newMeta) {
                    updateMeta(newMeta, true);
                },
                onValueChange: function onValueChange(newValue) {
                    updateValue(newValue, true);
                }
            });
        }
    });
}

function renderField(_ref3) {
    var name = _ref3.name,
        fieldMeta = _ref3.meta,
        formData = _ref3.data,
        render = _ref3.render,
        onMetaChange = _ref3.onMetaChange,
        onValueChange = _ref3.onValueChange;

    var fieldView = (0, _ramda.view)(pathToLens(name));
    var fieldValue = fieldView(formData);
    return render({
        name: name,
        props: {
            onFocus: function onFocus() {
                fieldMeta.touched = true;
                fieldMeta.focus = true;
                onMetaChange(fieldMeta);
            },
            onChange: function onChange(e) {
                var value = e && e.stopPropagation instanceof Function ? e.target.value : e;
                onValueChange(value);
            },
            onBlur: function onBlur() {
                fieldMeta.focus = false;
                onMetaChange(fieldMeta);
            },

            value: fieldValue
        },
        meta: fieldMeta,
        value: fieldValue
    });
}

var FormMessage = function FormMessage(data) {
    var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "error";

    _classCallCheck(this, FormMessage);

    this.data = data;
    this.type = type;
};

/**
 * validate form
 */


function validateForm(_ref4) {
    var formData = _ref4.data,
        formMeta = _ref4.meta,
        onValidate = _ref4.onValidate,
        _ref4$onChange = _ref4.onChange,
        onChange = _ref4$onChange === undefined ? noop : _ref4$onChange;

    return new Promise(function (formValidationResolve) {
        var validatingFieldCount = 0;
        var validationCancelled = false;

        formMeta.validating = false;
        formMeta.invalid = false;
        formMeta.valid = true;
        delete formMeta.error;
        delete formMeta.warning;

        // cancel prev validation
        if (formMeta.cancelValidation instanceof Function) {
            formMeta.cancelValidation();
        }

        formMeta.cancelValidation = function () {
            validationCancelled = true;
        };

        // clear field validation
        forEachField(formMeta.fields, false, function (f) {
            delete f.info;
            delete f.error;
            delete f.warning;
            f.validating = false;
        });

        if (!onValidate) return;

        function updateValidationStatus(tryToTriggerMetaChange) {
            formMeta.validating = !!validatingFieldCount;

            // collect form warning/error
            forEachField(formMeta.fields, true, function (f) {
                if (!formMeta.error && f.error) {
                    formMeta.error = f.error;
                    formMeta.invalid = true;
                    formMeta.valid = false;
                }
                if (!formMeta.warning && f.warning) {
                    formMeta.warning = f.warning;
                    return false;
                }

                if (formMeta.error && formMeta.warning) {
                    return false;
                }
            });

            if (tryToTriggerMetaChange && !validationCancelled) {
                if (formMeta.validating) {
                    onChange(_extends({}, formMeta), "meta");
                } else {
                    formValidationResolve(_extends({}, formMeta));
                }
            }
        }

        onValidate({
            data: formData,
            meta: formMeta,
            warning: function warning(error) {
                return new FormMessage(error, "warning");
            },
            info: function info(error) {
                return new FormMessage(error, "info");
            },
            validate: function validate(field, error) {
                var messageType = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : "error";

                return new Promise(function (fieldValidationResolve) {
                    if (error) {
                        // extract error from warning
                        if (error instanceof FormMessage) {
                            messageType = error.type;
                            error = error.data;
                        }

                        var fieldMeta = field ? (0, _ramda.view)(pathToLens(field), formMeta.fields) : formMeta;

                        //console.log(fieldMeta, field, error);

                        if (error.then) {
                            var done = function done(asyncError) {
                                if (asyncError instanceof FormMessage) {
                                    messageType = asyncError.type;
                                    asyncError = asyncError.data;
                                }

                                validatingFieldCount--;
                                fieldMeta.validating = false;
                                fieldMeta[messageType] = asyncError;
                                fieldValidationResolve(!asyncError);
                                updateValidationStatus(true);
                            };

                            validatingFieldCount++;

                            error.then(function () {
                                return done();
                            }, done);
                        } else {
                            fieldMeta[messageType] = error;
                            fieldValidationResolve(false);
                            updateValidationStatus();
                        }
                    } else {
                        fieldValidationResolve(true);
                    }
                });
            }
        });

        updateValidationStatus(true);
    });
}

/**
 * handle form submitting
 */
function formSubmitWrapper(formData, _ref5) {
    var onChange = _ref5.onChange,
        onSubmit = _ref5.onSubmit,
        onValidate = _ref5.onValidate,
        formMeta = _objectWithoutProperties(_ref5, ["onChange", "onSubmit", "onValidate"]);

    if (!onSubmit) return;

    if (formData.validateOnSubmit) {
        var handleMetaChange = function handleMetaChange(newMeta) {
            onChange(formData, newMeta, "meta");
        };

        validateForm({
            data: formData,
            meta: formMeta,
            onChange: handleMetaChange,
            onValidate: onValidate
        }).then(handleMetaChange);
    } else {
        onSubmit(formData, formMeta);
    }
}

/**
 * handle change and validation
 */
function formChangeWrapper(initialData, formData, _ref6, changeType) {
    var onChange = _ref6.onChange,
        onSubmit = _ref6.onSubmit,
        onValidate = _ref6.onValidate,
        formMeta = _objectWithoutProperties(_ref6, ["onChange", "onSubmit", "onValidate"]);

    if (changeType === "value") {
        if (!formMeta.validateOnSubmit) {
            var handleMetaChange = function handleMetaChange(newMeta) {
                onChange(formData, newMeta, "meta");
            };

            validateForm({
                data: formData,
                meta: formMeta,
                onChange: handleMetaChange,
                onValidate: onValidate
            }).then(handleMetaChange);
        }

        if (!formMeta.initialData) {
            formMeta.initialData = initialData;
        }
    }

    onChange(formData, formMeta, changeType);
}

function forEachField(fields, deep, callback) {
    var cancel = false;

    function processField(field, name) {
        if (field.type === "field") {
            if (callback(field, name) === false) return false;
            if (deep) {
                // is field array
                if (field.items) {
                    cancel = field.items.some(function (sf, i) {
                        return processField(sf, i) === false;
                    });
                }
                // is sub form
                if (field.fields) {
                    cancel = forEachField(field.fields, true, callback) === false;
                }
            }
        }
    }

    (0, _ramda.forEachObjIndexed)(function (f, n) {
        if (cancel) return;
        cancel = processField(f, n) === false;
    }, fields);

    return !cancel;
}

function _fieldArray(options, fieldName, method) {
    for (var _len7 = arguments.length, args = Array(_len7 > 3 ? _len7 - 3 : 0), _key7 = 3; _key7 < _len7; _key7++) {
        args[_key7 - 3] = arguments[_key7];
    }

    var _value, _value2, _value3;

    var formMeta = options.meta,
        formData = options.data,
        _options$onChange = options.onChange,
        onChange = _options$onChange === undefined ? noop : _options$onChange;

    if (!method) {
        // create an executor for field array
        var executor = {};

        fieldArrayMethods.forEach(function (x) {
            return executor[x] = function () {
                for (var _len8 = arguments.length, args = Array(_len8), _key8 = 0; _key8 < _len8; _key8++) {
                    args[_key8] = arguments[_key8];
                }

                return _fieldArray.apply(undefined, [options, fieldName, x].concat(args));
            };
        });
        return executor;
    }

    var fieldLens = pathToLens(fieldName);
    var value = (0, _ramda.view)(fieldLens, formData);

    var fieldMeta = (0, _ramda.view)(fieldLens, formMeta.fields);
    if (!fieldMeta) {
        // mutate fields, dont fire meta change event to improve performance
        formMeta.fields = (0, _ramda.set)(fieldLens, fieldMeta = {
            type: "field"
        }, formMeta.fields);
    }

    if (!(value instanceof Array)) {
        value = value === null || value === undefined ? [] : [value];
        if (!method) return value;
    } else {
        if (!method) return value;
        value = [].concat(_toConsumableArray(value));
    }

    if (!fieldMeta.items) {
        // create item meta
        fieldMeta.items = value.map(function () {
            return {
                type: "field"
            };
        });
    }

    // is render
    if (method instanceof Function) {
        return value.map(function (item, index) {
            function onMetaChange(subMeta) {
                fieldMeta.items = [].concat(_toConsumableArray(fieldMeta.items));
                fieldMeta.items[index] = subMeta;

                onChange(formData, formMeta, "meta");
            }

            function onValueChange(subValue) {
                var copyOfValue = [].concat(_toConsumableArray(value));
                copyOfValue[index] = subValue;
                formData = (0, _ramda.set)(fieldLens, copyOfValue, formData);
                fieldMeta.dirty = true;
                formMeta.dirty = true;
                onChange(formData, formMeta, "value");
            }

            return renderField({
                name: index,
                data: value,
                render: method,
                onMetaChange: onMetaChange,
                onValueChange: onValueChange,
                meta: _extends({}, fieldMeta.items[index], {
                    // sub form methods
                    onSubmit: function onSubmit(subData, subMeta) {
                        // do nothing
                    },
                    onChange: function onChange(subData, subMeta, changeType) {
                        if (changeType === "meta") {
                            onMetaChange(subMeta);
                        } else if (changeType === "value") {
                            onValueChange(subData);
                        }
                    }
                })
            });
        });
    } else {
        var metaItems = [].concat(_toConsumableArray(fieldMeta.items));

        // support custom methods
        switch (method) {
            case "removeAt":
                value.splice(args[0], 1);
                metaItems.splice(args[0]);
                break;
            case "remove":
                var indexesToRemove = [];
                value = value.filter(function (x, i) {
                    if (x === args[0]) {
                        indexesToRemove.push(i);
                        return false;
                    }
                    return true;
                });
                // remove metadata
                while (indexesToRemove.length) {
                    metaItems.splice(indexesToRemove.pop(), 1);
                }
                break;
            case "shift":
                metaItems.shift();
                value.shift();
                break;
            case "pop":
                metaItems.pop();
                value.pop();
                break;
            case "prepend":
            case "unshift":
                metaItems.unshift.apply(metaItems, _toConsumableArray(args.map(function () {
                    return {
                        type: "field"
                    };
                })));
                (_value = value).unshift.apply(_value, args);
                break;
            case "append":
            case "push":
                metaItems.push.apply(metaItems, _toConsumableArray(args.map(function () {
                    return {
                        type: "field"
                    };
                })));
                (_value2 = value).push.apply(_value2, args);
                break;
            case "move":
                {
                    var fromIndex = args[0],
                        toIndex = args[1];

                    if (fromIndex < 0 || fromIndex >= value.length) {
                        throw new Error("fromIndex is not valid");
                    }
                    if (toIndex < 0 || toIndex >= value.length) {
                        throw new Error("toIndex is not valid");
                    }

                    if (fromIndex === toIndex) {
                        return;
                    }

                    // move down: insert first -> then remove
                    if (toIndex > fromIndex) {
                        metaItems.splice(toIndex + 1, 0, metaItems[fromIndex]);
                        metaItems.splice(fromIndex, 1);

                        value.splice(toIndex + 1, 0, value[fromIndex]);
                        value.splice(fromIndex, 1);
                    } else {
                        // move up: remove first -> then insert
                        metaItems.splice(toIndex, 0, metaItems.splice(fromIndex, 1)[0]);
                        value.splice(toIndex, 0, value.splice(fromIndex, 1)[0]);
                    }
                }
                break;
            case "swap":
                {
                    var sourceIndex = args[0],
                        targetIndex = args[1];

                    if (sourceIndex < 0 || sourceIndex >= value.length) {
                        throw new Error("sourceIndex is not valid");
                    }
                    if (targetIndex < 0 || targetIndex >= value.length) {
                        throw new Error("targetIndex is not valid");
                    }

                    if (sourceIndex === targetIndex) {
                        return;
                    }

                    var tempMeta = metaItems[sourceIndex];
                    metaItems[sourceIndex] = metaItems[targetIndex];
                    metaItems[targetIndex] = tempMeta;

                    var tempItem = value[sourceIndex];
                    value[sourceIndex] = value[targetIndex];
                    value[targetIndex] = tempItem;
                }

                break;
            case "insert":
                var index = args[0],
                    newItems = args.slice(1);

                index = index < 0 ? 0 : index > value.length ? value.length : index;
                metaItems.splice.apply(metaItems, [index, 0].concat(_toConsumableArray(newItems)));
                (_value3 = value).splice.apply(_value3, [index, 0].concat(_toConsumableArray(newItems)));
                break;
            case "removeAll":
                metaItems.splice(0, metaItems.length);
                value.splice(0, value.length);
                break;
            case "sort":
                // combine all meta/data to pair list
                var pairs = value.map(function (x, i) {
                    return {
                        data: x,
                        meta: metaItems[i]
                    };
                });
                // suport sort by expression: prop:direction
                var sortExpression = typeof args[0] === "string" ? args[0].split(":") : null;
                // sort uses comparator, ascend by default
                var propSelector = sortExpression ? (0, _ramda.prop)(sortExpression[0]) : args[0] || _ramda.identity;
                var inputComparator = sortExpression && sortExpression.length > 1 ? sortExpression[1] : args[1];

                var comparator = inputComparator === "asc" ? _ramda.ascend : inputComparator === "desc" ? _ramda.descend : inputComparator || _ramda.ascend;
                var sortedPairs = (0, _ramda.sort)(comparator((0, _ramda.compose)(propSelector, (0, _ramda.prop)("data"))), pairs);
                // extract meta and data
                sortedPairs.forEach(function (x, i) {
                    metaItems[i] = x.meta;
                    value[i] = x.data;
                });
                break;
            default:
                throw new Error("fieldArray does not support \"" + method + "\"");
        }

        formData = (0, _ramda.set)(fieldLens, value, formData);

        formMeta.fields = (0, _ramda.set)(fieldLens, fieldMeta = _extends({}, fieldMeta, {
            items: metaItems
        }), formMeta.fields);
        formMeta.dirty = true;

        onChange(formData, formMeta, "value");
    }
}
exports.fieldArray = _fieldArray;
//# sourceMappingURL=index.js.map
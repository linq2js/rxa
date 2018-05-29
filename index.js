import React from "react";
import {connect, Provider} from "react-redux";
import {createStore, combineReducers} from "redux";
import {createSelector} from "reselect";
import {
    forEachObjIndexed,
    set,
    view,
    lensPath,
    equals,
    map,
    identity,
    contains,
    ascend,
    descend,
    compose,
    prop,
    sort
} from "ramda";

const noop = () => {
};
const cancellationToken = {};
const fieldArrayMethods = "append prepend push pop shift unshift remove removeAt sort swap removeAll move".split(
    " "
);

function debounce(f, delay = 0) {
    let timerId;
    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(f, delay, ...args);
    };
}

function parsePath(path) {
    return path.toString().split(/[.[\]]/);
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
         * get/update state
         */
        $state(changes) {
            if (arguments.length < 1) return store.getState();
            if (changes) {
                dispatch({
                    type: "merge",
                    [actionKey]: "@",
                    payload: changes
                });
            }
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
        forEachObjIndexed((x, k) => {
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
                                $async(promise, options = {}) {
                                    if (promise && promise.then) {
                                        promise.__asyncOptions = options;
                                    }
                                    return promise;
                                },
                                $done: x => addToDispatchQueue("done", x),
                                $fail: x => addToDispatchQueue("fail", x),
                                $success: x => addToDispatchQueue("success", x),
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
                        const asyncOptions = actionResult.__asyncOptions;

                        actionWrapper.executing = true;

                        actionWrapper.lastResult = actionResult = createCancellablePromise(
                            actionResult
                        );

                        if (asyncOptions && "loading" in asyncOptions) {
                            dispatch({
                                type: actionPath,
                                [actionKey]: k,
                                payload: asyncOptions.loading
                            });
                        }

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
                                if (typeof asyncResult === "undefined") {
                                    dispatchStatus();
                                }
                            },
                            ex => {
                                if (ex === cancellationToken) return;
                                //console.log('[fail]');
                                actionWrapper.executing = false;
                                actionWrapper.fail = true;
                                actionWrapper.error = ex;

                                if (asyncOptions && "fail" in asyncOptions) {
                                    dispatch({
                                        type: actionPath,
                                        [actionKey]: k,
                                        payload: asyncOptions.fail
                                    });
                                }

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

                const actionLens = pathToLens(actionPath);

                actionWrappers = set(actionLens, actionWrapper, actionWrappers);

                if (!view(actionLens, app)) {
                    Object.assign(app, actionWrappers);
                }
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

/**
 * Component wrapper for field rendering
 */
export function Field({$binder, $name, $comp: Comp, $props, ...customProps}) {
    if (!$binder || !$name || !Comp) return null;
    return $binder($name, params => (
        <Comp
            {...params.props}
            {...$props && $props({name: $name, comp: Comp, ...params})}
            {...customProps}
        />
    ));
}

/**
 * Create form
 */
export function form(formMeta = {}, data, formRender) {
    const initialData = data;

    return formRender({
        meta: formMeta,
        props: {
            onReset(e) {
                if (e && e.preventDefault) {
                    e.preventDefault();
                }

                if (formMeta.initialData) {
                    formChangeWrapper(
                        formMeta.initialData,
                        formMeta.initialData,
                        {onChange: formMeta.onChange},
                        "value"
                    );
                }
            },
            onSubmit(e) {
                if (e && e.preventDefault) {
                    e.preventDefault();
                }

                formSubmitWrapper(data, formMeta);
            }
        },
        /**
         * process field array
         */
        fieldArray(fieldName, method, ...args) {
            return fieldArray(
                {
                    meta: formMeta,
                    data,
                    onChange(newData, newMeta, changeType) {
                        formChangeWrapper(initialData, newData, newMeta, changeType);
                    }
                },
                fieldName,
                method,
                args
            );
        },
        // process single field
        field(fieldName, fieldRender) {
            const fieldLens = pathToLens(fieldName);
            const fieldView = view(fieldLens);
            let fieldMeta = fieldView(formMeta.fields);

            function updateValue(newValue, triggerChange) {
                data = set(fieldLens, newValue, data);
                fieldMeta.dirty = true;
                formMeta.dirty = true;
                if (triggerChange) {
                    formChangeWrapper(initialData, data, formMeta, "value");
                }
            }

            function updateMeta(newMeta, triggerChange) {
                formMeta.fields = set(
                    fieldLens,
                    (fieldMeta = newMeta),
                    formMeta.fields
                );

                if (triggerChange) {
                    formChangeWrapper(initialData, data, formMeta, "meta");
                }
            }

            // field(name): fieldMeta
            if (arguments.length === 1) {
                return {
                    // value getter/setter
                    value(newValue) {
                        if (!arguments.length) return view(fieldLens, data);
                        updateValue(newValue, true);
                    },
                    // meta getter/setter
                    meta(newMeta) {
                        if (!arguments.length) return fieldMeta;
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
                onMetaChange(newMeta) {
                    updateMeta(newMeta, true);
                },
                onValueChange(newValue) {
                    updateValue(newValue, true);
                }
            });
        }
    });
}

function renderField({
                         name,
                         meta: fieldMeta,
                         data: formData,
                         render,
                         onMetaChange,
                         onValueChange
                     }) {
    const fieldView = view(pathToLens(name));
    const fieldValue = fieldView(formData);
    return render({
        name,
        props: {
            onFocus() {
                fieldMeta.touched = true;
                fieldMeta.focus = true;
                onMetaChange(fieldMeta);
            },
            onChange(e) {
                const value =
                    e && e.stopPropagation instanceof Function ? e.target.value : e;
                onValueChange(value);
            },
            onBlur() {
                fieldMeta.focus = false;
                onMetaChange(fieldMeta);
            },
            value: fieldValue
        },
        meta: fieldMeta,
        value: fieldValue
    });
}

class FormWarning {
    constructor(data) {
        this.data = data;
    }
}

/**
 * validate form
 */
export function validateForm({
                                 data: formData,
                                 meta: formMeta,
                                 onValidate,
                                 onChange = noop
                             }) {
    return new Promise(formValidationResolve => {
        let validatingFieldCount = 0;
        let validationCancelled = false;

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
        forEachField(formMeta.fields, false, f => {
            delete f.error;
            delete f.warning;
            f.validating = false;
        });

        if (!onValidate) return;

        function updateValidationStatus(tryToTriggerMetaChange) {
            formMeta.validating = !!validatingFieldCount;

            // collect form warning/error
            forEachField(formMeta.fields, true, f => {
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

            if (
                tryToTriggerMetaChange &&
                !validationCancelled &&
                !formMeta.validating
            ) {
                formValidationResolve(formMeta);
            } else if (tryToTriggerMetaChange) {
                // update UI
                onChange(formMeta, "meta");
            }
        }

        onValidate({
            data: formData,
            meta: formMeta,
            warning(error) {
                return new FormWarning(error);
            },
            validate(field, error, isWarning) {
                return new Promise(fieldValidationResolve => {
                    if (error) {
                        // extract error from warning
                        if (error instanceof FormWarning) {
                            isWarning = true;
                            error = error.data;
                        }

                        const fieldMeta = field
                            ? view(pathToLens(field), formMeta.fields)
                            : formMeta;

                        console.log(fieldMeta, field, error);

                        if (error.then) {
                            validatingFieldCount++;

                            function done(asyncError) {
                                if (asyncError instanceof FormWarning) {
                                    isWarning = true;
                                    asyncError = asyncError.data;
                                }

                                validatingFieldCount--;
                                fieldMeta.validating = false;
                                fieldMeta[isWarning ? "warning" : "error"] = asyncError;
                                fieldValidationResolve(!asyncError);
                                updateValidationStatus(true);
                            }

                            error.then(done, done);
                        } else {
                            fieldMeta[isWarning ? "warning" : "error"] = error;
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
function formSubmitWrapper(formData,
                           {onChange, onSubmit, onValidate, ...formMeta}) {
    if (!onSubmit) return;

    if (formData.validateOnSubmit) {
        validateForm({
            data: formData,
            meta: formMeta,
            onChange: newMeta => onChange(formData, newMeta, "meta"),
            onValidate
        })
            .then(newMeta => onSubmit(formData, newMeta));
    }
    else {
        onSubmit(formData, formMeta);
    }

}

/**
 * handle change and validation
 */
function formChangeWrapper(initialData,
                           formData,
                           {onChange, onSubmit, onValidate, ...formMeta},
                           changeType) {
    if (changeType === "value") {
        if (!formMeta.validateOnSubmit) {
            validateForm({
                data: formData,
                meta: formMeta,
                onChange: newMeta => onChange(formData, newMeta, "meta"),
                onValidate
            }).then(newMeta => onChange(formData, newMeta, "meta"));
        }

        if (!formMeta.initialData) {
            formMeta.initialData = initialData;
        }
    }

    onChange(formData, formMeta, changeType);
}

function forEachField(fields, deep, callback) {
    let cancel = false;

    function processField(field, name) {
        if (field.type === "field") {
            if (callback(field, name) === false) return false;
            if (deep) {
                // is field array
                if (field.items) {
                    cancel = field.items.some((sf, i) => processField(sf, i) === false);
                }
                // is sub form
                if (field.fields) {
                    cancel = forEachField(field.fields, true, callback) === false;
                }
            }
        }
    }

    forEachObjIndexed((f, n) => {
        if (cancel) return;
        cancel = processField(f, n) === false;
    }, fields);

    return !cancel;
}

export function fieldArray(options, fieldName, method, ...args) {
    let {meta: formMeta, data: formData, onChange = noop} = options;
    if (!method) {
        // create an executor for field array
        const executor = {};

        fieldArrayMethods.forEach(
            x =>
                (executor[x] = function (...args) {
                    return fieldArray(options, fieldName, x, ...args);
                })
        );
        return executor;
    }

    const fieldLens = pathToLens(fieldName);
    let value = view(fieldLens, formData);

    let fieldMeta = view(fieldLens, formMeta.fields);
    if (!fieldMeta) {
        // mutate fields, dont fire meta change event to improve performance
        formMeta.fields = set(
            fieldLens,
            (fieldMeta = {
                type: "field"
            }),
            formMeta.fields
        );
    }

    if (!(value instanceof Array)) {
        value = value === null || value === undefined ? [] : [value];
        if (!method) return value;
    } else {
        if (!method) return value;
        value = [...value];
    }

    if (!fieldMeta.items) {
        // create item meta
        fieldMeta.items = value.map(() => ({
            type: "field"
        }));
    }

    // is render
    if (method instanceof Function) {
        return value.map((item, index) => {
            function onMetaChange(subMeta) {
                fieldMeta.items = [...fieldMeta.items];
                fieldMeta.items[index] = subMeta;

                onChange(formData, formMeta, "meta");
            }

            function onValueChange(subValue) {
                const copyOfValue = [...value];
                copyOfValue[index] = subValue;
                formData = set(fieldLens, copyOfValue, formData);
                fieldMeta.dirty = true;
                formMeta.dirty = true;
                onChange(formData, formMeta, "value");
            }

            return renderField({
                name: index,
                data: value,
                render: method,
                onMetaChange,
                onValueChange,
                meta: {
                    ...fieldMeta.items[index],
                    // sub form methods
                    onSubmit(subData, subMeta) {
                        // do nothing
                    },
                    onChange(subData, subMeta, changeType) {
                        if (changeType === "meta") {
                            onMetaChange(subMeta);
                        } else if (changeType === "value") {
                            onValueChange(subData);
                        }
                    }
                }
            });
        });
    } else {
        let metaItems = [...fieldMeta.items];

        // support custom methods
        switch (method) {
            case "removeAt":
                value.splice(args[0], 1);
                metaItems.splice(args[0]);
                break;
            case "remove":
                const indexesToRemove = [];
                value = value.filter((x, i) => {
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
                metaItems.unshift(
                    ...args.map(() => ({
                        type: "field"
                    }))
                );
                value.unshift(...args);
                break;
            case "append":
            case "push":
                metaItems.push(
                    ...args.map(() => ({
                        type: "field"
                    }))
                );
                value.push(...args);
                break;
            case "move": {
                const [fromIndex, toIndex] = args;
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
            case "swap": {
                const [sourceIndex, targetIndex] = args;
                if (sourceIndex < 0 || sourceIndex >= value.length) {
                    throw new Error("sourceIndex is not valid");
                }
                if (targetIndex < 0 || targetIndex >= value.length) {
                    throw new Error("targetIndex is not valid");
                }

                if (sourceIndex === targetIndex) {
                    return;
                }

                const tempMeta = metaItems[sourceIndex];
                metaItems[sourceIndex] = metaItems[targetIndex];
                metaItems[targetIndex] = tempMeta;

                const tempItem = value[sourceIndex];
                value[sourceIndex] = value[targetIndex];
                value[targetIndex] = tempItem;
            }

                break;
            case "insert":
                let [index, ...newItems] = args;
                index = index < 0 ? 0 : index > value.length ? value.length : index;
                metaItems.splice(index, 0, ...newItems);
                value.splice(index, 0, ...newItems);
                break;
            case "removeAll":
                metaItems.splice(0, metaItems.length);
                value.splice(0, value.length);
                break;
            case "sort":
                // combine all meta/data to pair list
                const pairs = value.map((x, i) => ({
                    data: x,
                    meta: metaItems[i]
                }));
                // suport sort by expression: prop:direction
                const sortExpression =
                    typeof args[0] === "string" ? args[0].split(":") : null;
                // sort uses comparator, ascend by default
                const propSelector = sortExpression
                    ? prop(sortExpression[0])
                    : args[0] || identity;
                const inputComparator =
                    sortExpression && sortExpression.length > 1
                        ? sortExpression[1]
                        : args[1];

                const comparator =
                    inputComparator === "asc"
                        ? ascend
                        : inputComparator === "desc" ? descend : inputComparator || ascend;
                const sortedPairs = sort(
                    comparator(compose(propSelector, prop("data"))),
                    pairs
                );
                // extract meta and data
                sortedPairs.forEach((x, i) => {
                    metaItems[i] = x.meta;
                    value[i] = x.data;
                });
                break;
            default:
                throw new Error(`fieldArray does not support "${method}"`);
        }

        formData = set(fieldLens, value, formData);

        formMeta.fields = set(
            fieldLens,
            (fieldMeta = {
                ...fieldMeta,
                items: metaItems
            }),
            formMeta.fields
        );
        formMeta.dirty = true;

        onChange(formData, formMeta, "value");
    }
}

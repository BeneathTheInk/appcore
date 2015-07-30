# Appcore

This is a JavaScript application framework that allows us to maintain large, composable, isomorphic Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be separated by functionality while still sharing basic resources.

## Plugins

Here is a list of existing plugins that can be used with Appcore.

- [appcore-log](https://beneaththeink.beanstalkapp.com/appcore-log) - Adds standarized console logging methods.
- [appcore-cli](https://beneaththeink.beanstalkapp.com/appcore-cli) - A CLI tool for running Appcore apps.
- [appcore-browser](https://beneaththeink.beanstalkapp.com/appcore-browser) - A Node.js API for managing HTML5 Appcore apps.
- [appcore-router](https://beneaththeink.beanstalkapp.com/appcore-router) - Adds Express for Node.js, Page for the browser.
- [appcore-auth](https://beneaththeink.beanstalkapp.com/appcore-auth) - A generic API for authenticating users against different backends.
- [appcore-files](https://beneaththeink.beanstalkapp.com/appcore-files) - A generic API for handling file data with any kind of storage.
	- [appcore-s3](https://beneaththeink.beanstalkapp.com/appcore-s3) - An appcore-file adaptor for Amazon S3.
- [appcore-sendmail](https://beneaththeink.beanstalkapp.com/appcore-sendmail) - A generic API for sending emails.
	- [appcore-mailgun](https://beneaththeink.beanstalkapp.com/appcore-mailgun) - An appcore-sendmail adaptor for sending emails through Mailgun.
- [appcore-mongoose](https://beneaththeink.beanstalkapp.com/appcore-mongoose) - Attaches a Mongoose connection and database to the Appcore app.
- [appcore-sockets](https://beneaththeink.beanstalkapp.com/appcore-sockets) - Adds Websocket support for the browser and the server with Socket.io.

## Install

Build a UMD bundle and use via a script tag. The variable `Appcore` will be attached to `window`.

```html
<script type="text/javascript" src="appcore.js"></script>
```

```js
var app = Appcore("myapp");
```

If using Browserify or Node.js, you can install via Beneath the Ink's private Gemfury NPM registry. See [Gemfury's docs](https://gemfury.com/help/npm-registry) for details on integrating with NPM scopes.

```sh
$ npm install @beneaththeink/appcore
```

```js
var app = require("@beneaththeink/appcore")("myapp");
```

## Usage

To begin, make a new application instance by passing in a name.

```js
var app = Appcore("myapp");
```

Appcore only helps to maintain large application infrastructure and makes no assumptions about the types of things an application might be doing. Appcore requires all functionality to be "adapted" through plugins so it can maintain compatibility with the rest of the system. Fortunately, plugins are easy to add:

```js
// plugins are functions
app.use(function() {
	console.log("This is my plugin!");
});

// or other apps
app.use(Appcore("myotherapp"));
```

Every app has a life-cycle, maintained through a series of states, starting with boot and ending when the app is fully running. Applications always want to enter the next state and will automatically do so unless prevented by a plugin using the `wait()` method. In this way, app functionality can be initiated asynchronously, without interference from other plugins. The only exception to this is the `FAIL` and `RUNNING` states which remain indefinitely.

An app has a total of 4 executing states and one error state, `FAIL`. An app will only enter the failing state if it hasn't reached the `RUNNING` state. After the running state, errors are handled as normal. Here is the order states are performed in:

```txt
PREBOOT -> STARTUP -> READY -> RUNNING
```

Applications are started immediately in the `PREBOOT` state. The `.use()` method will execute plugins when the app enters the `STARTUP` state, at least one tick later. As a plugin, you can listen for future state by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states have the equivalent methods.

```js
// log when app is ready
app.ready(function() {
	console.log("My plugin is ready!");
});

// above is the equivalent of
app.startup(function() {
	app.ready(function() {
		console.log("My plugin is ready!");
	});
});
```

As a plugin, you can prevent the app from moving to the next state by using `app.wait()` to create a wait method that can be used asynchronously. In the below example, the `.next()` function will not be called until the async task is finished.

```js
app.use(function() {
	doSomethingAsync(app.wait(function(err) {
		// app enters FAIL state
		if (err) return app.error(err);

		// or app continues
		console.log("did something async.");
	}));

	// log on the next state, READY
	app.next(function() {
		console.log("app has entered the next state!");
	});
});
```

Once an application is constructed it will continue running until told not to. Make sure to apply all configuration before the `STARTUP` state, so plugins get the correct information when run.

```js
// guaranteed to run before plugins
app.preboot(function() {
	// applied synchronously
	app.set("myplugin", { do: "something" });

	// or asynchronously
	getAsyncConfig(app.wait(function(err, config) {
		if (err) return app.error(err);
		app.set(config);
	}));
});

// will wait until async config has loaded
app.use(function() {
	var options = app.get("myplugin");
});
```

Application can be created as classes, so they can be extended and reused. Use the `.create()` or `.extend()` methods:

```js
var Subapp = Appcore.create("my app", function(options) {
	this.set(options);
	this.use(function() {
		console.log("A custom application.");
	});
});

var app = Subapp({ init: "config" });
```

## API

### Appcore([ name ])

Creates a new appcore instance and immediately puts it into the `PREBOOT` state.

Applications created with this method are "plain" in that they are configured using the default method. This default sets the `name` as the application's name. If you use `.create()` or set a `configure()` method, you can decide what to do with the arguments passed to the app.

```js
var app = Appcore("myapp");
```

### Appcore.create([ name, ] configure[, instanceProps[, classProps ]])

Creates an appcore subclass. This is useful when creating an app that needs to used many times in the same environment.

- `name` - Applications created with this subclass will have this name. This is optional.
- `configure` - The app's initialization method. This is run as soon as an instance is made, but after the app has entered the preboot state. Arguments passed to the constructor are forwarded to this method.
- `instanceProps` - An object of properties to attach to the subclass's prototype.
- `classProps` - An object of properties to attach to directly to the subclass.

```js
// a subclass
var MyApp = Appcore.create("myapp", function(options) {
	this.set(options);
}, {
	foo: function() {
		return this.get("foo");
	}
});

// make any number of copies
var app1 = MyApp({ foo: "bar" });
var app2 = MyApp({ foo: true });

// call your custom method
app1.foo(); // "bar"
app2.foo(); // true
```

### app.use(plugin[, arguments ... ])

Adds a plugin to an application. The plugin should be a function, an Appcore class or an Appcore instance. Arguments are passed through to the plugin. Function plugins are called with the application as context.

Plugins are only run immediately if the application has reached the `STARTUP` state. Since applications start in `PREBOOT`, plugins are usually not run until at least a tick later. This allows the app to be configured asynchronously, before all the plugins.

Plugins generally add functionality to an app. Sometimes this leads to conflicts since plugins can be used more than once on the same application. To prevent conflicts, add a small self-awareness check at the start of the plugin.

```js
app.use(function() {
	// check if the variable already exists
	if (this.myfn) return;

	// add the custom functionality
	this.myfn = function(){};
});
```

### app.onState(state, fn)

Calls the function `fn` when the app is at or past the specified state. `state` can be the string name of the state, or the integer value.

Apps run states in the following order. There is also a `FAIL` state that the app can enter at anytime by calling the `app.error()` method.

```txt
PREBOOT -> STARTUP -> READY -> RUNNING
```

This method is a little different from the emitted state events in that it operates with recursive eventing. Instead of listening for the exact state needed, `onState()` listens for the next state and checks if it is the state needed. If so, `fn` is called, otherwise it repeats the process by listening for the next state. This is very important because it leads to consistent ordering of events.

Let's demonstrate recursive eventing with two examples, one that uses `.once()` and one that uses `.onState()`.

```js
this.once("state:startup", function() {
	this.once("state:ready", function() {
		console.log("called second")
	});
});

this.once("state:ready", function() {
	console.log("called first");
});
```

When using the emitted events, the second `state:ready` event is called before the first one because of the order they end up running in. Using these methods can lead to code that is hard to reason about.

```js
this.onState("startup", function() {
	this.onState("ready", function() {
		console.log("called first")
	});
});

this.onState("ready", function() {
	console.log("called second");
});
```

The `onState()` method fixes this by forcing the order they are declared in to be the order they are run.

### app.preboot(fn)

Alias for `app.onState("preboot", fn)`.

### app.startup(fn)

Alias for `app.onState("startup", fn)`.

### app.ready(fn)

Alias for `app.onState("ready", fn)`.

### app.running(fn)

Alias for `app.onState("running", fn)`.

### app.fail(fn)

Alias for `app.onState("fail", fn)`.

### app.next(fn)

Calls function `fn` on the next state. If the app is at the `RUNNING` state, `fn` will never be called. This is an alias for `app.onState(app.state + 1, fn)`.

### app.wait([ fn ])

Prevents the app from moving to the next state. A function is returned that must be called to release the lock. The app will wait for all existing `wait()` calls and will not proceed to the next state until all of the locks are released.

The wait method accepts a callback function that is called when the lock release function is called. In this way it can act as a wrapper around an asynchronous callback. The callback is called before the app moves to the next state, allowing for further `wait()` calls.

The example below demonstrates how to use the `wait()` method to load configuration asynchronously.

```js
var fs = require("fs");

// run on preboot, before plugins run
app.preboot(function() {
	fs.readFile("./config.json", {
		encoding: "utf-8"
	}, app.wait(function(err, data) {
		// pass error to app so it enters failing state
		if (err) return app.error(err);

		// load the configuration
		app.set(JSON.parse(data));
	}));
});
```

### app.error(err)

Let's the app know that something has gone wrong. `err` can be any kind of error and is added to an internal `app._error` array. The app will emit an `error` event, but will not crash the program. If the app has not reached the `RUNNING` state yet, the app is put into the `FAIL` state on the next state change.

Use [appcore-log](https://beneaththeink.beanstalkapp.com/appcore-log) to log errors passed to this method.

### app.syncState(otherApp)

Syncs state between `app` and `otherApp`. This makes it so that `app` will never enter a state until `otherApp` has reached that same state. This is mostly used to sync states between nested applications.

### app.get([ key ])

Retrieves a value stored in the application's internal configuration by key. `key` can be any complex path string, with parts separated by periods.

```js
app.get();
app.get("mykey");
app.get("foo.bar.baz");
```

### app.set([ key, ] value)

Sets `value` at `key` in the application configuration. If both the existing value at the key and `value` are plain objects, `value` is copied onto the existing object. Otherwise the `value` replaces whatever was there.

```js
app.set({ foo: { bar: true });
app.set("foo", { hello: "world" });
app.get("foo"); // { bar: true, hello: "world" }
```

### app.reset([ key, ] value)

Sets `value` at `key` in the application configuration. This is slightly different from `set()` in that no merging takes place, `value` will be the absolute value at `key`.

```js
app.reset({ foo: { bar: true });
app.reset("foo", { hello: "world" });
app.get("foo"); // { hello: "world" }
```

### app.defaults([ key, ] value)

Sets `value` at `key` in the application configuration if and only if the existing value is undefined. This is like `set()` in that plain objects are merged.

```js
app.defaults({ foo: { bar: true });
app.defaults("foo", { bar: "baz" });
app.get("foo"); // { bar: true }
```

### app.unset([ key ])

Sets the value at `key` to undefined.

```js
app.set({ foo: { bar: true });
app.unset("foo");
app.get("foo"); // undefined
```

### app.getBrowserOptions()

Gets the browser safe configuration.

Generally there is configuration on your server that shouldn't be leaked to the client, things like passwords and secrets. To combat this, configuration must be explicitly whitelisted in order to be returned from this method. This can happen in two ways, adding a key to `browserKeys` or by setting a value within `browserOptions`.

```js
app.set("browserKeys", [ "public", "env" ]);
app.set("public", { foo: "bar" });
app.set("browserOptions.hello", "world");
app.getBrowserOptions(); // { public: { foo: "bar" }, env: "development", hello: "world" }
```

### app.setBrowserOption([ key, ] value)

Sets `value` at `key` in `browserOptions`. This is sugar for `app.set("browserOptions", value)`.

```js
app.setBrowserOption("hello", "world");
app.getBrowserOptions(); // { env: "development", hello: "world" }
```

### Instance Properties

These properties can be found on all app instances. Besides `app.name`, all properties are non-modifiable.

- `app.name` - The application's generic name. This can be set on the prototype or assigned directly.
- `app.fullname` - The application's full name, including all parent application names.
- `app.env` - The app environment as set in the configuration. By default this is `process.env.NODE_ENV`, however it can be set with `app.set("env", "production")`.
- `app.cwd` - The app's current working directory. By default this is `process.cwd()`, but it can be set with `app.set("cwd", "/my/path")`.
- `app.isRoot` - Whether or not the app has any parents.
- `app.isServer` - Whether or not the app is running on the server.
- `app.isClient` - Whether or not the app is running in a browser.

## Building A UMD Bundle

Grunt is used to build a Browserify bundle from the original source found in `lib/`. When the command below completes, the compiled and minified source will be saved to `dist/` directory. These files can be used with most JavaScript interpreters such as Node.js and browsers.

	$ npm run prepublish

## Testing

We have written several unit tests for Appcore. If you find a bug or add a feature, please add a few tests to the `test/` folder. Run the command below to test Appcore on your machine:

	$ npm test

You can also run the tests in your browser. You should have [browser-run](http://ghub.io/browser-run) and [browserify](http://ghub.io/browserify) installed globally.

	$ browserify test/* | browser-run -b chrome

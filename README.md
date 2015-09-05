# Appcore

This is a JavaScript application framework that allows us to maintain large, composable, isomorphic Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be separated by functionality while still sharing basic resources.

## Plugins

Here is a list of existing plugins that can be used with Appcore.

- [appcore-log](https://beneaththeink.beanstalkapp.com/appcore-log) - Adds standarized console logging methods.
- [appcore-config](https://beneaththeink.beanstalkapp.com/appcore-config) - Pulls in configuration from the cli and env.
- [appcore-router](https://beneaththeink.beanstalkapp.com/appcore-router) - Adds Express for Node.js, Page for the browser.
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
var app = Appcore({ name: "myapp" });
```

If using Browserify or Node.js, you can install via Beneath the Ink's private Gemfury NPM registry. See [Gemfury's docs](https://gemfury.com/help/npm-registry) for details on integrating with NPM scopes.

```sh
$ npm install @beneaththeink/appcore
```

```js
var app = require("@beneaththeink/appcore")({ name: "myapp" });
```

## Usage

To begin, make a new application instance. You can optionally pass in base configuration.

```js
var app = Appcore({ name: "myapp" });
```

Appcore only helps to maintain large application infrastructure and makes no assumptions about the types of things an application might be doing. Appcore requires all functionality to be "adapted" through plugins so it can maintain compatibility with the rest of the system. Fortunately, plugins are easy to add:

```js
// plugins are functions
app.use(function() {
	console.log("This is my plugin!");
});

// or other apps
app.use(Appcore({ name: "myotherapp" }));
```

Every app has a life-cycle, maintained through a series of states, beginning at startup and ending when the app is fully running. Applications always want to enter the next state and will automatically do so unless prevented by a plugin using the `wait()` method. In this way, app functionality can be initiated asynchronously, without interference from other plugins.

An app has a total of three executing states and one error state. An app will only enter the error state if it hasn't reached the final executing state. After the final state, errors are handled as normal. Here is the order states are performed in:

	STARTUP --> READY --> RUNNING

You can listen for future state by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states have the equivalent methods.

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

Once an application is constructed it will continue running until told not to. Make sure to apply all configuration before using plugins, since they are executed synchronously.

```js
// set some configuration
app.set("myplugin", { do: "something" });

// add plugin that uses the config
app.use(function() {
	var options = app.get("myplugin");
});
```

Application can be created as classes, so they can be extended and reused. This makes Appcore useful as a API format.

```js
var Subapp = Appcore.create(function(options) {
	this.defaults({ name: "myapp" })
	this.set(options);
	this.use(function() {
		console.log("A custom application.");
	});
});

var app = Subapp();
```

## API

### Appcore([ options ])

Creates a new appcore instance and immediately puts it into the `STARTUP` state.

Applications created with this method are "plain" in that they are configured using the default method, which sets the first argument as the base options on the applicaiton. If you use `.create()` or set a `configure()` method, you can decide what to do with the arguments passed to the app.

```js
var app = Appcore({ name: "myapp" });
```

### Appcore.create(configure[, instanceProps[, classProps ]])

Creates an appcore subclass. This is useful when creating an app that needs to used many times in the same environment.

- `configure` - The app's initialization method. This is run as soon as an instance is made, but after the app has entered the startup state. Arguments passed to the constructor are forwarded to this method.
- `instanceProps` - An object of properties to attach to the subclass's prototype.
- `classProps` - An object of properties to attach to directly to the subclass.

```js
// a subclass
var MyApp = Appcore.create(function(options) {
	this.defaults({ name: "myapp" });
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

### app.use([ plugin [, ... ]])

Adds any number of plugins to an application. The plugin should be a function or an Appcore instance. Function plugins are called with the application as context.

Plugins are technically run on the `STARTUP` state. Since apps begin in startup, plugins are usually run immediately and synchronously.

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
STARTUP -> READY -> RUNNING
```

This method is a little different from the emitted state events in that it operates with recursive eventing. Instead of listening for the exact state needed, `onState()` listens for the next state and checks if it is the state needed. If so, `fn` is called, otherwise it repeats the process by listening for the next state. This is very important because it leads to consistent ordering of events.

Let's demonstrate recursive eventing with two examples, one that uses `.once()` and one that uses `.onState()`.

```js
this.once("state:ready", function() {
	this.once("state:running", function() {
		console.log("first")
	});
});

this.once("state:running", function() {
	console.log("second");
});

// Prints:
// > second
// > first
```

When using the emitted events, the second `state:running` event is called before the first one because of the order they end up running in. Using these methods can lead to code that is hard to reason about.

```js
this.onState("ready", function() {
	this.onState("running", function() {
		console.log("first")
	});
});

this.onState("running", function() {
	console.log("second");
});

// Prints:
// > first
// > second
```

The `onState()` method fixes this by forcing the order they are declared in to be the order they are run.

### app.startup(fn)

Alias for `app.onState("startup", fn)`.

### app.ready(fn)

Alias for `app.onState("ready", fn)`.

### app.running(fn)

Alias for `app.onState("running", fn)`.

### app.fail(fn)

Alias for `app.onState("fail", fn)`.

### app.next(fn)

Calls function `fn` when the app reaches the next state. If the app is at the `RUNNING` or `FAIL` state, `fn` will never be called.

### app.wait([ fn ])

Prevents the app from moving to the next state. A function is returned that must be called to release the lock. The app will wait for all existing `wait()` calls and will not proceed to the next state until all of the locks are released.

The wait method accepts a callback function that is called when the lock release function is called. In this way it can act as a wrapper around an asynchronous callback. The callback is called before the app moves to the next state, allowing for further `wait()` calls.

```js
var fs = require("fs");

// wait on data to arrive
app.startup(function() {
	fs.readFile("./data.json", {
		encoding: "utf-8"
	}, app.wait(function(err, data) {
		// pass error to app so it enters failing state
		if (err) return app.error(err);

		// load the configuration
		app.data = JSON.parse(data);
	}));
});

// won't be called until after data is on app
app.ready(function() {
	console.log(app.data);
});
```

### app.error(err)

Let's the app know that something has gone wrong. `err` can be any kind of error and is added to an internal `app.errors` array.

The app will emit an `error` event with the error. This means that if there are no error listeners, the error is thrown and has the potential to crash the application.

If the app has not reached the `RUNNING` state yet, the app is put into the `FAIL` state on the next state change. Like the running state, the fail state non-recoverable.

Use [appcore-log](https://beneaththeink.beanstalkapp.com/appcore-log) to log errors passed to this method, instead of throwing them.

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

__Note:__ Appcore default options cannot be unset, since they are not properties of the application's options. Therefore something like the following will fail silently. Instead, set the value to `null`.

```js
app.unset("env");
app.get("env"); // "development"

app.set("env", null);
app.get("env"); // null
```

### app.getBrowserOptions()

Gets browser safe configuration.

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

These properties can be found on all app instances. All properties are immutable.

- `app.env` - The app environment as set in the configuration. By default this is `process.env.NODE_ENV`, however it can be set with `app.set("env", "production")`.
- `app.cwd` - The app's current working directory. By default this is `process.cwd()`, but it can be set with `app.set("cwd", "/my/path")`.
- `app.isRoot` - Whether or not the app has any parents.
- `app.isServer` - Whether or not the app is running on the server.
- `app.isClient` - Whether or not the app is running in a browser.

## Building A UMD Bundle

Grunt is used to build a Browserify bundle from the original source found in `lib/`. When the command below completes, the compiled and minified source will be saved to `dist/` directory. These files can be used with most JavaScript interpreters such as Node.js and browsers.

	$ npm run build

## Testing

We have written several unit tests for Appcore. Run the command below to test Appcore on your machine:

	$ npm test

You can also run the tests in your browser. Run the command below and point your browser to <http://localhost:8000>.

	$ npm run test-browser

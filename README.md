# Appcore

This is a JavaScript application framework that allows us to maintain large, composable Node.js and Browser applications. It maintains a flexible, plugin-driven API that allows components to be separated by functionality while still sharing basic resources.

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
app.use(function() {
	app.log("This is my plugin!");
});

// everything is a plugin, even other apps
app.use(Appcore("myotherapp"));
```

Every app has a life-cycle, maintained through a series of states, starting with boot and ending when the app is fully running. Applications always want to enter the next state and will automatically do so unless prevented by a plugin using the `wait()` method. In this way, app functionality can be initiated asynchronously, without interference from other plugins. The only exception to this is the `FAIL` and `RUNNING` states which remain indefinitely.

An app has a total of 4 executing states and one error state, `FAIL`. An app will only enter the failing state if it hasn't reached the `RUNNING` state. After the running state, errors are handled as normal. Here is the order events are performed in:

```txt
PREBOOT -> STARTUP -> READY -> RUNNING
```

Applications are started immediately in the `PREBOOT` state. The `.use()` method will execute plugins when the app enters the `STARTUP` state, at least one tick later. As a plugin, you can listen for future state by using the quick methods of the same name. These methods are special in that if the app is already at that state or later, the function is executed immediately. All the states have the equivalent methods.

```js
app.use(function() {
	app.ready(function() {
		app.log("My plugin is ready!");
	});
});
```

As a plugin, you can prevent the app from moving to the next state by using `app.wait()` to create a wait method that can be used asynchronously. In the below example, the `.next()` function will not be called until the async task is finished.

```js
app.use(function() {
	doSomethingAysnc(app.wait(function(err) {
		// app enters FAIL state
		if (err) return app.error(err);

		// or app continues
		app.log("did something async.");
	}));

	// log on the next state, READY
	app.next(function() {
		app.log("app has entered the next state!");
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
		this.log("A custom application.");
	});
});

var app = Subapp({ init: "config" });
```

## Building A UMD Bundle

Grunt is used to build a Browserify bundle from the original source found in `lib/`. When the command below completes, the compiled source will be saved to `dist/` directory.

	$ npm install && grunt

If you don't the Grunt cli tools installed globally, run `npm install -g grunt-cli` before running that command.
